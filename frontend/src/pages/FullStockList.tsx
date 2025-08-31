import React, { useState, useEffect, useCallback } from 'react';
import { Table, Select, Input, Button, Space, message, Typography, Progress, Pagination } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import { StarOutlined, StarFilled } from '@ant-design/icons';
import { API_BASE_URL } from '../App'; // Import API_BASE_URL

const { Option } = Select;
const { Search } = Input;

interface WholeMarketStock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  current_price: number | null;
  change_percent: number | null;
  last_updated: string | null;
  is_watchlist: boolean;
}

const FullStockList: React.FC = () => {
  const [stocks, setStocks] = useState<WholeMarketStock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
    showSizeChanger: true, // 允许改变每页显示数量
    pageSizeOptions: ['10', '20', '50', '100'], // 可选的每页显示数量
    showQuickJumper: true, // 允许快速跳转到某一页
  });

  console.log('Pagination state:', pagination);

  const [filters, setFilters] = useState({
    market: undefined as string | undefined,
    searchQuery: undefined as string | undefined,
  });
  const [currentSortField, setCurrentSortField] = useState<string | undefined>(undefined);
  const [currentSortOrder, setCurrentSortOrder] = useState<'asc' | 'desc' | undefined>(undefined);
  const [updatingMarkets, setUpdatingMarkets] = useState<Record<string, boolean>>({}); // New state for market update loading
  const [updateProgress, setUpdateProgress] = useState<Record<string, { status: string; message: string; progress: number }>>({
    'A股': { status: '空闲', message: '未开始', progress: 0 },
    'H股': { status: '空闲', message: '未开始', progress: 0 },
    '美股': { status: '空闲', message: '未开始', progress: 0 },
    'overall': { status: '空闲', message: '未开始', progress: 0 },
  });
  const [progressIntervalId, setProgressIntervalId] = useState<number | undefined>(undefined);

  const fetchStocks = useCallback(async (currentPage = 1, pageSize = 10, market?: string, searchQuery?: string, sortField?: string, sortOrder?: 'asc' | 'desc') => {
    setLoading(true);
    try {
      const params = {
        skip: (currentPage - 1) * pageSize,
        limit: pageSize,
        ...(market && { market }),
        ...(searchQuery && { search_query: searchQuery }),
        ...(sortField && { sort_field: sortField }),
        ...(sortOrder && { sort_order: sortOrder }),
      };
      // 为了获取总数，后端需要返回 X-Total-Count 头，或者在响应体中包含总数。
      // 假设后端会返回 X-Total-Count
      const response = await axios.get(`${API_BASE_URL}/whole_market_stocks`, { params });
      console.log('Backend Response:', response);
      console.log('Response Headers:', response.headers);
      const totalCount = parseInt(response.headers['x-total-count'] || '0', 10);
      console.log('Parsed X-Total-Count:', totalCount);

      setStocks(response.data);
      setPagination(prev => ({
        ...prev,
        current: currentPage,
        pageSize: pageSize,
        total: totalCount, // 从响应头获取总数
      }));
    } catch (error) {
      console.error('获取全市场股票数据失败:', error);
      message.error('获取全市场股票数据失败');
    } finally {
      setLoading(false);
    }
  }, []); // 空数组表示这个函数只在组件挂载时创建一次

  useEffect(() => {
    fetchStocks(pagination.current, pagination.pageSize, filters.market, filters.searchQuery);
    return () => {
      if (progressIntervalId) {
        clearInterval(progressIntervalId);
      }
    };
  }, [pagination.current, pagination.pageSize, filters.market, filters.searchQuery]);

  const fetchUpdateStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/full_market_update_status`);
      setUpdateProgress(response.data);
      // 检查所有市场是否都已完成或失败，如果是，则停止轮询
      const allMarketsCompleted = Object.values(response.data).every((market: any) =>
        market.status === '完成' || market.status === '失败' || market.status === '空闲'
      );
      if (allMarketsCompleted && progressIntervalId) {
        clearInterval(progressIntervalId);
        setProgressIntervalId(undefined);
        message.success('所有市场股票数据更新任务已完成！');
        fetchStocks(pagination.current, pagination.pageSize, filters.market, filters.searchQuery); // 任务完成后刷新数据
      }
    } catch (error) {
      console.error('获取更新状态失败:', error);
      // message.error('获取更新状态失败'); // 避免频繁提示
    }
  };

  const handleTableChange = (newPagination: any, antTableFilters: any, sorter: any) => {
    // 这里不再需要直接更新 pagination state，因为 Pagination 组件会通过 onShowSizeChange 和 onChange 回调处理
    // 但仍然需要从 newPagination 中获取 current 和 pageSize 来调用 fetchStocks
    const currentPage = newPagination.current;
    const pageSize = newPagination.pageSize;

    // 处理排序
    let sortField = undefined;
    let sortOrder: 'asc' | 'desc' | undefined = undefined;
    if (sorter.field && sorter.order) {
      sortField = sorter.field as string;
      sortOrder = sorter.order === 'ascend' ? 'asc' : (sorter.order === 'descend' ? 'desc' : undefined);
    }
    setCurrentSortField(sortField);
    setCurrentSortOrder(sortOrder);

    // 处理筛选 (目前只处理market)
    const marketFilter = antTableFilters.market ? antTableFilters.market[0] : filters.market;
    // 这里需要更新 pagination state 中的 current 和 pageSize，以保持与 Pagination 组件同步
    setPagination(prev => ({ ...prev, current: currentPage, pageSize: pageSize }));
    fetchStocks(currentPage, pageSize, marketFilter, filters.searchQuery, sortField, sortOrder);
  };

  const handlePageChange = (page: number, pageSize?: number) => {
    setPagination(prev => ({ ...prev, current: page, pageSize: pageSize || prev.pageSize }));
    fetchStocks(page, pageSize || pagination.pageSize, filters.market, filters.searchQuery, currentSortField, currentSortOrder);
  };

  const handlePageSizeChange = (current: number, size: number) => {
    setPagination(prev => ({ ...prev, current: 1, pageSize: size })); // 改变每页大小时回到第一页
    fetchStocks(1, size, filters.market, filters.searchQuery, currentSortField, currentSortOrder);
  };

  const handleMarketChange = (value: string) => {
    setFilters(prev => ({ ...prev, market: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchStocks(1, pagination.pageSize, value, filters.searchQuery, currentSortField, currentSortOrder);
  };

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, searchQuery: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
    // 在这里重新调用 fetchStocks，因为搜索条件改变了，同时保留当前的排序状态
    fetchStocks(1, pagination.pageSize, filters.market, value, currentSortField, currentSortOrder);
  };

  const handleWatchlistToggle = async (record: WholeMarketStock) => {
    setLoading(true);
    try {
      const newWatchlistStatus = !record.is_watchlist;
      await axios.put(
        `${API_BASE_URL}/whole_market_stocks/${record.symbol}/watchlist`,
        { market: record.market, is_watchlist: newWatchlistStatus }
      );
      message.success(newWatchlistStatus ? `已将 ${record.name} 添加到自选` : `已将 ${record.name} 从自选移除`);
      // 刷新数据
      fetchStocks(pagination.current, pagination.pageSize, filters.market, filters.searchQuery);
    } catch (error) {
      console.error('更新自选状态失败:', error);
      message.error('更新自选状态失败');
    } finally {
      setLoading(false);
    }
  };

  // New function to trigger full market update by market type
  const handleTriggerMarketUpdate = async (marketType: string) => {
    setUpdatingMarkets(prev => ({ ...prev, [marketType]: true }));
    try {
      const response = await axios.post(`${API_BASE_URL}/trigger_full_market_update_by_market`, { market: marketType });
      message.success(response.data.message || `${marketType} 全市场股票数据更新任务已成功触发！`);
      // 启动进度轮询
      if (!progressIntervalId) {
        const id = setInterval(fetchUpdateStatus, 15000) as unknown as number; // 每15秒查询一次
        setProgressIntervalId(id);
      }
    } catch (error) {
      console.error(`触发 ${marketType} 全市场更新失败:`, error);
      message.error(`触发 ${marketType} 全市场股票数据更新失败，请稍后再试。`);
    } finally {
      setUpdatingMarkets(prev => ({ ...prev, [marketType]: false }));
      // fetchStocks(pagination.current, pagination.pageSize, filters.market, filters.searchQuery); // 任务完成后刷新数据，这里不再立即刷新
    }
  };

  const handleTriggerOverallUpdate = async () => {
    setUpdatingMarkets(prev => ({ ...prev, 'overall': true }));
    try {
      const response = await axios.post(`${API_BASE_URL}/trigger_full_market_update`); // 恢复触发所有市场更新功能
      message.success(response.data.message || '全市场股票数据整体更新任务已成功触发！');
      // 启动进度轮询
      if (!progressIntervalId) {
        const id = setInterval(fetchUpdateStatus, 10000) as unknown as number; // 每10秒查询一次
        setProgressIntervalId(id);
      }
    } catch (error) {
      console.error('触发全市场整体更新失败:', error);
      message.error('触发全市场股票数据整体更新失败，请稍后再试。');
    } finally {
      setUpdatingMarkets(prev => ({ ...prev, 'overall': false }));
    }
  };

  const columns: ColumnsType<WholeMarketStock> = [
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
      filters: [
        { text: 'A股', value: 'A股' },
        { text: 'H股', value: 'H股' },
        { text: '美股', value: '美股' },
      ],
      onFilter: (value, record) => record.market === value,
    },
    {
      title: '当前价格',
      dataIndex: 'current_price',
      key: 'current_price',
      render: (price: number) => (price !== null ? price.toFixed(2) : '-'),
      sorter: (a, b) => (a.current_price || 0) - (b.current_price || 0),
    },
    {
      title: '涨跌幅',
      dataIndex: 'change_percent',
      key: 'change_percent',
      render: (percent: number) => {
        if (percent === null) return '-';
        const color = percent > 0 ? '#ef5350' : percent < 0 ? '#81c784' : '#37474f'; // 使用柔和的红色、绿色和深柔和灰色
        return <span style={{ color }}>{percent.toFixed(2)}%</span>;
      },
      sorter: (a, b) => (a.change_percent || 0) - (b.change_percent || 0),
    },
    {
      title: '最后更新',
      dataIndex: 'last_updated',
      key: 'last_updated',
      render: (dateString: string) => dateString ? new Date(dateString).toLocaleString() : '-',
      sorter: (a, b) => new Date(a.last_updated || '').getTime() - new Date(b.last_updated || '').getTime(),
    },
    {
      title: '自选',
      key: 'action',
      render: (_, record) => (
        <Button
          type="text"
          icon={record.is_watchlist ? <StarFilled style={{ color: '#ffca28' }} /> : <StarOutlined />}
          onClick={() => handleWatchlistToggle(record)}
        />
      ),
    },
  ];

  return (
    <div className="container">
      <h1 className="page-title">全市场股票列表</h1>
      <Space style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <Select
          placeholder="选择市场"
          style={{ width: 120 }}
          onChange={handleMarketChange}
          allowClear
        >
          <Option value="A股">A股</Option>
          <Option value="H股">H股</Option>
          <Option value="美股">美股</Option>
        </Select>
        <Search
          placeholder="搜索股票代码或名称"
          onSearch={handleSearch}
          style={{ width: 200 }}
          allowClear
        />
        <Button
          loading={updatingMarkets['A股'] || updateProgress['A股'].status === '进行中'}
          onClick={() => handleTriggerMarketUpdate('A股')}
          style={{
            backgroundColor: (updatingMarkets['A股'] || updateProgress['A股'].status === '进行中') ? '#90a4ae' : '#607d8b',
            borderColor: '#607d8b',
            color: 'white',
          }}
        >
          更新A股
        </Button>
        <Button
          loading={updatingMarkets['H股'] || updateProgress['H股'].status === '进行中'}
          onClick={() => handleTriggerMarketUpdate('H股')}
          style={{
            backgroundColor: (updatingMarkets['H股'] || updateProgress['H股'].status === '进行中') ? '#90a4ae' : '#607d8b',
            borderColor: '#607d8b',
            color: 'white',
          }}
        >
          更新H股
        </Button>
        <Button
          loading={updatingMarkets['美股'] || updateProgress['美股'].status === '进行中'}
          onClick={() => handleTriggerMarketUpdate('美股')}
          style={{
            backgroundColor: (updatingMarkets['美股'] || updateProgress['美股'].status === '进行中') ? '#90a4ae' : '#607d8b',
            borderColor: '#607d8b',
            color: 'white',
          }}
        >
          更新美股
        </Button>
        <Button
          loading={updatingMarkets['overall'] || updateProgress['overall'].status === '进行中'}
          onClick={handleTriggerOverallUpdate}
          style={{
            backgroundColor: (updatingMarkets['overall'] || updateProgress['overall'].status === '进行中') ? '#90a4ae' : '#607d8b',
            borderColor: '#607d8b',
            color: 'white',
          }}
        >
          更新所有市场
        </Button>
      </Space>

      {/* 进度条显示区域 */}
      {Object.entries(updateProgress).map(([marketType, status]) => (
        (status.status === '进行中' || status.status === '失败') && marketType !== 'overall' ? (
          <div key={marketType} style={{ marginBottom: 10 }}>
            <Typography.Text>{marketType}更新进度: {status.message}</Typography.Text>
            <Progress percent={status.progress} status={status.status === '失败' ? 'exception' : 'active'} />
          </div>
        ) : null
      ))}

      {updateProgress['overall'].status === '进行中' || updateProgress['overall'].status === '失败' ? (
        <div style={{ marginBottom: 10 }}>
          <Typography.Text>所有市场更新进度: {updateProgress['overall'].message}</Typography.Text>
          <Progress percent={updateProgress['overall'].progress} status={updateProgress['overall'].status === '失败' ? 'exception' : 'active'} />
        </div>
      ) : null}

      <Table
        columns={columns}
        dataSource={stocks}
        rowKey="id"
        loading={loading}
        pagination={false} // 关闭 Table 内部的分页
        onChange={handleTableChange}
        size="small"
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Pagination
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={pagination.total}
          showSizeChanger={pagination.showSizeChanger}
          pageSizeOptions={pagination.pageSizeOptions}
          showQuickJumper={pagination.showQuickJumper}
          onChange={handlePageChange}
          onShowSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  );
};

export default FullStockList;
