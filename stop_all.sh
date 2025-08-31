#!/bin/bash

echo "🛑 停止股票估值分析系统服务"
echo "============================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 停止后端服务
stop_backend() {
    if [ -f ".backend_pid" ]; then
        BACKEND_PID=$(cat .backend_pid)
        if kill -0 $BACKEND_PID 2>/dev/null; then
            echo -e "${BLUE}停止后端服务 (PID: $BACKEND_PID)...${NC}"
            kill $BACKEND_PID
            sleep 2
            if kill -0 $BACKEND_PID 2>/dev/null; then
                echo -e "${YELLOW}强制停止后端服务...${NC}"
                kill -9 $BACKEND_PID
            fi
            echo -e "${GREEN}✅ 后端服务已停止${NC}"
        else
            echo -e "${YELLOW}后端服务进程不存在${NC}"
        fi
        rm -f .backend_pid .backend_port
    else
        echo -e "${YELLOW}未找到后端服务PID文件${NC}"
    fi
}

# 停止前端服务
stop_frontend() {
    if [ -f ".frontend_pid" ]; then
        FRONTEND_PID=$(cat .frontend_pid)
        if kill -0 $FRONTEND_PID 2>/dev/null; then
            echo -e "${BLUE}停止前端服务 (PID: $FRONTEND_PID)...${NC}"
            kill $FRONTEND_PID
            sleep 2
            if kill -0 $FRONTEND_PID 2>/dev/null; then
                echo -e "${YELLOW}强制停止前端服务...${NC}"
                kill -9 $FRONTEND_PID
            fi
            echo -e "${GREEN}✅ 前端服务已停止${NC}"
        else
            echo -e "${YELLOW}前端服务进程不存在${NC}"
        fi
        rm -f .frontend_pid .frontend_port
    else
        echo -e "${YELLOW}未找到前端服务PID文件${NC}"
    fi
}

# 清理端口占用
cleanup_ports() {
    echo -e "${BLUE}清理端口占用...${NC}"

    # 清理5000端口
    BACKEND_PROCESS=$(lsof -ti:5000 2>/dev/null)
    if [ ! -z "$BACKEND_PROCESS" ]; then
        echo -e "${YELLOW}发现5000端口占用，正在清理...${NC}"
        kill -9 $BACKEND_PROCESS 2>/dev/null
        echo -e "${GREEN}✅ 5000端口已清理${NC}"
    fi

    # 清理5001端口
    BACKEND_PROCESS=$(lsof -ti:5001 2>/dev/null)
    if [ ! -z "$BACKEND_PROCESS" ]; then
        echo -e "${YELLOW}发现5001端口占用，正在清理...${NC}"
        kill -9 $BACKEND_PROCESS 2>/dev/null
        echo -e "${GREEN}✅ 5001端口已清理${NC}"
    fi

    # 清理8000端口
    BACKEND_PROCESS=$(lsof -ti:8000 2>/dev/null)
    if [ ! -z "$BACKEND_PROCESS" ]; then
        echo -e "${YELLOW}发现8000端口占用，正在清理...${NC}"
        kill -9 $BACKEND_PROCESS 2>/dev/null
        echo -e "${GREEN}✅ 8000端口已清理${NC}"
    fi

    # 清理8001端口
    BACKEND_PROCESS=$(lsof -ti:8001 2>/dev/null)
    if [ ! -z "$BACKEND_PROCESS" ]; then
        echo -e "${YELLOW}发现8001端口占用，正在清理...${NC}"
        kill -9 $BACKEND_PROCESS 2>/dev/null
        echo -e "${GREEN}✅ 8001端口已清理${NC}"
    fi

    # 清理3000端口
    FRONTEND_PROCESS=$(lsof -ti:3000 2>/dev/null)
    if [ ! -z "$FRONTEND_PROCESS" ]; then
        echo -e "${YELLOW}发现3000端口占用，正在清理...${NC}"
        kill -9 $FRONTEND_PROCESS 2>/dev/null
        echo -e "${GREEN}✅ 3000端口已清理${NC}"
    fi

    # 清理3001端口
    FRONTEND_PROCESS=$(lsof -ti:3001 2>/dev/null)
    if [ ! -z "$FRONTEND_PROCESS" ]; then
        echo -e "${YELLOW}发现3001端口占用，正在清理...${NC}"
        kill -9 $FRONTEND_PROCESS 2>/dev/null
        echo -e "${GREEN}✅ 3001端口已清理${NC}"
    fi
}

# 显示状态
show_status() {
    echo ""
    echo -e "${GREEN}🎯 服务状态检查${NC}"
    echo "=================="

    # 检查后端端口
    if lsof -Pi :5000 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}❌ 5000端口仍被占用${NC}"
    else
        echo -e "${GREEN}✅ 5000端口已释放${NC}"
    fi

    if lsof -Pi :5001 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}❌ 5001端口仍被占用${NC}"
    else
        echo -e "${GREEN}✅ 5001端口已释放${NC}"
    fi

    # 检查8000端口
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}❌ 8000端口仍被占用${NC}"
    else
        echo -e "${GREEN}✅ 8000端口已释放${NC}"
    fi

    if lsof -Pi :8001 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}❌ 8001端口仍被占用${NC}"
    else
        echo -e "${GREEN}✅ 8001端口已释放${NC}"
    fi

    # 检查前端端口
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}❌ 3000端口仍被占用${NC}"
    else
        echo -e "${GREEN}✅ 3000端口已释放${NC}"
    fi

    if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}❌ 3001端口仍被占用${NC}"
    else
        echo -e "${GREEN}✅ 3001端口已释放${NC}"
    fi
}

# 主函数
main() {
    echo -e "${YELLOW}正在停止所有服务...${NC}"

    stop_backend
    stop_frontend
    cleanup_ports

    echo ""
    echo -e "${GREEN}🎉 所有服务已停止${NC}"

    show_status

    echo ""
    echo -e "${BLUE}如需重新启动，请运行: ./start_all.sh${NC}"
}

# 运行主函数
main
