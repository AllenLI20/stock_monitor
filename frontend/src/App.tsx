import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider, Layout, message, Progress } from 'antd'; // 导入 message 和 Progress 组件
import zhCN from 'antd/locale/zh_CN';
import './App.css';
import axios from 'axios'; // 导入 axios

// 组件和页面
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ValuationCalculator from './pages/ValuationCalculator';
import FullStockList from './pages/FullStockList'; // 导入新页面
import Watchlist from './pages/Watchlist'; // 导入新页面

// 获取后端端口，优先从环境变量中读取，否则使用默认值5000
const BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || 5000;

// 根据环境动态选择后端地址
// 检测是否在服务器环境中运行（通过检查当前域名）
const isServerEnvironment = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const BACKEND_HOST = isServerEnvironment ? '43.143.50.170' : 'localhost';

export const API_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/stock_api`;

// 自定义主题配置
const theme = {
  token: {
    colorPrimary: '#607d8b', // 柔和的蓝灰色
    colorSuccess: '#81c784', // 柔和的绿色
    colorWarning: '#ffca28', // 柔和的黄色
    colorError: '#ef5350', // 柔和的红色
    colorInfo: '#90a4ae', // 更柔和的蓝灰色
    borderRadius: 8,
  },
};

function App() {
  const [updateStatus, setUpdateStatus] = useState({
    status: "空闲",
    message: "",
    progress: 0,
  });

  useEffect(() => {
    const fetchUpdateStatus = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/full_market_update_status`);
        setUpdateStatus(response.data);
      } catch (error) {
        console.error("获取全市场更新状态失败:", error);
      }
    };

    fetchUpdateStatus(); // 立即获取一次状态

    // 智能轮询：根据状态调整频率
    let intervalId: NodeJS.Timeout;
    if (updateStatus.status === "进行中") {
      // 更新进行中时，每5秒查询一次
      intervalId = setInterval(fetchUpdateStatus, 5000);
    } else {
      // 空闲状态时，每300秒查询一次
      intervalId = setInterval(fetchUpdateStatus, 300000);
    }

    return () => clearInterval(intervalId);
  }, [updateStatus.status]); // 根据状态变化调整轮询

  useEffect(() => {
    // console.log("Update Status Effect Triggered:", updateStatus);
    if (updateStatus.status === "进行中") {
      message.loading({ content: updateStatus.message, key: 'full_market_update', duration: 0 });
    } else if (updateStatus.status === "完成") {
      message.success({ content: updateStatus.message, key: 'full_market_update', duration: 3 });
      message.destroy('full_market_update'); // 明确关闭加载消息
    } else if (updateStatus.status === "失败") {
      message.error({ content: updateStatus.message, key: 'full_market_update', duration: 5 });
      message.destroy('full_market_update'); // 明确关闭加载消息
    } else if (updateStatus.status === "空闲" && updateStatus.message) {
      message.info({ content: updateStatus.message, key: 'full_market_update', duration: 3 });
    } else if (updateStatus.status === "空闲" && !updateStatus.message) {
      message.destroy('full_market_update'); // 如果是空闲且没有特定消息，确保关闭任何残留的加载消息
    }
  }, [updateStatus]);

  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <Router>
        <Layout className="App">
          <Navbar />
          <Layout.Content>
            {updateStatus.status === "进行中" && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                padding: '8px 24px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ marginRight: '16px' }}>{updateStatus.message}</span>
                {updateStatus.progress >= 0 && updateStatus.progress <= 100 && (
                    <Progress percent={updateStatus.progress} size="small" style={{ width: '200px' }} />
                )}
              </div>
            )}
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/valuation-calculator" element={<ValuationCalculator />} />
              <Route path="/full-stock-list" element={<FullStockList />} /> {/* 新增路由 */}
              <Route path="/watchlist" element={<Watchlist />} /> {/* 新增路由 */}
            </Routes>
          </Layout.Content>
        </Layout>
      </Router>
    </ConfigProvider>
  );
}

export default App;
