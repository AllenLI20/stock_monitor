#!/bin/bash

echo "📊 股票估值分析系统 - 服务状态检查"
echo "=================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查后端服务状态
check_backend() {
    echo -e "${BLUE}🔍 检查后端服务...${NC}"

    # 检查PID文件
    if [ -f ".backend_pid" ]; then
        BACKEND_PID=$(cat .backend_pid)
        BACKEND_PORT=$(cat .backend_port 2>/dev/null || echo "8000")

        if kill -0 $BACKEND_PID 2>/dev/null; then
            echo -e "${GREEN}✅ 后端服务运行中 (PID: $BACKEND_PID, 端口: $BACKEND_PORT)${NC}"

            # 测试API连接
            if curl -s "http://localhost:$BACKEND_PORT/" > /dev/null; then
                echo -e "${GREEN}✅ API响应正常${NC}"
            else
                echo -e "${RED}❌ API无响应${NC}"
            fi
        else
            echo -e "${RED}❌ 后端服务进程不存在 (PID: $BACKEND_PID)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  未找到后端服务PID文件${NC}"
    fi

    # 检查端口占用
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${GREEN}✅ 8000端口被占用${NC}"
    elif lsof -Pi :8001 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${GREEN}✅ 8001端口被占用${NC}"
    else
        echo -e "${RED}❌ 后端端口未被占用${NC}"
    fi
}

# 检查前端服务状态
check_frontend() {
    echo -e "${BLUE}🔍 检查前端服务...${NC}"

    # 检查PID文件
    if [ -f ".frontend_pid" ]; then
        FRONTEND_PID=$(cat .frontend_pid)
        FRONTEND_PORT=$(cat .frontend_port 2>/dev/null || echo "3000")

        if kill -0 $FRONTEND_PID 2>/dev/null; then
            echo -e "${GREEN}✅ 前端服务运行中 (PID: $FRONTEND_PID, 端口: $FRONTEND_PORT)${NC}"

            # 测试前端连接
            if curl -s "http://localhost:$FRONTEND_PORT" > /dev/null; then
                echo -e "${GREEN}✅ 前端响应正常${NC}"
            else
                echo -e "${RED}❌ 前端无响应${NC}"
            fi
        else
            echo -e "${RED}❌ 前端服务进程不存在 (PID: $FRONTEND_PID)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  未找到前端服务PID文件${NC}"
    fi

    # 检查端口占用
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${GREEN}✅ 3000端口被占用${NC}"
    elif lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${GREEN}✅ 3001端口被占用${NC}"
    else
        echo -e "${RED}❌ 前端端口未被占用${NC}"
    fi
}

# 检查数据库状态
check_database() {
    echo -e "${BLUE}🔍 检查数据库...${NC}"

    if [ -f "stock_valuation.db" ]; then
        DB_SIZE=$(du -h stock_valuation.db | cut -f1)
        echo -e "${GREEN}✅ 数据库文件存在 (大小: $DB_SIZE)${NC}"

        # 检查数据库连接
        if python3 -c "import sqlite3; sqlite3.connect('stock_valuation.db').close(); print('OK')" 2>/dev/null; then
            echo -e "${GREEN}✅ 数据库连接正常${NC}"
        else
            echo -e "${RED}❌ 数据库连接失败${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  数据库文件不存在${NC}"
    fi
}

# 检查依赖状态
check_dependencies() {
    echo -e "${BLUE}🔍 检查依赖...${NC}"

    # 检查Python依赖
    if python3 -c "import fastapi, uvicorn, sqlalchemy, pydantic" 2>/dev/null; then
        echo -e "${GREEN}✅ Python依赖正常${NC}"
    else
        echo -e "${RED}❌ Python依赖缺失${NC}"
    fi

    # 检查Node.js依赖
    if [ -d "frontend/node_modules" ]; then
        echo -e "${GREEN}✅ Node.js依赖已安装${NC}"
    else
        echo -e "${YELLOW}⚠️  Node.js依赖未安装${NC}"
    fi
}

# 显示服务链接
show_links() {
    echo ""
    echo -e "${BLUE}🔗 服务链接${NC}"
    echo "=========="

    if [ -f ".backend_port" ]; then
        BACKEND_PORT=$(cat .backend_port)
        echo -e "${GREEN}后端服务:${NC} http://localhost:$BACKEND_PORT"
        echo -e "${GREEN}API文档:${NC} http://localhost:$BACKEND_PORT/docs"
    else
        echo -e "${YELLOW}后端服务: 未运行${NC}"
    fi

    if [ -f ".frontend_port" ]; then
        FRONTEND_PORT=$(cat .frontend_port)
        echo -e "${GREEN}前端应用:${NC} http://localhost:$FRONTEND_PORT"
    else
        echo -e "${YELLOW}前端应用: 未运行${NC}"
    fi
}

# 显示系统信息
show_system_info() {
    echo ""
    echo -e "${BLUE}💻 系统信息${NC}"
    echo "=========="

    echo -e "${GREEN}Python版本:${NC} $(python3 --version 2>&1)"
    echo -e "${GREEN}Node.js版本:${NC} $(node --version 2>&1)"
    echo -e "${GREEN}npm版本:${NC} $(npm --version 2>&1)"
    echo -e "${GREEN}当前时间:${NC} $(date)"
}

# 主函数
main() {
    check_backend
    echo ""
    check_frontend
    echo ""
    check_database
    echo ""
    check_dependencies
    echo ""
    show_links
    show_system_info

    echo ""
    echo -e "${BLUE}📋 可用命令:${NC}"
    echo "  ./start_all.sh  - 启动所有服务"
    echo "  ./stop_all.sh   - 停止所有服务"
    echo "  ./status.sh     - 检查服务状态"
}

# 运行主函数
main
