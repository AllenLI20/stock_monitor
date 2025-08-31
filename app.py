import logging
from logging.handlers import RotatingFileHandler
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool

from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

from dotenv import load_dotenv
import akshare as ak
import pandas as pd
from tenacity import retry, stop_after_attempt, wait_exponential, before_log, wait_fixed

import asyncio
import schedule
import time
import threading
import os

# 配置日志
logging.basicConfig(
    level=logging.INFO,  # 改为WARNING级别，减少日志输出
    format='%(asctime)s - %(levelname)s - %(filename)s - %(lineno)d - %(message)s',
    # 限制日志文件大小
    handlers=[
        RotatingFileHandler('logs/backend.log', maxBytes=10*1024*1024, backupCount=5),  # 文件输出
        # Removed logging.StreamHandler() to prevent console output
    ]
)

full_market_update_status = {
    "A股": {"status": "空闲", "message": "未开始", "progress": 0},
    "H股": {"status": "空闲", "message": "未开始", "progress": 0},
    "美股": {"status": "空闲", "message": "未开始", "progress": 0},
    "overall": {"status": "空闲", "message": "未开始", "progress": 0}
}

BATCH_SIZE = 100

load_dotenv()

app = FastAPI(
    title="股票估值分析系统",
    description="基于FastAPI的股票估值分析系统，支持自动获取股票数据",
    version="1.0.0",
    # 性能优化配置
    docs_url=None,  # 生产环境禁用文档
    redoc_url=None,  # 生产环境禁用文档
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://43.143.50.170:8980",
        "http://43.143.50.170:3000",
        "http://43.143.50.170:5005",
        "http://43.143.50.170:5006",
        "http://dashboard.tonghe.site:8980", # 添加新的域名来源
        "http://dashboard.tonghe.site:5005", # 添加新的域名来源
        "http://dashboard.tonghe.site:3000", # 添加新的域名来源
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"], # 暴露 X-Total-Count 头部
)

SQLALCHEMY_DATABASE_URL = "sqlite:///./stock_valuation.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    # 数据库连接池优化
    pool_pre_ping=True,
    pool_recycle=3600,  # 1小时后回收连接
    echo=False  # 关闭SQL日志
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Models
class Stock(Base):
    __tablename__ = "stocks"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    market = Column(String, nullable=False)
    book_value_per_share = Column(Float)
    roe = Column(Float)
    perpetual_growth_rate = Column(Float, default=0.03)
    required_return_rate = Column(Float, default=0.10)
    current_pe = Column(Float)
    calculated_pe_lower = Column(Float)
    calculated_pe_upper = Column(Float)
    theoretical_price_lower = Column(Float)
    theoretical_price_upper = Column(Float)
    current_price = Column(Float)
    market_cap = Column(Float)
    volume = Column(Float)
    change_percent = Column(Float)
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    auto_update = Column(Boolean, default=True)
    calculated_pe_mid = Column(Float)
    theoretical_price_mid = Column(Float)

class WholeMarketStock(Base):
    __tablename__ = "whole_market_stocks"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    market = Column(String, nullable=False)
    current_price = Column(Float)
    change_percent = Column(Float)
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_watchlist = Column(Boolean, default=False)

Base.metadata.create_all(bind=engine)

# Pydantic Models
class StockBase(BaseModel):
    symbol: str
    name: Optional[str] = None
    market: str
    book_value_per_share: Optional[float] = None
    roe: Optional[float] = None
    perpetual_growth_rate: Optional[float] = None
    required_return_rate: Optional[float] = None
    current_pe: Optional[float] = None
    current_price: Optional[float] = None

class StockCreate(StockBase):
    pass

class StockUpdate(BaseModel):
    book_value_per_share: Optional[float] = None
    roe: Optional[float] = None
    perpetual_growth_rate: Optional[float] = None
    required_return_rate: Optional[float] = None
    current_pe: Optional[float] = None
    current_price: Optional[float] = None
    auto_update: Optional[bool] = None

class StockResponse(StockBase):
    id: int
    calculated_pe_lower: Optional[float] = None
    calculated_pe_upper: Optional[float] = None
    theoretical_price_lower: Optional[float] = None
    theoretical_price_upper: Optional[float] = None
    market_cap: Optional[float] = None
    volume: Optional[float] = None
    change_percent: Optional[float] = None
    last_updated: Optional[datetime] = None
    auto_update: bool = True
    calculated_pe_mid: Optional[float] = None
    theoretical_price_mid: Optional[float] = None

    class Config:
        from_attributes = True

class WholeMarketStockBase(BaseModel):
    symbol: str
    name: str
    market: str
    current_price: Optional[float] = None
    change_percent: Optional[float] = None
    last_updated: Optional[datetime] = None
    is_watchlist: bool = False

class WholeMarketStockResponse(WholeMarketStockBase):
    id: int

class ValuationRequest(BaseModel):
    book_value_per_share: float
    roe: float
    perpetual_growth_rate: float
    required_return_rate: float

class ValuationResponse(BaseModel):
    eps: float
    retention_ratio: float
    dividend_ratio: float
    dividend_per_share: float
    theoretical_price_lower: float
    theoretical_price_upper: float
    pe_ratio_lower: float
    pe_ratio_upper: float
    theoretical_price_mid: Optional[float] = None
    pe_ratio_mid: Optional[float] = None
    theoretical_price_exact: Optional[float] = None # New field for exact calculation
    pe_ratio_exact: Optional[float] = None # New field for exact calculation

class StockBatchItem(BaseModel):
    symbol: str
    market: str

class StockBatchCreateRequest(BaseModel):
    stocks: List[StockBatchItem]

class WatchlistUpdatePayload(BaseModel):
    market: str
    is_watchlist: bool

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# API Config
STOCK_APIS = {
    "tushare": {
        "base_url": "http://api.tushare.pro",
        "token": os.getenv("TUSHARE_TOKEN", ""),
        "enabled": True
    },
    "akshare": {
        "base_url": "https://api.akshare.xyz",
        "enabled": True
    },
    "alphavantage": {
        "base_url": "https://www.alphavantage.co/query",
        "api_key": os.getenv("ALPHAVANTAGE_API_KEY", ""),
        "enabled": True
    }
}

# Valuation logic
def calculate_valuation(book_value_per_share: float, roe: float,
                       perpetual_growth_rate: float, required_return_rate: float) -> ValuationResponse:
    pgr_values = [0.03, 0.05]
    rrr_values = [0.08, 0.15]
    all_calculated_pes = []
    all_theoretical_prices = []
    eps = book_value_per_share * roe

    mid_retention_ratio = 0.0
    mid_dividend_ratio = 0.0
    mid_dividend_per_share = 0.0
    mid_theoretical_price = 0.0
    mid_pe_ratio = 0.0

    for pgr in pgr_values:
        for rrr in rrr_values:
            if rrr <= pgr:
                continue
            retention_ratio = pgr / roe
            if retention_ratio > 1 or retention_ratio < 0:
                continue
            dividend_ratio = 1 - retention_ratio
            dividend_per_share = eps * dividend_ratio
            theoretical_price = dividend_per_share / (rrr - pgr)
            pe_ratio = theoretical_price / eps if eps != 0 else float('inf')
            all_calculated_pes.append(pe_ratio)
            all_theoretical_prices.append(theoretical_price)

    if not all_calculated_pes:
        return ValuationResponse(
            eps=round(book_value_per_share * roe, 4),
            retention_ratio=0.0,
            dividend_ratio=0.0,
            dividend_per_share=0.0,
            theoretical_price_lower=0.0,
            theoretical_price_upper=0.0,
            pe_ratio_lower=0.0,
            pe_ratio_upper=0.0
        )

    min_pe = min(all_calculated_pes)
    max_pe = max(all_calculated_pes)
    min_theoretical_price = min(all_theoretical_prices)
    max_theoretical_price = max(all_theoretical_prices)

    mid_pgr = 0.05
    mid_rrr = 0.10
    eps = book_value_per_share * roe

    if mid_rrr > mid_pgr and roe != 0 and mid_pgr / roe <= 1 and mid_pgr / roe >= 0:
        mid_retention_ratio = mid_pgr / roe
        mid_dividend_ratio = 1 - mid_retention_ratio
        mid_dividend_per_share = eps * mid_dividend_ratio
        mid_theoretical_price = mid_dividend_per_share / (mid_rrr - mid_pgr)
        mid_pe_ratio = mid_theoretical_price / eps if eps != 0 else float('inf')

    # Calculate valuation based on exact user inputs
    exact_theoretical_price = None
    exact_pe_ratio = None

    if required_return_rate > perpetual_growth_rate and roe != 0:
        exact_retention_ratio = perpetual_growth_rate / roe
        if 0 <= exact_retention_ratio <= 1:
            exact_dividend_ratio = 1 - exact_retention_ratio
            exact_dividend_per_share = eps * exact_dividend_ratio
            exact_theoretical_price = exact_dividend_per_share / (required_return_rate - perpetual_growth_rate)
            exact_pe_ratio = exact_theoretical_price / eps if eps != 0 else float('inf')

    return ValuationResponse(
        eps=round(eps, 4),
        retention_ratio=round(mid_retention_ratio, 4),
        dividend_ratio=round(mid_dividend_ratio, 4),
        dividend_per_share=round(mid_dividend_per_share, 4),
        theoretical_price_lower=round(min_theoretical_price, 4),
        theoretical_price_upper=round(max_theoretical_price, 4),
        pe_ratio_lower=round(min_pe, 4),
        pe_ratio_upper=round(max_pe, 4),
        theoretical_price_mid=round(mid_theoretical_price, 4),
        pe_ratio_mid=round(mid_pe_ratio, 4),
        theoretical_price_exact=round(exact_theoretical_price, 4) if exact_theoretical_price is not None else 0.0,
        pe_ratio_exact=round(exact_pe_ratio, 4) if exact_pe_ratio is not None else 0.0
    )

# Stock data fetching
async def fetch_stock_data_akshare(symbol: str, market: str) -> Dict[str, Any]:
    return await run_in_threadpool(_fetch_stock_data_akshare_sync, symbol, market)

def _fetch_stock_data_akshare_sync(symbol: str, market: str) -> Dict[str, Any]:
    try:
        market_data = {}
        df = pd.DataFrame()

        if market == "A股" or market == "H股" or market == "美股": # Unified to use ak.stock_individual_spot_xq
            logging.info(f"尝试使用 ak.stock_individual_spot_xq 获取 {market} {symbol} 数据...")
            df = ak.stock_individual_spot_xq(symbol=symbol)
            if not df.empty:
                data = df.set_index('item').to_dict()['value']
                try:
                    market_data["current_price"] = float(data.get('现价')) if data.get('现价') is not None else 0.0
                    market_data["change_percent"] = float(data.get('涨幅')) if data.get('涨幅') is not None else 0.0
                    market_data["volume"] = float(data.get('成交量')) if data.get('成交量') is not None else 0.0
                    market_data["market_cap"] = (float(data.get('流通值')) / 100000000) if data.get('流通值') is not None else 0.0 # 转换为亿元
                    market_data["name"] = data.get('名称', symbol)
                    current_pe_ttm = data.get('市盈率(TTM)')
                    current_pe_dong = data.get('市盈率(动)')
                    current_pe = None
                    if current_pe_ttm is not None:
                        current_pe = float(current_pe_ttm)
                    elif current_pe_dong is not None:
                        current_pe = float(current_pe_dong)
                    market_data["current_pe"] = current_pe
                    eps_val = data.get('每股收益')
                    market_data["eps"] = float(eps_val) if eps_val is not None else 0.0
                    bvps_val = data.get('每股净资产')
                    market_data["book_value_per_share"] = float(bvps_val) if bvps_val is not None else 0.0
                    market_data["roe"] = (market_data["eps"] / market_data["book_value_per_share"]) if market_data["book_value_per_share"] else 0.0
                except Exception as e:
                    logging.error(f"解析 {market} {symbol} 数据失败: {e}")
                    return {}
            else:
                logging.warning(f"尝试使用 ak.stock_individual_spot_xq 未找到 {market} {symbol} 的数据。")
                return {}

        return market_data
    except Exception as e:
        logging.error(f"获取股票数据失败 {symbol} ({market}): {e}")
    return {}

async def update_full_market_data_by_market(market_type: str, db: Session):
    global full_market_update_status
    current_market_status = full_market_update_status[market_type]
    current_market_status["status"] = "进行中"
    current_market_status["message"] = f"开始更新 {market_type} 股票基本信息..."
    current_market_status["progress"] = 0
    full_market_update_status[market_type] = current_market_status

    logging.info(f"开始更新 {market_type} 股票基本信息...")
    try:
        df = pd.DataFrame()
        if market_type == "A股":
            current_market_status["message"] = "正在获取A股股票数据..."
            current_market_status["progress"] = 5
            logging.info("正在获取A股股票数据... (使用 ak.stock_zh_a_spot())")
            try:
                def get_a_stocks_with_retry_sync():
                    return ak.stock_zh_a_spot()
                df = await run_in_threadpool(get_a_stocks_with_retry_sync)
            except Exception as e:
                logging.error(f"多次尝试获取A股股票数据失败: {e}")
                current_market_status["status"] = "失败"
                current_market_status["message"] = f"获取A股股票数据失败: {e}"
                current_market_status["progress"] = -1
                return
        elif market_type == "H股":
            current_market_status["message"] = "正在获取H股股票数据..."
            current_market_status["progress"] = 5
            logging.info("正在获取H股股票数据...")
            try:
                def get_h_stocks_with_retry_sync():
                    return ak.stock_hk_spot()
                df = await run_in_threadpool(get_h_stocks_with_retry_sync)
            except Exception as e:
                logging.error(f"多次尝试获取H股股票数据失败: {e}")
                current_market_status["status"] = "失败"
                current_market_status["message"] = f"获取H股股票数据失败: {e}"
                current_market_status["progress"] = -1
                return
        elif market_type == "美股":
            current_market_status["message"] = "正在获取美股股票数据..."
            current_market_status["progress"] = 5
            logging.info("正在获取美股股票数据...")
            try:
                def get_us_stocks_with_retry_sync():
                    return ak.stock_us_spot()
                df = await run_in_threadpool(get_us_stocks_with_retry_sync)
            except Exception as e:
                logging.error(f"多次尝试获取美股股票数据失败: {e}")
                current_market_status["status"] = "失败"
                current_market_status["message"] = f"获取美股股票数据失败: {e}。请检查 `akshare` 美股接口是否可用。"
                current_market_status["progress"] = -1
                return
        else:
            raise HTTPException(status_code=400, detail="不支持的市场类型")

        if df.empty:
            logging.warning(f"获取{market_type}股票数据失败，返回为空。")
            current_market_status["status"] = "失败"
            current_market_status["message"] = f"获取{market_type}股票数据失败，返回为空"
            current_market_status["progress"] = -1
            return
        logging.info(f"获取到所有{market_type}股票数量: {len(df)}")
        logging.info(f"{market_type}数据帧列名: {df.columns.tolist()}")

        current_market_status["message"] = f"开始处理 {len(df)} 只{market_type}股票..."
        logging.info(f"开始处理 {len(df)} 只{market_type}股票...")
        for i, (_, row) in enumerate(df.iterrows()):
            symbol = ""
            name = ""

            if market_type == "H股":
                name = row.get('中文名称') or row.get('名称') or str(row['代码'])
                symbol = str(row['代码']) # H股的代码是 '代码'
            elif market_type == "美股":
                name = row.get('cname') or row.get('name', "")
                symbol = str(row['symbol']) # 美股的代码是 'symbol'
            else: # A股
                name = row['名称']
                symbol = str(row['代码']) # A股的代码是 '代码'

            if not symbol:
                logging.warning(f"跳过无股票代码的行: {row.to_dict()}")
                continue

            market = market_type
            try:
                current_price = None
                change_percent = None

                if market_type == "A股":
                    current_price = row.get('最新价')
                    change_percent = row.get('涨跌幅')
                elif market_type == "H股":
                    current_price = row.get('最新价') # 再次确认H股是'最新价'
                    change_percent = row.get('涨跌幅') # 再次确认H股是'涨跌幅'
                elif market_type == "美股":
                    current_price = row.get('price')
                    change_percent = row.get('chg')

                current_price_val = float(current_price) if current_price is not None else 0.0
                change_percent_val = float(change_percent) if change_percent is not None else 0.0

                existing_stock = await run_in_threadpool(lambda: db.query(WholeMarketStock).filter(WholeMarketStock.symbol == symbol, WholeMarketStock.market == market).first())

                if existing_stock:
                    existing_stock.current_price = current_price_val
                    existing_stock.change_percent = change_percent_val
                    existing_stock.last_updated = datetime.now(timezone.utc)
                    existing_stock.name = name
                else:
                    new_whole_market_stock = WholeMarketStock(
                        symbol=symbol,
                        name=name,
                        market=market,
                        current_price=current_price_val,
                        change_percent=change_percent_val,
                        last_updated=datetime.now(timezone.utc),
                        is_watchlist=False
                    )
                    await run_in_threadpool(lambda: db.add(new_whole_market_stock))

                if (i + 1) % BATCH_SIZE == 0 or (i + 1) == len(df):
                    await run_in_threadpool(lambda: db.commit())
                    await run_in_threadpool(lambda: db.expire_all())
                    current_market_status["progress"] = 5 + int(90 * (i + 1) / len(df))
                    current_market_status["message"] = f"正在写入 {market_type} 股票数据 ({i+1}/{len(df)}), 已提交一批次。"
                    logging.info(f"已提交 {market_type} 股票数据 ({i+1}/{len(df)})，最新进度 {current_market_status['progress']}%")
                    await asyncio.sleep(0.01)
                else:
                    current_market_status["progress"] = 5 + int(90 * (i + 1) / len(df))
                    current_market_status["message"] = f"正在缓存 {market_type} 股票数据 ({i+1}/{len(df)}): {name} ({symbol})"

            except Exception as e:
                await run_in_threadpool(lambda: db.rollback())
                logging.error(f"处理{market_type}股票 {symbol} ({market}) 写入数据库失败: {e}")

        current_market_status["status"] = "完成"
        current_market_status["message"] = f"{market_type} 股票基本信息更新完成。"
        current_market_status["progress"] = 100
        logging.info(f"{market_type} 股票基本信息更新完成。")

    except Exception as e:
        await run_in_threadpool(lambda: db.rollback())
        current_market_status["status"] = "失败"
        current_market_status["message"] = f"更新 {market_type} 股票基本信息失败: {e}"
        current_market_status["progress"] = -1
        logging.error(f"更新 {market_type} 股票基本信息失败: {e}")
    finally:
        await run_in_threadpool(lambda: db.close())

async def update_full_market_data_overall():
    global full_market_update_status
    db = SessionLocal()
    try:
        full_market_update_status["overall"]["status"] = "进行中"
        full_market_update_status["overall"]["message"] = "开始更新所有市场股票基本信息..."
        full_market_update_status["overall"]["progress"] = 0
        logging.info("开始更新所有市场股票基本信息...")

        tasks = []
        for market_type in ["A股", "H股", "美股"]:
            tasks.append(asyncio.create_task(update_full_market_data_by_market(market_type, SessionLocal())))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_successful = True
        for i, result in enumerate(results):
            market_type = ["A股", "H股", "美股"][i]
            if isinstance(result, Exception):
                full_market_update_status[market_type]["status"] = "失败"
                full_market_update_status[market_type]["message"] = f"更新失败: {result}"
                full_market_update_status[market_type]["progress"] = -1
                logging.error(f"更新 {market_type} 股票基本信息子任务失败: {result}")
                all_successful = False
            elif full_market_update_status[market_type]["status"] != "完成":
                all_successful = False

        if all_successful:
            full_market_update_status["overall"]["status"] = "完成"
            full_market_update_status["overall"]["message"] = "所有市场股票基本信息更新完成。"
            full_market_update_status["overall"]["progress"] = 100
            logging.info("所有市场股票基本信息更新完成。")
        else:
            full_market_update_status["overall"]["status"] = "部分失败"
            full_market_update_status["overall"]["message"] = "部分市场股票信息更新失败，请检查日志。"
            full_market_update_status["overall"]["progress"] = 99
            logging.warning("部分市场股票信息更新失败。")

    except Exception as e:
        full_market_update_status["overall"]["status"] = "失败"
        full_market_update_status["overall"]["message"] = f"更新所有市场股票基本信息失败: {e}"
        full_market_update_status["overall"]["progress"] = -1
        logging.error(f"更新所有市场股票基本信息失败: {e}")
    finally:
        await run_in_threadpool(lambda: db.close())

async def update_watchlist_stocks():
    db = SessionLocal()
    try:
        stocks = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.auto_update == True).all())
        logging.info(f"开始定时更新 {len(stocks)} 只自选股票数据...")

        for stock in stocks:
            try:
                market_data = await fetch_stock_data_akshare(stock.symbol, stock.market)
                if market_data:
                    stock.current_price = market_data.get("current_price", stock.current_price)
                    stock.change_percent = market_data.get("change_percent", stock.change_percent)
                    stock.volume = market_data.get("volume", stock.volume)
                    stock.market_cap = market_data.get("market_cap", stock.market_cap)
                    stock.name = market_data.get("name", stock.name)
                    stock.current_pe = market_data.get("current_pe", stock.current_pe)
                    stock.roe = market_data.get("roe", stock.roe)
                    stock.book_value_per_share = market_data.get("book_value_per_share", stock.book_value_per_share)

                if all([stock.book_value_per_share, stock.roe,
                       stock.perpetual_growth_rate, stock.required_return_rate]):
                    try:
                        valuation = calculate_valuation(
                            stock.book_value_per_share, stock.roe,
                            stock.perpetual_growth_rate, stock.required_return_rate
                        )
                        stock.calculated_pe_lower = valuation.pe_ratio_lower
                        stock.calculated_pe_upper = valuation.pe_ratio_upper
                        stock.theoretical_price_lower = valuation.theoretical_price_lower
                        stock.theoretical_price_upper = valuation.theoretical_price_upper
                        stock.calculated_pe_mid = valuation.pe_ratio_mid
                        stock.theoretical_price_mid = valuation.theoretical_price_mid
                    except ValueError:
                        pass

                stock.last_updated = datetime.now(timezone.utc)
                await run_in_threadpool(lambda: db.commit())
                await run_in_threadpool(lambda: db.refresh(stock))
                logging.info(f"股票 {stock.symbol} ({stock.market}) 数据更新成功。")
            except Exception as e:
                await run_in_threadpool(lambda: db.rollback())
                logging.error(f"更新股票 {stock.symbol} ({stock.market}) 失败: {e}")
        await run_in_threadpool(lambda: db.commit())
        logging.info(f"定时更新完成，共更新 {len(stocks)} 只股票")

    except Exception as e:
        await run_in_threadpool(lambda: db.rollback())
        logging.error(f"批量更新自选股票失败: {e}")
    finally:
        await run_in_threadpool(lambda: db.close())

def run_scheduler():
    schedule.every(60).minutes.do(lambda: asyncio.run(update_watchlist_stocks()))  # 改为每60分钟
    schedule.every().day.at("02:00").do(lambda: asyncio.run(update_full_market_data_overall()))
    while True:
        schedule.run_pending()
        time.sleep(120)  # 改为每2分钟检查一次

@app.on_event("startup")
async def startup_event():
    logging.info("Backend startup event triggered.")
    scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
    scheduler_thread.start()
    logging.info("定时任务已启动")
    logging.info("定时任务调度器已启动，等待指定时间执行全市场股票基本信息自动更新任务。")

# API Routes
@app.get("/")
async def root():
    return {"message": "股票估值分析系统API", "version": "1.0.0"}

@app.get("/stock_api/stocks", response_model=List[StockResponse])
async def get_stocks(
    response: Response, # Add Response here
    skip: int = 0,
    limit: int = 100,
    search_query: Optional[str] = None, # Add search_query parameter
    market: Optional[str] = None,       # Add market parameter
    valuation_status: Optional[str] = None, # Add valuation_status parameter
    db: Session = Depends(get_db)
):
    query = db.query(Stock)

    if search_query:
        query = query.filter(Stock.name.contains(search_query) | Stock.symbol.contains(search_query))

    if market:
        query = query.filter(Stock.market == market)

    # Handle valuation_status filter
    if valuation_status:
        if valuation_status == "低估":
            query = query.filter(Stock.current_pe < Stock.calculated_pe_lower)
        elif valuation_status == "合理":
            query = query.filter(Stock.current_pe >= Stock.calculated_pe_lower, Stock.current_pe <= Stock.calculated_pe_upper)
        elif valuation_status == "高估":
            query = query.filter(Stock.current_pe > Stock.calculated_pe_upper)
        elif valuation_status == "数据缺失":
            query = query.filter(Stock.current_pe == None, Stock.calculated_pe_lower == None, Stock.calculated_pe_upper == None)
        else:
            raise HTTPException(status_code=400, detail="无效的估值状态筛选器")

    total_stocks = await run_in_threadpool(lambda: query.count()) # Get total count
    response.headers["X-Total-Count"] = str(total_stocks) # Set X-Total-Count header

    stocks = await run_in_threadpool(lambda: query.order_by(Stock.last_updated.desc()).offset(skip).limit(limit).all())
    return stocks

@app.get("/stock_api/whole_market_stocks", response_model=List[WholeMarketStockResponse])
async def get_whole_market_stocks(
    response: Response,
    skip: int = 0,
    limit: int = 100,
    market: Optional[str] = None,
    is_watchlist: Optional[bool] = None,
    search_query: Optional[str] = None,
    sort_field: Optional[str] = None,
    sort_order: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(WholeMarketStock)
    if market:
        query = query.filter(WholeMarketStock.market == market)
    if is_watchlist is not None:
        query = query.filter(WholeMarketStock.is_watchlist == is_watchlist)
    if search_query:
        query = query.filter(WholeMarketStock.name.contains(search_query) | WholeMarketStock.symbol.contains(search_query))

    total_stocks = await run_in_threadpool(lambda: query.count())
    response.headers["X-Total-Count"] = str(total_stocks)

    if sort_field:
        if sort_order == "desc":
            query = query.order_by(getattr(WholeMarketStock, sort_field).desc())
        else:
            query = query.order_by(getattr(WholeMarketStock, sort_field).asc())
    else:
        query = query.order_by(WholeMarketStock.last_updated.desc())

    whole_market_stocks = await run_in_threadpool(lambda: query.offset(skip).limit(limit).all())
    return whole_market_stocks

@app.put("/stock_api/whole_market_stocks/{symbol}/watchlist", response_model=WholeMarketStockResponse)
async def update_stock_watchlist_status(
    symbol: str,
    background_tasks: BackgroundTasks,
    payload: WatchlistUpdatePayload,
    db: Session = Depends(get_db)
):
    market = payload.market
    is_watchlist = payload.is_watchlist
    try:
        whole_market_stock = await run_in_threadpool(lambda: db.query(WholeMarketStock).filter(WholeMarketStock.symbol == symbol, WholeMarketStock.market == market).first())
        if not whole_market_stock:
            raise HTTPException(status_code=404, detail="全市场股票不存在")

        whole_market_stock.is_watchlist = is_watchlist
        await run_in_threadpool(lambda: db.commit())
        await run_in_threadpool(lambda: db.refresh(whole_market_stock))

        if is_watchlist:
            existing_stock = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.symbol == symbol, Stock.market == market).first())
            if not existing_stock:
                new_stock = Stock(
                    symbol=whole_market_stock.symbol,
                    name=whole_market_stock.name,
                    market=whole_market_stock.market,
                    auto_update=True,
                    last_updated=datetime.now(timezone.utc)
                )
                await run_in_threadpool(lambda: db.add(new_stock))
                await run_in_threadpool(lambda: db.commit())
                await run_in_threadpool(lambda: db.refresh(new_stock))
                background_tasks.add_task(update_stock_data_for_symbols, [new_stock.symbol], [new_stock.market], SessionLocal())
        else:
            stock_to_delete = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.symbol == symbol, Stock.market == market).first())
            if stock_to_delete:
                await run_in_threadpool(lambda: db.delete(stock_to_delete))
                await run_in_threadpool(lambda: db.commit())

        return whole_market_stock
    except Exception as e:
        logging.error(f"更新自选状态失败 for symbol {symbol}, market {market}: {e}")
        raise HTTPException(status_code=500, detail=f"更新自选状态失败: {e}")

@app.post("/stock_api/stocks", response_model=StockResponse)
async def create_stock(stock: StockCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    existing_stock_in_watchlist = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.symbol == stock.symbol, Stock.market == stock.market).first())
    if existing_stock_in_watchlist:
        raise HTTPException(status_code=400, detail=f"股票 {stock.symbol} ({stock.market}) 已存在于自选股中。")

    whole_market_stock = await run_in_threadpool(lambda: db.query(WholeMarketStock).filter(WholeMarketStock.symbol == stock.symbol, WholeMarketStock.market == stock.market).first())
    if not whole_market_stock:
        stock_name = stock.name if stock.name else stock.symbol
        market_data = await fetch_stock_data_akshare(stock.symbol, stock.market)
        if market_data and market_data.get("name"):
            stock_name = market_data.get("name")

        new_whole_market_stock = WholeMarketStock(
            symbol=stock.symbol,
            name=stock_name,
            market=stock.market,
            current_price=market_data.get("current_price"),
            change_percent=market_data.get("change_percent"),
            last_updated=datetime.now(timezone.utc),
            is_watchlist=True
        )
        await run_in_threadpool(lambda: db.add(new_whole_market_stock))
        await run_in_threadpool(lambda: db.commit())
        await run_in_threadpool(lambda: db.refresh(new_whole_market_stock))
        whole_market_stock = new_whole_market_stock
    else:
        whole_market_stock.is_watchlist = True
        await run_in_threadpool(lambda: db.commit())
        await run_in_threadpool(lambda: db.refresh(whole_market_stock))

    db_stock = Stock(
        symbol=whole_market_stock.symbol,
        name=whole_market_stock.name,
        market=whole_market_stock.market,
        auto_update=True,
        last_updated=datetime.now(timezone.utc)
    )
    await run_in_threadpool(lambda: db.add(db_stock))
    await run_in_threadpool(lambda: db.commit())
    await run_in_threadpool(lambda: db.refresh(db_stock))

    background_tasks.add_task(update_stock_data_for_symbols, [db_stock.symbol], [db_stock.market], db)

    return {"message": f"股票 {db_stock.symbol} ({db_stock.market}) 添加成功，后台数据更新中。", **StockResponse.model_validate(db_stock).model_dump()}

@app.delete("/stock_api/stocks/{symbol}")
async def delete_stock(symbol: str, db: Session = Depends(get_db)):
    db_stock = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.symbol == symbol).first())
    if not db_stock:
        raise HTTPException(status_code=404, detail="股票不存在")

    whole_market_stock = await run_in_threadpool(lambda: db.query(WholeMarketStock).filter(WholeMarketStock.symbol == symbol, WholeMarketStock.market == db_stock.market).first())
    if whole_market_stock:
        whole_market_stock.is_watchlist = False
        await run_in_threadpool(lambda: db.commit())

    await run_in_threadpool(lambda: db.delete(db_stock))
    await run_in_threadpool(lambda: db.commit())
    return {"message": "删除成功"}

@app.post("/stock_api/stocks/batch", response_model=Dict[str, Any])
async def create_stocks_batch(request: StockBatchCreateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    new_symbols_to_add_to_watchlist = []
    for item in request.stocks:
        existing_stock_in_watchlist = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.symbol == item.symbol, Stock.market == item.market).first())
        if existing_stock_in_watchlist:
            logging.info(f"股票 {item.symbol} ({item.market}) 已存在于自选股中，跳过添加。")
            continue

        whole_market_stock = await run_in_threadpool(lambda: db.query(WholeMarketStock).filter(WholeMarketStock.symbol == item.symbol, WholeMarketStock.market == item.market).first())
        if not whole_market_stock:
            stock_name = item.symbol
            market_data = await fetch_stock_data_akshare(item.symbol, item.market)
            if market_data and market_data.get("name"):
                stock_name = market_data.get("name")

            new_whole_market_stock = WholeMarketStock(
                symbol=item.symbol,
                name=stock_name,
                market=item.market,
                current_price=market_data.get("current_price"),
                change_percent=market_data.get("change_percent"),
                last_updated=datetime.now(timezone.utc),
                is_watchlist=True
            )
            await run_in_threadpool(lambda: db.add(new_whole_market_stock))
            await run_in_threadpool(lambda: db.commit())
            await run_in_threadpool(lambda: db.refresh(new_whole_market_stock))
        else:
            whole_market_stock.is_watchlist = True
            await run_in_threadpool(lambda: db.commit())
            await run_in_threadpool(lambda: db.refresh(whole_market_stock))

        new_stock = Stock(
            symbol=item.symbol,
            name=whole_market_stock.name,
            market=item.market,
            auto_update=True,
            last_updated=datetime.now(timezone.utc)
        )
        await run_in_threadpool(lambda: db.add(new_stock))
        new_symbols_to_add_to_watchlist.append(new_stock.symbol)

    await run_in_threadpool(lambda: db.commit())
    for stock_symbol in new_symbols_to_add_to_watchlist:
        stock = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.symbol == stock_symbol).first())
        if stock:
            await run_in_threadpool(lambda: db.refresh(stock))
            background_tasks.add_task(update_stock_data_for_symbols, [stock.symbol], [stock.market], db)

    return {"message": f"成功添加 {len(new_symbols_to_add_to_watchlist)} 只新股票到自选股，后台数据更新中。", "added_symbols": new_symbols_to_add_to_watchlist}

async def update_stock_data_for_symbols(symbols: List[str], markets: List[str], db: Session = Depends(get_db)):
    try:
        for symbol, market in zip(symbols, markets):
            stock = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.symbol == symbol, Stock.market == market).first())
            if stock:
                market_data = await fetch_stock_data_akshare(stock.symbol, stock.market)
                if market_data:
                    stock.current_price = market_data.get("current_price")
                    stock.change_percent = market_data.get("change_percent")
                    stock.volume = market_data.get("volume")
                    stock.market_cap = market_data.get("market_cap")
                    stock.name = market_data.get("name", stock.name)
                    stock.current_pe = market_data.get("current_pe")
                    stock.roe = market_data.get("roe")
                    stock.book_value_per_share = market_data.get("book_value_per_share")

                if all([stock.book_value_per_share is not None, stock.roe is not None,
                       stock.perpetual_growth_rate is not None, stock.required_return_rate is not None]):
                    try:
                        valuation = calculate_valuation(
                            stock.book_value_per_share, stock.roe,
                            stock.perpetual_growth_rate, stock.required_return_rate
                        )
                        stock.calculated_pe_lower = valuation.pe_ratio_lower
                        stock.calculated_pe_upper = valuation.pe_ratio_upper
                        stock.theoretical_price_lower = valuation.theoretical_price_lower
                        stock.theoretical_price_upper = valuation.theoretical_price_upper
                        stock.calculated_pe_mid = valuation.pe_ratio_mid
                        stock.theoretical_price_mid = valuation.theoretical_price_mid
                    except ValueError:
                        pass

                stock.last_updated = datetime.now(timezone.utc)
                await run_in_threadpool(lambda: db.commit())
                await run_in_threadpool(lambda: db.refresh(stock))
            else:
                logging.warning(f"未找到股票 {symbol} ({market}) 进行更新。")
    except Exception as e:
        logging.error(f"批量特定股票更新失败: {e}")
    # finally:
        # db.close()

@app.post("/stock_api/valuation/calculate", response_model=ValuationResponse)
async def calculate_valuation_api(request: ValuationRequest):
    try:
        return calculate_valuation(
            request.book_value_per_share, request.roe,
            request.perpetual_growth_rate, request.required_return_rate
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/stock_api/analysis/screening")
async def screening_analysis(db: Session = Depends(get_db)):
    stocks = await run_in_threadpool(lambda: db.query(Stock).all())

    total = len(stocks)
    overvalued = 0
    undervalued = 0
    reasonable = 0
    unknown = 0

    for s in stocks:
        if s.current_pe is not None and s.calculated_pe_lower is not None and s.calculated_pe_upper is not None:
            if s.current_pe >= s.calculated_pe_lower and s.current_pe <= s.calculated_pe_upper:
                reasonable += 1
            elif s.current_pe < s.calculated_pe_lower:
                undervalued += 1
            elif s.current_pe > s.calculated_pe_upper:
                overvalued += 1
            else:
                unknown += 1 # This case should ideally not be hit if all conditions are exhaustive
        else:
            unknown += 1

    return {
        "total": total,
        "overvalued": overvalued,
        "undervalued": undervalued,
        "reasonable": reasonable,
        "unknown": unknown,
        "stocks": [
            {
                "symbol": stock.symbol,
                "name": stock.name,
                "market": stock.market,
                "current_pe": stock.current_pe,
                "calculated_pe_lower": stock.calculated_pe_lower,
                "calculated_pe_upper": stock.calculated_pe_upper,
                "current_price": stock.current_price,
                "theoretical_price_lower": stock.theoretical_price_lower,
                "theoretical_price_upper": stock.theoretical_price_upper,
                "calculated_pe_mid": stock.calculated_pe_mid,
                "theoretical_price_mid": stock.theoretical_price_mid
            } for stock in stocks
        ]
    }

@app.post("/stock_api/update/trigger")
async def trigger_update(background_tasks: BackgroundTasks):
    background_tasks.add_task(update_watchlist_stocks)
    return {"message": "数据更新任务已启动"}

@app.get("/stock_api/full_market_update_status")
async def get_full_market_update_status():
    return full_market_update_status

class MarketUpdateRequest(BaseModel):
    market: str

@app.post("/stock_api/trigger_full_market_update_by_market")
async def trigger_full_market_update_by_market_api(request: MarketUpdateRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    market_type = request.market
    if market_type not in ["A股", "H股", "美股"]:
        raise HTTPException(status_code=400, detail="无效的市场类型")
    background_tasks.add_task(update_full_market_data_by_market, market_type, SessionLocal())
    return {"message": f"{market_type} 全市场股票数据更新任务已启动"}

@app.post("/stock_api/manual_update")
async def manual_update(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    stocks_to_update = await run_in_threadpool(lambda: db.query(Stock).filter(Stock.auto_update == True).all())
    symbols = [stock.symbol for stock in stocks_to_update]
    markets = [stock.market for stock in stocks_to_update]
    if symbols:
        background_tasks.add_task(update_stock_data_for_symbols, symbols, markets, SessionLocal())
    return {"message": f"已触发 {len(symbols)} 只自选股票的数据更新任务。"}

@app.post("/stock_api/trigger_full_market_update")
async def trigger_full_market_update(background_tasks: BackgroundTasks):
    background_tasks.add_task(update_full_market_data_overall)
    return {"message": "全市场股票数据更新任务已启动"}

if __name__ == "__main__":
    import uvicorn
    import os
    BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=BACKEND_PORT)
