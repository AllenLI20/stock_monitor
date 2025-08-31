#!/bin/bash

# 定义默认端口
DEFAULT_FRONTEND_PORT=3000
DEFAULT_BACKEND_PORT=5000

# 从命令行参数读取端口号，如果未提供则使用默认值
FRONTEND_PORT=${1:-$DEFAULT_FRONTEND_PORT}
BACKEND_PORT=${2:-$DEFAULT_BACKEND_PORT}

echo "正在停止股票估值分析系统服务..."

# 停止后端服务
if [ -f "backend.pid" ]; then
    BACKEND_PID=$(cat backend.pid)
    if ps -p $BACKEND_PID > /dev/null; then
        echo "正在停止后端服务 (PID: $BACKEND_PID)"
        kill $BACKEND_PID
        # 等待进程完全停止
        wait $BACKEND_PID 2>/dev/null
        echo "后端服务已停止。"
    else
        echo "后端PID文件存在，但进程 $BACKEND_PID 未运行。"
    fi
    rm backend.pid
else
    echo "未找到后端PID文件 (backend.pid)。"
fi

# 停止前端服务
if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null; then
        echo "正在停止前端服务 (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID
        # 等待进程完全停止
        wait $FRONTEND_PID 2>/dev/null
        echo "前端服务已停止。"
    else
        echo "前端PID文件存在，但进程 $FRONTEND_PID 未运行。"
    fi
    rm frontend.pid
else
    echo "未找到前端PID文件 (frontend.pid)。"
fi

# 清理可能残留的端口占用
echo "正在清理可能残留的端口占用..."

# 尝试清理默认前端端口
LSOF_FRONTEND_DEFAULT=$(lsof -i :$DEFAULT_FRONTEND_PORT -sTCP:LISTEN -t)
if [ -n "$LSOF_FRONTEND_DEFAULT" ]; then
    echo "强制杀死占用默认前端端口 $DEFAULT_FRONTEND_PORT 的进程: $LSOF_FRONTEND_DEFAULT"
    kill -9 $LSOF_FRONTEND_DEFAULT
fi

# 尝试清理用户指定的前端端口
if [ "$FRONTEND_PORT" -ne "$DEFAULT_FRONTEND_PORT" ]; then
    LSOF_FRONTEND_CUSTOM=$(lsof -i :$FRONTEND_PORT -sTCP:LISTEN -t)
    if [ -n "$LSOF_FRONTEND_CUSTOM" ]; then
        echo "强制杀死占用指定前端端口 $FRONTEND_PORT 的进程: $LSOF_FRONTEND_CUSTOM"
        kill -9 $LSOF_FRONTEND_CUSTOM
    fi
fi

# 尝试清理默认后端端口
LSOF_BACKEND_DEFAULT=$(lsof -i :$DEFAULT_BACKEND_PORT -sTCP:LISTEN -t)
if [ -n "$LSOF_BACKEND_DEFAULT" ]; then
    echo "强制杀死占用默认后端端口 $DEFAULT_BACKEND_PORT 的进程: $LSOF_BACKEND_DEFAULT"
    kill -9 $LSOF_BACKEND_DEFAULT
fi

# 尝试清理用户指定的后端端口
if [ "$BACKEND_PORT" -ne "$DEFAULT_BACKEND_PORT" ]; then
    LSOF_BACKEND_CUSTOM=$(lsof -i :$BACKEND_PORT -sTCP:LISTEN -t)
    if [ -n "$LSOF_BACKEND_CUSTOM" ]; then
        echo "强制杀死占用指定后端端口 $BACKEND_PORT 的进程: $LSOF_BACKEND_CUSTOM"
        kill -9 $LSOF_BACKEND_CUSTOM
    fi
fi

echo "所有服务停止完成。"
