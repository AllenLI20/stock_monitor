import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, message, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import { DeleteOutlined } from '@ant-design/icons';

interface Stock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  current_price: number | null;
  change_percent: number | null;
  current_pe: number | null;
  calculated_pe_lower: number | null;
  calculated_pe_upper: number | null;
  calculated_pe_mid: number | null;
  theoretical_price_lower: number | null;
  theoretical_price_upper: number | null;
  theoretical_price_mid: number | null;
  roe: number | null;
  book_value_per_share: number | null;
  perpetual_growth_rate: number | null;
  required_return_rate: number | null;
  last_updated: string | null;
  auto_update: boolean;
}

interface PERangeDisplayProps {
  lower: number | null;
  mid: number | null;
  upper: number | null;
  current: number | null;
}

const PERangeDisplay: React.FC<PERangeDisplayProps> = ({ lower, mid, upper, current }) => {
  if (lower == null || mid == null || upper == null || current == null ||
      (lower === 0 && mid === 0 && upper === 0 && current === 0)) {
    return <span>-</span>;
  }

  const minVal = Math.min(lower, mid, upper, current);
  const maxVal = Math.max(lower, mid, upper, current);
  const range = maxVal - minVal;

  const getPosition = (value: number) => (range === 0 ? 50 : ((value - minVal) / range) * 100);

  const midPos = getPosition(mid);
  const currentPos = getPosition(current);

  const pillLeft = getPosition(lower);
  const pillRight = getPosition(upper);

  const isCurrentInRange = current >= lower && current <= upper;

  return (
    <div className="range-display-container">
      <div
        className="range-fill"
        style={{
          left: `${pillLeft}%`,
          width: `${pillRight - pillLeft}%`,
        }}
      ></div>

      <div
        className="range-mid-line"
        style={{
          left: `${midPos}%`,
        }}
      ></div>

      <div
        className={`range-current-dot ${isCurrentInRange ? 'in-range' : 'out-of-range'}`}
        style={{
          left: `${currentPos}%`,
        }}
      ></div>

      <Tooltip title={
        <>
          <div>下限: {lower.toFixed(2)}</div>
          <div>中值: {mid.toFixed(2)}</div>
          <div>上限: {upper.toFixed(2)}</div>
          <div>当前: {current.toFixed(2)}</div>
        </>
      }>
        <div style={{ position: 'absolute', width: '100%', height: '100%', cursor: 'pointer' }}></div>
      </Tooltip>
    </div>
  );
};

const PriceRangeDisplay: React.FC<PERangeDisplayProps> = ({ lower, mid, upper, current }) => {
  if (lower == null || mid == null || upper == null || current == null ||
      (lower === 0 && mid === 0 && upper === 0 && current === 0)) {
    return <span>-</span>;
  }

  const minVal = Math.min(lower, mid, upper, current);
  const maxVal = Math.max(lower, mid, upper, current);
  const range = maxVal - minVal;

  const getPosition = (value: number) => (range === 0 ? 50 : ((value - minVal) / range) * 100);

  const midPos = getPosition(mid);
  const currentPos = getPosition(current);

  const pillLeft = getPosition(lower);
  const pillRight = getPosition(upper);

  const isCurrentInRange = current >= lower && current <= upper;

  return (
    <div className="range-display-container">
      <div
        className="range-fill"
        style={{
          left: `${pillLeft}%`,
          width: `${pillRight - pillLeft}%`,
        }}
      ></div>

      <div
        className="range-mid-line"
        style={{
          left: `${midPos}%`,
        }}
      ></div>

      <div
        className={`range-current-dot ${isCurrentInRange ? 'in-range' : 'out-of-range'}`}
        style={{
          left: `${currentPos}%`,
        }}
      ></div>
      <Tooltip title={
        <>
          <div>下限: {lower.toFixed(2)}</div>
          <div>中值: {mid.toFixed(2)}</div>
          <div>上限: {upper.toFixed(2)}</div>
          <div>当前: {current.toFixed(2)}</div>
        </>
      }>
        <div style={{ position: 'absolute', width: '100%', height: '100%', cursor: 'pointer' }}></div>
      </Tooltip>
    </div>
  );
};

const Watchlist: React.FC = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  const fetchWatchlistStocks = useCallback(async (currentPage = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const params = {
        skip: (currentPage - 1) * pageSize,
        limit: pageSize,
      };
      const response = await axios.get('/stock_api/stocks', { params });
      setStocks(response.data);
      setPagination(prev => ({
        ...prev,
        current: currentPage,
        pageSize: pageSize,
        total: parseInt(response.headers['x-total-count'] || '0', 10),
      }));
    } catch (error) {
      console.error('获取自选股票数据失败:', error);
      message.error('获取自选股票数据失败');
    } finally {
      setLoading(false);
    }
  }, []); // 空数组表示这个函数只在组件挂载时创建一次

  useEffect(() => {
    fetchWatchlistStocks(pagination.current, pagination.pageSize);
  }, [fetchWatchlistStocks, pagination.current, pagination.pageSize]);

  const handleTableChange = (newPagination: any) => {
    setPagination(prev => ({ ...prev, ...newPagination }));
  };

  const handleRemoveFromWatchlist = async (record: Stock) => {
    setLoading(true);
    try {
      // 调用删除自选股的API，同时会更新whole_market_stocks的is_watchlist状态
      await axios.delete(`/stock_api/stocks/${record.symbol}`);
      message.success(`已将 ${record.name} 从自选移除`);
      // 刷新数据
      fetchWatchlistStocks(pagination.current, pagination.pageSize);
    } catch (error) {
      console.error('移除自选股票失败:', error);
      message.error('移除自选股票失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (stock: Stock) => {
    if (stock.current_pe === null || stock.calculated_pe_lower === null || stock.calculated_pe_upper === null) {
      return '数据缺失';
    }

    if (stock.current_pe < stock.calculated_pe_lower) {
      return '低估';
    } else if (stock.current_pe > stock.calculated_pe_upper) {
      return '高估';
    } else {
      return '合理';
    }
  };

  const getStatusColor = (stock: Stock) => {
    if (stock.current_pe === null || stock.calculated_pe_lower === null || stock.calculated_pe_upper === null) {
      return 'default';
    }

    if (stock.current_pe < stock.calculated_pe_lower) {
      return 'success'; // 使用 Ant Design 的 success 颜色
    } else if (stock.current_pe > stock.calculated_pe_upper) {
      return 'error'; // 使用 Ant Design 的 error 颜色
    } else {
      return 'processing'; // 使用 Ant Design 的 processing 颜色
    }
  };

  const columns: ColumnsType<Stock> = [
    {
      title: '股票代码',
      dataIndex: 'symbol',
      key: 'symbol',
      sorter: (a, b) => a.symbol.localeCompare(b.symbol),
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: '市场',
      dataIndex: 'market',
      key: 'market',
    },
    {
      title: '现价',
      dataIndex: 'current_price',
      key: 'current_price',
      render: (price: number) => (price !== null ? price.toFixed(2) : '-'),
      sorter: (a, b) => (a.current_price || 0) - (b.current_price || 0),
    },
    {
      title: '估值状态',
      key: 'status',
      render: (_, record) => (
        <Tag color={getStatusColor(record)}>{getStatusText(record)}</Tag>
      ),
      sorter: (a, b) => getStatusText(a).localeCompare(getStatusText(b)),
    },
    {
      title: '当前PE',
      dataIndex: 'current_pe',
      key: 'current_pe',
      render: (pe: number) => (pe !== null ? pe.toFixed(2) : '-'),
      sorter: (a, b) => (a.current_pe || 0) - (b.current_pe || 0),
    },
    {
      title: '合理PE区间',
      key: 'calculated_pe_range',
      render: (_, record) => (
        <PERangeDisplay
          lower={record.calculated_pe_lower}
          mid={record.calculated_pe_mid}
          upper={record.calculated_pe_upper}
          current={record.current_pe}
        />
      ),
      width: 200,
    },
    {
      title: '理论股价区间',
      key: 'theoretical_price_range',
      render: (_, record) => (
        <PriceRangeDisplay
          lower={record.theoretical_price_lower}
          mid={record.theoretical_price_mid}
          upper={record.theoretical_price_upper}
          current={record.current_price}
        />
      ),
      width: 200,
    },
    {
      title: '最后更新',
      dataIndex: 'last_updated',
      key: 'last_updated',
      render: (dateString: string) => dateString ? new Date(dateString).toLocaleString() : '-',
      sorter: (a, b) => new Date(a.last_updated || '').getTime() - new Date(b.last_updated || '').getTime(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button
          danger
          type="text"
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveFromWatchlist(record)}
        >
          移除自选
        </Button>
      ),
    },
  ];

  return (
    <div className="container">
      <h1 className="page-title">我的自选股票</h1>
      <Table
        columns={columns}
        dataSource={stocks}
        rowKey="id"
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showQuickJumper: true,
          onChange: (page, pageSize) => handleTableChange({ current: page, pageSize: pageSize }),
        }}
        onChange={handleTableChange}
        size="small"
      />
    </div>
  );
};

export default Watchlist;
