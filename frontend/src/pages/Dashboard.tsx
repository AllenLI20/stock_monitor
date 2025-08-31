import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Button, Space, Tag, Table, Typography, Select, Tooltip } from 'antd';
import {
  StockOutlined,
  RiseOutlined,
  FallOutlined,
  QuestionCircleOutlined,
  CalculatorOutlined,
  PlusOutlined,
  SyncOutlined,
  UploadOutlined // New import for UploadOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { message, Modal, Input, notification } from 'antd'; // New imports for Modal, Input, notification

// 获取后端端口，优先从环境变量中读取，否则使用默认值5000
const BACKEND_PORT = process.env.REACT_APP_BACKEND_PORT || 5000;
const API_BASE_URL = `http://localhost:${BACKEND_PORT}/stock_api`;

const { Title, Paragraph } = Typography;
const { TextArea } = Input; // Destructure TextArea
const { Option } = Select; // Destructure Option

interface Stock {
  symbol: string;
  name: string;
  market: string;
  current_pe: number;
  calculated_pe_lower: number;
  calculated_pe_upper: number;
  theoretical_price_lower: number;
  theoretical_price_upper: number;
  calculated_pe_mid: number;
  theoretical_price_mid: number;
  current_price: number; // Ensure current_price is here
}

interface PERangeDisplayProps {
  lower: number;
  mid: number;
  upper: number;
  current: number;
}

const PERangeDisplay: React.FC<PERangeDisplayProps> = ({ lower, mid, upper, current }) => {
  if (lower == null || mid == null || upper == null || current == null ||
      (lower === 0 && mid === 0 && upper === 0 && current === 0)) { // Add check for all zeros
    return <span>-</span>;
  }

  const minVal = Math.min(lower, mid, upper, current);
  const maxVal = Math.max(lower, mid, upper, current);
  const range = maxVal - minVal;

  const getPosition = (value: number) => ((value - minVal) / range) * 100;

  const midPos = getPosition(mid);
  const currentPos = getPosition(current);

  // 计算药丸的左右边界
  const pillLeft = getPosition(lower);
  const pillRight = getPosition(upper);

  const isCurrentInRange = current >= lower && current <= upper;

  return (
    <div className="range-display-container">
      {/* 药丸背景区间 */}
      <div
        className="range-fill"
        style={{
          left: `${pillLeft}%`,
          width: `${pillRight - pillLeft}%`,
        }}
      ></div>

      {/* mid点 */}
      <div
        className="range-mid-line"
        style={{
          left: `${midPos}%`,
        }}
      ></div>

      {/* current点 */}
      <div
        className={`range-current-dot ${isCurrentInRange ? 'in-range' : 'out-of-range'}`}
        style={{
          left: `${currentPos}%`,
        }}
      ></div>

      <Tooltip title={
        <>
          <div>Lower: {lower.toFixed(2)}</div>
          <div>Mid: {mid.toFixed(2)}</div>
          <div>Upper: {upper.toFixed(2)}</div>
          <div>Current: {current.toFixed(2)}</div>
        </>
      }>
        <div style={{ position: 'absolute', width: '100%', height: '100%', cursor: 'pointer' }}></div>
      </Tooltip>
    </div>
  );
};

interface PriceRangeDisplayProps {
  lower: number;
  mid: number;
  upper: number;
  current: number;
}

const PriceRangeDisplay: React.FC<PriceRangeDisplayProps> = ({ lower, mid, upper, current }) => {
  if (lower == null || mid == null || upper == null || current == null ||
      (lower === 0 && mid === 0 && upper === 0 && current === 0)) { // Add check for all zeros
    return <span>-</span>;
  }

  const minVal = Math.min(lower, mid, upper, current);
  const maxVal = Math.max(lower, mid, upper, current);
  const range = maxVal - minVal;

  const getPosition = (value: number) => ((value - minVal) / range) * 100;

  const midPos = getPosition(mid);
  const currentPos = getPosition(current);

  const pillLeft = getPosition(lower);
  const pillRight = getPosition(upper);

  const isCurrentInRange = current >= lower && current <= upper;

  return (
    <div className="range-display-container">
      {/* 药丸背景区间 */}
      <div
        className="range-fill"
        style={{
          left: `${pillLeft}%`,
          width: `${pillRight - pillLeft}%`,
        }}
      ></div>

      {/* mid点 */}
      <div
        className="range-mid-line"
        style={{
          left: `${midPos}%`,
        }}
      ></div>

      {/* current点 */}
      <div
        className={`range-current-dot ${isCurrentInRange ? 'in-range' : 'out-of-range'}`}
        style={{
          left: `${currentPos}%`,
        }}
      ></div>

      <Tooltip title={
        <>
          <div>Lower: {lower.toFixed(2)}</div>
          <div>Mid: {mid.toFixed(2)}</div>
          <div>Upper: {upper.toFixed(2)}</div>
          <div>Current: {current.toFixed(2)}</div>
        </>
      }>
        <div style={{ position: 'absolute', width: '100%', height: '100%', cursor: 'pointer' }}></div>
      </Tooltip>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    total: 0,
    overvalued: 0,
    undervalued: 0,
    reasonable: 0,
    unknown: 0
  });
  const [recentStocks, setRecentStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(false); // 新增状态，控制更新按钮的加载状态
  const [isBatchModalVisible, setIsBatchModalVisible] = useState(false); // New state for modal visibility
  const [batchStockInput, setBatchStockInput] = useState(''); // New state for batch input
  const [confirmLoading, setConfirmLoading] = useState(false); // New state for modal loading
  const [batchSelectedMarket, setBatchSelectedMarket] = useState('A股'); // New state for selected market in batch add
  // New states for single stock addition
  const [isAddSingleModalVisible, setIsAddSingleModalVisible] = useState(false);
  const [singleStockInput, setSingleStockInput] = useState('');
  const [singleSelectedMarket, setSingleSelectedMarket] = useState('A股');
  const [updateProgress, setUpdateProgress] = useState<Record<string, { status: string; message: string; progress: number }>>({
    'A股': { status: '空闲', message: '未开始', progress: 0 },
    'H股': { status: '空闲', message: '未开始', progress: 0 },
    '美股': { status: '空闲', message: '未开始', progress: 0 },
    'overall': { status: '空闲', message: '未开始', progress: 0 },
  });
  const [progressIntervalId, setProgressIntervalId] = useState<number | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0); // Add a state to force refresh

  useEffect(() => {
    fetchDashboardData();
    const id = setInterval(fetchUpdateStatus, 2000) as unknown as number; // 每2秒查询一次
    setProgressIntervalId(id);
    return () => {
      if (id) {
        clearInterval(id);
      }
    };
  }, [refreshKey]); // Add refreshKey to dependencies

  const fetchUpdateStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/full_market_update_status`);
      setUpdateProgress(response.data);
      const overallStatus = response.data['overall'];
      if ((overallStatus.status === '完成' || overallStatus.status === '部分失败' || overallStatus.status === '失败') && progressIntervalId) {
        clearInterval(progressIntervalId);
        setProgressIntervalId(undefined);
        if (overallStatus.status === '完成') {
          message.success('全市场股票数据更新任务已完成！');
        } else {
          message.warning('全市场股票数据更新任务部分失败或已停止，请检查日志。' + overallStatus.message);
        }
        fetchDashboardData(); // 任务完成后刷新仪表盘数据
      }
    } catch (error) {
      console.error('获取更新状态失败:', error);
      // message.error('获取更新状态失败'); // 避免频繁提示
    }
  };

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, stocksResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/analysis/screening`),
        axios.get(`${API_BASE_URL}/stocks?skip=0&limit=10`)
      ]);

      setStats(statsResponse.data);
      setRecentStocks(stocksResponse.data);
      console.log("Dashboard data fetched:", statsResponse.data, stocksResponse.data); // Add log
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (current_pe: number, calculated_pe_lower: number, calculated_pe_upper: number) => {
    if (current_pe == null || calculated_pe_lower == null || calculated_pe_upper == null) return 'default';

    if (current_pe >= calculated_pe_lower && current_pe <= calculated_pe_upper) return 'processing'; // 合理区间内
    if (current_pe < calculated_pe_lower) return 'success'; // 偏低
    if (current_pe > calculated_pe_upper) return 'error'; // 偏高
    return 'default';
  };

  const getStatusText = (current_pe: number, calculated_pe_lower: number, calculated_pe_upper: number) => {
    if (current_pe == null || calculated_pe_lower == null || calculated_pe_upper == null) return '未知';

    if (current_pe >= calculated_pe_lower && current_pe <= calculated_pe_upper) return '合理';
    if (current_pe < calculated_pe_lower) return '偏低';
    if (current_pe > calculated_pe_upper) return '偏高';
    return '未知';
  };

  const getValueStyle = (type: 'total' | 'overvalued' | 'undervalued' | 'reasonable' | 'unknown') => {
    switch (type) {
      case 'total':
        return { color: '#607d8b' }; // 柔和的蓝灰色
      case 'overvalued':
        return { color: '#ef5350' }; // 柔和的红色
      case 'undervalued':
        return { color: '#81c784' }; // 柔和的绿色
      case 'reasonable':
        return { color: '#ffca28' }; // 柔和的黄色
      case 'unknown':
        return { color: '#90a4ae' }; // 柔和的蓝灰色
      default:
        return { color: '#37474f' }; // 深柔和灰色
    }
  };

  const columns = [
    {
      title: '股票代码',
      dataIndex: 'symbol',
      key: 'symbol',
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
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
      render: (value: number) => value ? value.toFixed(2) : '-',
    },
    {
      title: '当前PE',
      dataIndex: 'current_pe',
      key: 'current_pe',
      render: (value: number) => value ? value.toFixed(2) : '-',
    },
    {
      title: '合理PE区间',
      key: 'calculated_pe_range',
      render: (_: any, record: Stock) => (
        <PERangeDisplay
          lower={record.calculated_pe_lower}
          mid={record.calculated_pe_mid}
          upper={record.calculated_pe_upper}
          current={record.current_pe}
        />
      ),
    },
    {
      title: '理论股价区间',
      key: 'theoretical_price_range',
      render: (_: any, record: Stock) => (
        <PriceRangeDisplay
          lower={record.theoretical_price_lower}
          mid={record.theoretical_price_mid}
          upper={record.theoretical_price_upper}
          current={record.current_price}
        />
      ),
    },
    {
      title: '估值状态',
      key: 'valuation_status',
      render: (_: any, record: Stock) => (
        <Tag color={getStatusColor(record.current_pe, record.calculated_pe_lower, record.calculated_pe_upper)}>
          {getStatusText(record.current_pe, record.calculated_pe_lower, record.calculated_pe_upper)}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Stock) => (
        <Space size="middle">
          <Button
            type="link"
            size="small"
            danger // Add danger prop for red color
            onClick={() => handleDeleteStock(record.symbol)} // Call delete function
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const handleManualUpdate = async () => {
    setUpdating(true);
    try {
      // 调用更新自选股数据的API，而不是全市场更新
      await axios.post(`${API_BASE_URL}/manual_update`);
      message.success('自选股票数据更新任务已成功触发！');
      fetchDashboardData(); // 任务完成后刷新仪表盘数据
    } catch (error) {
      console.error('手动更新全市场数据失败:', error);
      message.error('全市场股票数据更新失败，请稍后再试。');
    } finally {
      setUpdating(false);
      fetchDashboardData(); // 重新添加，确保手动触发更新后仪表盘数据刷新
      setRefreshKey(prev => prev + 1); // Force re-render
    }
  };

  const handleBatchAddClick = () => {
    setIsBatchModalVisible(true);
  };

  const handleBatchAddOk = async () => {
    setConfirmLoading(true);
    try {
      const symbols = batchStockInput.trim().split('\n').filter(line => line.length > 0);

      const stocksToBatch = symbols.map(symbol => {
        return { symbol: symbol, market: batchSelectedMarket };
      });

      if (stocksToBatch.length === 0) {
        notification.warning({
          message: '输入无效',
          description: '请输入有效的股票代码',
        });
        setConfirmLoading(false);
        return;
      }

      const response = await axios.post(`${API_BASE_URL}/stocks/batch`, { stocks: stocksToBatch });
      notification.success({
        message: '批量添加成功',
        description: response.data.message,
      });
      fetchDashboardData(); // Refresh dashboard data
      setIsBatchModalVisible(false);
      setBatchStockInput(''); // Clear input
    } catch (error) {
      console.error('批量添加股票失败:', error);
      notification.error({
        message: '批量添加失败',
        description: '请检查输入格式或网络连接。' + error,
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleBatchAddCancel = () => {
    setIsBatchModalVisible(false);
    setBatchStockInput(''); // Clear input on cancel
  };

  // New delete stock handler
  const handleDeleteStock = async (symbol: string) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除股票 ${symbol} 吗？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.delete(`${API_BASE_URL}/stocks/${symbol}`);
          message.success(`股票 ${symbol} 删除成功！`);
          fetchDashboardData(); // Refresh dashboard data
        } catch (error) {
          console.error('删除股票失败:', error);
          message.error(`删除股票 ${symbol} 失败，请稍后再试。`);
        }
      },
    });
  };

  const handleAddSingleClick = () => {
    setIsAddSingleModalVisible(true);
  };

  const handleAddSingleOk = async () => {
    setConfirmLoading(true);
    try {
      if (!singleStockInput.trim()) {
        notification.warning({
          message: '输入无效',
          description: '请输入有效的股票代码',
        });
        setConfirmLoading(false);
        return;
      }

      const stockToAdd = { symbol: singleStockInput.trim(), market: singleSelectedMarket };
      const response = await axios.post(`${API_BASE_URL}/stocks`, stockToAdd);

      notification.success({
        message: '股票添加成功',
        description: response.data.message || `股票 ${stockToAdd.symbol} 添加成功，后台数据更新中。`,
      });
      fetchDashboardData(); // Refresh dashboard data
      setIsAddSingleModalVisible(false);
      setSingleStockInput(''); // Clear input
    } catch (error: any) {
      console.error('添加股票失败:', error);
      notification.error({
        message: '添加股票失败',
        description: error.response?.data?.detail || '请检查输入格式或网络连接。' + error,
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleAddSingleCancel = () => {
    setIsAddSingleModalVisible(false);
    setSingleStockInput(''); // Clear input on cancel
    setSingleSelectedMarket('A股'); // Reset market on cancel
  };

  return (
    <div className="container" key={refreshKey}> {/* Add key to force re-render */}
      <div className="header">
        <Title level={1} style={{ color: 'white', margin: 0 }}>
          股票估值分析系统
        </Title>
        <Paragraph style={{ color: 'white', margin: 0, opacity: 0.9 }}>
          基于Excel表格的戈登增长模型，计算合理市盈率和理论股价
        </Paragraph>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 32, justifyContent: 'space-between' }}> {/* 添加 justifyContent */}
        <Col flex="1">
          <div className="stats-card">
            <Statistic
              title="总股票数"
              value={stats.total}
              prefix={<StockOutlined />}
              valueStyle={getValueStyle('total')}
            />
          </div>
        </Col>
        <Col flex="1">
          <div className="stats-card">
            <Statistic
              title="估值偏高"
              value={stats.overvalued}
              prefix={<RiseOutlined />}
              valueStyle={getValueStyle('overvalued')}
            />
          </div>
        </Col>
        <Col flex="1">
          <div className="stats-card">
            <Statistic
              title="估值偏低"
              value={stats.undervalued}
              prefix={<FallOutlined />}
              valueStyle={getValueStyle('undervalued')}
            />
          </div>
        </Col>
        <Col flex="1">
          <div className="stats-card">
            <Statistic
              title="估值合理"
              value={stats.reasonable}
              valueStyle={getValueStyle('reasonable')}
            />
          </div>
        </Col>
        <Col flex="1">
          <div className="stats-card">
            <Statistic
              title="估值未知"
              value={stats.unknown}
              prefix={<QuestionCircleOutlined />}
              valueStyle={getValueStyle('unknown')}
            />
          </div>
        </Col>
      </Row>

            {/* 快速操作 */}
      <Card title="快速操作" className="card">
        <div style={{ textAlign: 'center' }}>
          <Space size="middle" wrap>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddSingleClick}
              style={{
                boxShadow: '0 4px 12px rgba(96, 125, 139, 0.2)', // 柔和的蓝灰色阴影
                backgroundColor: '#607d8b', // 柔和的蓝灰色背景
                borderColor: '#607d8b', // 柔和的蓝灰色边框
              }}
            >
              添加新股票
            </Button>
            <Button
              icon={<CalculatorOutlined />}
              onClick={() => navigate('/valuation-calculator')}
              style={{
                border: '1px solid #90a4ae', // 柔和的蓝灰色边框
                color: '#607d8b', // 柔和的蓝灰色文本
                background: '#eceff1' // 柔和的浅灰色背景
              }}
            >
              估值计算器
            </Button>
            {/* 新增手动更新按钮 */}
            <Button
              icon={<SyncOutlined spin={updating} />}
              onClick={handleManualUpdate}
              loading={updating}
              style={{
                border: '1px solid #81c784', // 柔和的绿色边框
                color: '#81c784', // 柔和的绿色文本
                background: '#e8f5e9', // 柔和的浅绿色背景
              }}
            >
              手动更新数据
            </Button>
            {/* 新增批量添加股票按钮 */}
            <Button
              icon={<UploadOutlined />}
              onClick={handleBatchAddClick}
              style={{
                border: '1px solid #ffca28', // 柔和的黄色边框
                color: '#ffca28', // 柔和的黄色文本
                background: '#fffde7', // 柔和的浅黄色背景
              }}
            >
              批量添加股票
            </Button>
          </Space>
        </div>
      </Card>

      {/* 最近股票 */}
      <Card title="最近添加的股票" className="card" loading={loading}>
        {recentStocks.length > 0 ? (
          <Table
            columns={columns}
            dataSource={recentStocks}
            rowKey="symbol"
            pagination={false}
            size="small"
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#90a4ae' }}> {/* 柔和的蓝灰色文本 */}
            <StockOutlined style={{ fontSize: '48px', marginBottom: '16px', color: '#b0bec5' }} /> {/* 柔和的蓝灰色图标 */}
            <p>暂无股票数据</p>
            <Button type="primary" onClick={() => navigate('/full-stock-list')}>
              添加第一只股票
            </Button>
          </div>
        )}
      </Card>

      {/* 批量添加股票模态框 */}
      <Modal
        title="批量添加股票"
        open={isBatchModalVisible}
        onOk={handleBatchAddOk}
        onCancel={handleBatchAddCancel}
        confirmLoading={confirmLoading}
        width={600}
        okText="确认添加"
        cancelText="取消"
      >
        <Paragraph>
          请每行输入一个股票代码。
        </Paragraph>
        <Select
          value={batchSelectedMarket}
          onChange={(value) => setBatchSelectedMarket(value)}
          style={{ width: '100%', marginBottom: '16px' }}
        >
          <Option value="A股">A股</Option>
          <Option value="H股">H股</Option>
          <Option value="美股">美股</Option>
        </Select>
        <TextArea
          rows={10}
          value={batchStockInput}
          onChange={(e) => setBatchStockInput(e.target.value)}
          placeholder="请输入股票代码，例如：AAPL 或 000001"
          style={{ marginBottom: '16px' }}
        />
        <Paragraph type="secondary">
          系统将尝试获取股票名称和初始数据，并开启自动更新。
        </Paragraph>
      </Modal>

      {/* 单只股票添加模态框 */}
      <Modal
        title="添加新股票"
        open={isAddSingleModalVisible}
        onOk={handleAddSingleOk}
        onCancel={handleAddSingleCancel}
        confirmLoading={confirmLoading}
        width={400}
        okText="确认添加"
        cancelText="取消"
      >
        <Paragraph>
          请输入要添加的股票代码。
        </Paragraph>
        <Select
          value={singleSelectedMarket}
          onChange={(value) => setSingleSelectedMarket(value)}
          style={{ width: '100%', marginBottom: '16px' }}
        >
          <Option value="A股">A股</Option>
          <Option value="H股">H股</Option>
          <Option value="美股">美股</Option>
        </Select>
        <Input
          value={singleStockInput}
          onChange={(e) => setSingleStockInput(e.target.value)}
          placeholder="请输入股票代码，例如：AAPL 或 SH600001"
          style={{ marginBottom: '16px' }}
        />
        <Paragraph type="secondary">
          系统将自动获取股票名称和初始数据，并开启自动更新。
        </Paragraph>
      </Modal>
    </div>
  );
};

export default Dashboard;
