#!/bin/bash

echo "🚀 股票估值分析系统 - UV环境启动脚本"
echo "===================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 定义日志目录和文件名
LOGS_DIR="$PWD/logs"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
BACKEND_LOG="$LOGS_DIR/backend.log"
FRONTEND_LOG="$LOGS_DIR/frontend.log"

# 确保日志目录存在
mkdir -p $LOGS_DIR

# 检查uv环境
check_uv_env() {
    echo -e "${BLUE}检查UV环境...${NC}"

    if [ ! -d ".venv" ]; then
        echo -e "${RED}❌ 未找到.venv目录，请先创建uv环境${NC}"
        echo -e "${YELLOW}运行命令: uv venv${NC}"
        exit 1
    fi

    if [ ! -f ".venv/bin/activate" ]; then
        echo -e "${RED}❌ 未找到.venv/bin/activate，请检查uv环境${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ UV环境检查通过${NC}"
}

# 激活uv环境
activate_uv_env() {
    echo -e "${BLUE}激活UV环境...${NC}"
    source .venv/bin/activate

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ UV环境已激活${NC}"
        echo -e "${BLUE}Python路径: $(which python)${NC}"
        echo -e "${BLUE}Python版本: $(python --version)${NC}"
    else
        echo -e "${RED}❌ UV环境激活失败${NC}"
        exit 1
    fi
}

# 检查Node.js环境
check_node() {
    echo -e "${BLUE}检查Node.js环境...${NC}"
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ 未找到Node.js，请先安装Node.js${NC}"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ 未找到npm，请先安装npm${NC}"
        exit 1
    fi

    echo -e "${GREEN}✅ Node.js环境检查通过${NC}"
}

# 安装后端依赖
install_backend_deps() {
    echo -e "${BLUE}安装后端依赖...${NC}"

    # 使用uv安装依赖
    if command -v uv &> /dev/null; then
        echo -e "${BLUE}使用uv安装依赖...${NC}"
        uv pip install -r requirements.txt
    else
        echo -e "${BLUE}使用pip安装依赖...${NC}"
        pip install -r requirements.txt
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 后端依赖安装完成${NC}"
    else
        echo -e "${RED}❌ 后端依赖安装失败${NC}"
        exit 1
    fi
}

# 安装前端依赖
install_frontend_deps() {
    echo -e "${BLUE}安装前端依赖...${NC}"
    cd frontend
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ 前端依赖安装完成${NC}"
        cd ..
    else
        echo -e "${RED}❌ 前端依赖安装失败${NC}"
        cd ..
        exit 1
    fi
}

# 启动后端服务
start_backend() {
    echo -e "${BLUE}启动后端服务...${NC}"

    local PORTS=(5000 5001 8000 8001) # 首选端口列表
    BACKEND_PORT=""

    for port in "${PORTS[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
            echo -e "${YELLOW}⚠️  端口 $port 已被占用，尝试下一个端口...${NC}"
        else
            BACKEND_PORT=$port
            echo -e "${GREEN}✅ 找到可用端口: $BACKEND_PORT${NC}"
            break
        fi
    done

    if [ -z "$BACKEND_PORT" ]; then
        echo -e "${RED}❌ 未找到可用后端端口，请手动停止占用端口的进程后重试。${NC}"
        exit 1
    fi

    # 启动后端服务
    python -m uvicorn app:app --host 0.0.0.0 --port $BACKEND_PORT --reload > $BACKEND_LOG 2>&1 &
    BACKEND_PID=$!

    # 等待后端服务启动
    echo -e "${BLUE}等待后端服务启动...${NC}"
    for i in {1..30}; do
        if curl -s "http://localhost:$BACKEND_PORT/" > /dev/null; then
            echo -e "${GREEN}✅ 后端服务启动成功 (端口: $BACKEND_PORT)${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ 后端服务启动超时${NC}"
            kill $BACKEND_PID 2>/dev/null
            exit 1
        fi
        sleep 1
    done

    sleep 1 # 确保服务有时间启动，再写入PID
    echo $BACKEND_PORT > .backend_port
    echo $BACKEND_PID > .backend_pid
}

# 启动前端服务
start_frontend() {
    echo -e "${BLUE}启动前端服务...${NC}"

    # 检查端口是否被占用
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠️  端口3000已被占用，尝试使用端口3001${NC}"
        FRONTEND_PORT=3001
    else
        FRONTEND_PORT=3000
    fi

    cd frontend

    # 读取后端端口并写入前端环境变量文件
    BACKEND_PORT=$(cat ../.backend_port)
    echo "REACT_APP_BACKEND_PORT=$BACKEND_PORT" > .env.development.local
    echo -e "${GREEN}✅ 前端环境变量已更新: REACT_APP_BACKEND_PORT=$BACKEND_PORT${NC}"

    # 更新package.json中的proxy配置
    if [ -f "package.json" ]; then
        # 读取后端端口
        # BACKEND_PORT=$(cat ../.backend_port) # 已经在上面读取，无需重复
        # 更新proxy配置
        sed -i.bak "s|\"proxy\": \".*\"|\"proxy\": \"http://localhost:$BACKEND_PORT\"|" package.json
    fi

    # 启动前端服务
    PORT=$FRONTEND_PORT npm start > $FRONTEND_LOG 2>&1 &
    FRONTEND_PID=$!

    cd ..

    # 等待前端服务启动
    echo -e "${BLUE}等待前端服务启动...${NC}"
    for i in {1..30}; do
        if curl -s "http://localhost:$FRONTEND_PORT" > /dev/null; then
            echo -e "${GREEN}✅ 前端服务启动成功 (端口: $FRONTEND_PORT)${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ 前端服务启动超时${NC}"
            kill $FRONTEND_PID 2>/dev/null
            exit 1
        fi
        sleep 1
    done

    sleep 1 # 确保服务有时间启动，再写入PID
    echo $FRONTEND_PORT > .frontend_port
    echo $FRONTEND_PID > .frontend_pid
}

# 显示服务状态
show_status() {
    echo ""
    echo -e "${GREEN}🎉 所有服务启动完成！${NC}"
    echo "=================================="

    BACKEND_PORT=$(cat .backend_port 2>/dev/null || echo "5000")
    FRONTEND_PORT=$(cat .frontend_port 2>/dev/null || echo "3000")

    echo -e "${BLUE}后端服务:${NC} http://localhost:$BACKEND_PORT"
    echo -e "${BLUE}API文档:${NC} http://localhost:$BACKEND_PORT/docs"
    echo -e "${BLUE}前端应用:${NC} http://localhost:$FRONTEND_PORT"
    echo -e "${BLUE}后端日志:${NC} $BACKEND_LOG"
    echo -e "${BLUE}前端日志:${NC} $FRONTEND_LOG"
    echo ""
    echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
    echo ""
}

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}正在停止服务...${NC}"

    # 停止后端服务
    if [ -f ".backend_pid" ]; then
        BACKEND_PID=$(cat .backend_pid)
        kill $BACKEND_PID 2>/dev/null
        echo -e "${GREEN}✅ 后端服务已停止${NC}"
        rm -f .backend_pid .backend_port
    fi

    # 停止前端服务
    if [ -f ".frontend_pid" ]; then
        FRONTEND_PID=$(cat .frontend_pid)
        kill $FRONTEND_PID 2>/dev/null
        echo -e "${GREEN}✅ 前端服务已停止${NC}"
        rm -f .frontend_pid .frontend_port
    fi

    echo -e "${GREEN}🎯 所有服务已停止${NC}"
    exit 0
}

# 设置信号处理
trap cleanup SIGINT SIGTERM

# 主函数
main() {
    # 检查环境
    check_uv_env
    check_node

    # 激活uv环境
    activate_uv_env

    # 安装依赖
    install_backend_deps
    install_frontend_deps

    # 启动服务
    start_backend
    start_frontend

    # 显示状态
    show_status

    # 等待用户中断
    wait
}

# 运行主函数
main
