import React from 'react';
import { Layout, Menu } from 'antd';
import { HomeOutlined, PlusSquareOutlined, CalculatorOutlined, TableOutlined, StarOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Link, useLocation } from 'react-router-dom';

const { Header } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[],
  type?: 'group',
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
    type,
  } as MenuItem;
}

const Navbar: React.FC = () => {
  const location = useLocation();

  const items: MenuItem[] = [
    getItem(<Link to="/">首页</Link>, '/', <HomeOutlined />),
    // getItem(<Link to="/add-stock">添加股票</Link>, '/add-stock', <PlusSquareOutlined />), // 已删除
    getItem(<Link to="/valuation-calculator">估值计算器</Link>, '/valuation-calculator', <CalculatorOutlined />),
    getItem(<Link to="/full-stock-list">完整股票列表</Link>, '/full-stock-list', <TableOutlined />),
    getItem(<Link to="/watchlist">我的自选</Link>, '/watchlist', <StarOutlined />),
  ];

  return (
    <Header className="navbar-header">
      <Menu
        selectedKeys={[location.pathname]}
        mode="horizontal"
        items={items}
        className="navbar-menu"
      />
    </Header>
  );
};

export default Navbar;
