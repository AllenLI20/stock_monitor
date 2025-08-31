#!/bin/bash

# 优化后的启动脚本
# 包含性能优化和内存管理

# 定义默认端口
DEFAULT_FRONTEND_PORT=3000
DEFAULT_BACKEND_PORT=5000

# 从命令行参数读取端口号，如果未提供则使用默认值
FRONTEND_PORT=${1:-$DEFAULT_FRONTEND_PORT}
BACKEND_PORT=${2:-$DEFAULT_BACKEND_PORT}

# 性能优化配置
export PYTHONOPTIMIZE=1  # 启用Python优化
export PYTHONUNBUFFERED=1  # 禁用输出缓冲
export PYTHONDONTWRITEBYTECODE=1  # 不生成.pyc文件

# 检查 .venv 虚拟环境是否存在
if [ ! -d ".venv" ]; then
    echo "找不到 .venv 虚拟环境，正在创建..."
    uv venv
    if [ $? -ne 0 ]; then
        echo "创建虚拟环境失败，请检查uv是否安装。"
        exit 1
    fi
fi

# 激活虚拟环境
source .venv/bin/activate

# 安装依赖
echo "正在安装或更新Python依赖..."
uv pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "安装Python依赖失败。"
    exit 1
fi

# 创建日志目录
mkdir -p logs

# 清理旧日志文件（超过100MB）
find logs/ -name "*.log" -size +100M -delete 2>/dev/null

# 启动后端服务（优化配置）
echo "正在启动后端服务 (端口: ${BACKEND_PORT})..."
export BACKEND_PORT=${BACKEND_PORT}

# 使用优化配置启动Uvicorn
BACKEND_PORT=${BACKEND_PORT} uvicorn app:app \
    --host 0.0.0.0 \
    --port ${BACKEND_PORT} \
    --workers 1 \
    --loop uvloop \
    --http httptools \
    --reload \
    --log-level warning \
    &> logs/backend.log &

BACKEND_PID=$!
echo $BACKEND_PID > backend.pid

echo "后端服务已在端口 ${BACKEND_PORT} 启动，PID: ${BACKEND_PID}"
sleep 2 # 给后端更多时间启动

# 启动前端服务
echo "正在启动前端服务 (端口: ${FRONTEND_PORT})..."

# 设置前端环境变量
export REACT_APP_BACKEND_PORT=${BACKEND_PORT}
export NODE_ENV=production  # 生产环境模式
export GENERATE_SOURCEMAP=false  # 禁用源码映射

cd frontend

# 清理前端缓存
rm -rf node_modules/.cache 2>/dev/null

# 启动前端（优化配置）
REACT_APP_BACKEND_PORT=${BACKEND_PORT} \
HOST=0.0.0.0 \
PORT=${FRONTEND_PORT} \
npm start \
&> ../logs/frontend.log &

FRONTEND_PID=$!
echo $FRONTEND_PID > ../frontend.pid
cd ..

echo "前端服务已在端口 ${FRONTEND_PORT} 启动，PID: ${FRONTEND_PID}"

# 启动内存监控（可选）
echo "是否启动内存监控？(y/n)"
read -r start_monitor
if [[ $start_monitor =~ ^[Yy]$ ]]; then
    echo "正在启动内存监控..."
    python monitor_memory.py &
    echo $! > memory_monitor.pid
    echo "内存监控已启动，PID: $!"
fi

echo "服务已全部启动。"
echo "使用 './stop_all.sh' 停止所有服务"
echo "使用 'tail -f logs/backend.log' 查看后端日志"
echo "使用 'tail -f logs/frontend.log' 查看前端日志"
