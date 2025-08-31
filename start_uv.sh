#!/bin/bash

# 定义默认端口
DEFAULT_FRONTEND_PORT=3000
DEFAULT_BACKEND_PORT=5000

# 从命令行参数读取端口号，如果未提供则使用默认值
FRONTEND_PORT=${1:-$DEFAULT_FRONTEND_PORT}
BACKEND_PORT=${2:-$DEFAULT_BACKEND_PORT}

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

# 启动后端服务
echo "正在启动后端服务 (端口: ${BACKEND_PORT})..."
# 查找可用端口并启动Uvicorn
# start_port=$BACKEND_PORT
# while true;
# do
#   if ! lsof -i :$start_port -sTCP:LISTEN -t > /dev/null; then
#     BACKEND_PORT=$start_port
#     break
#   fi
#   start_port=$((start_port+1))
#   if [ $start_port -gt $((DEFAULT_BACKEND_PORT + 10)) ]; then
#     echo "未找到可用端口启动后端服务，请检查。"
#     exit 1
#   fi
# done

# export BACKEND_PORT=${BACKEND_PORT}
BACKEND_PORT=${BACKEND_PORT} uvicorn app:app --host 0.0.0.0 --port ${BACKEND_PORT} --reload &> logs/backend.log &
BACKEND_PID=$!
echo $BACKEND_PID > backend.pid

echo "后端服务已在端口 ${BACKEND_PORT} 启动，PID: ${BACKEND_PID}"
sleep 1 # Give the backend a moment to start

# 启动前端服务
echo "正在启动前端服务 (端口: ${FRONTEND_PORT})..."

# 设置前端环境变量，包括后端API的基础URL
export REACT_APP_BACKEND_PORT=${BACKEND_PORT}

# 查找可用端口并启动前端
# start_port=$FRONTEND_PORT
# while true;
# do
#   if ! lsof -i :$start_port -sTCP:LISTEN -t > /dev/null; then
#     FRONTEND_PORT=$start_port
#     break
#   fi
#   start_port=$((start_port+1))
#   if [ $start_port -gt $((DEFAULT_FRONTEND_PORT + 10)) ]; then
#     echo "未找到可用端口启动前端服务，请检查。"
#     exit 1
#   fi
# done

cd frontend
# sed -i '' "s|REACT_APP_BACKEND_PORT=.*|REACT_APP_BACKEND_PORT=${BACKEND_PORT}|" .env.development.local # Update .env file
# yarn start --port ${FRONTEND_PORT} &> ../logs/frontend.log &
REACT_APP_BACKEND_PORT=${BACKEND_PORT} HOST=0.0.0.0 PORT=${FRONTEND_PORT} npm start &> ../logs/frontend.log &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../frontend.pid
cd ..

echo "前端服务已在端口 ${FRONTEND_PORT} 启动，PID: ${FRONTEND_PID}"

echo "服务已全部启动。"
