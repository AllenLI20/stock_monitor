#!/usr/bin/env python3
"""
内存和性能监控脚本
用于监控股票监控系统的资源使用情况
"""

import psutil
import time
import logging
from datetime import datetime
import os

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/memory_monitor.log'),
        logging.StreamHandler()
    ]
)

def get_memory_usage():
    """获取内存使用情况"""
    memory = psutil.virtual_memory()
    return {
        'total': memory.total / (1024**3),  # GB
        'available': memory.available / (1024**3),  # GB
        'used': memory.used / (1024**3),  # GB
        'percent': memory.percent
    }

def get_cpu_usage():
    """获取CPU使用情况"""
    return psutil.cpu_percent(interval=1)

def get_disk_usage():
    """获取磁盘使用情况"""
    disk = psutil.disk_usage('/')
    return {
        'total': disk.total / (1024**3),  # GB
        'used': disk.used / (1024**3),  # GB
        'free': disk.free / (1024**3),  # GB
        'percent': (disk.used / disk.total) * 100
    }

def get_process_info():
    """获取关键进程信息"""
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'memory_info', 'cpu_percent']):
        try:
            if proc.info['name'] in ['python', 'uvicorn', 'node', 'npm']:
                processes.append({
                    'pid': proc.info['pid'],
                    'name': proc.info['name'],
                    'memory_mb': proc.info['memory_info'].rss / (1024**2),
                    'cpu_percent': proc.info['cpu_percent']
                })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return processes

def check_log_file_size():
    """检查日志文件大小"""
    log_files = ['logs/backend.log', 'logs/frontend.log']
    for log_file in log_files:
        if os.path.exists(log_file):
            size_mb = os.path.getsize(log_file) / (1024**2)
            if size_mb > 10:  # 超过10MB
                logging.warning(f"日志文件 {log_file} 过大: {size_mb:.2f}MB")

def monitor_resources():
    """监控系统资源"""
    while True:
        try:
            # 获取系统信息
            memory = get_memory_usage()
            cpu = get_cpu_usage()
            disk = get_disk_usage()
            processes = get_process_info()

            # 记录资源使用情况
            logging.info(f"内存使用: {memory['percent']:.1f}% ({memory['used']:.2f}GB/{memory['total']:.2f}GB)")
            logging.info(f"CPU使用: {cpu:.1f}%")
            logging.info(f"磁盘使用: {disk['percent']:.1f}% ({disk['used']:.2f}GB/{disk['total']:.2f}GB)")

            # 检查进程
            for proc in processes:
                if proc['memory_mb'] > 100:  # 超过100MB
                    logging.warning(f"进程 {proc['name']}(PID:{proc['pid']}) 内存使用过高: {proc['memory_mb']:.2f}MB")

            # 检查日志文件大小
            check_log_file_size()

            # 内存使用过高警告
            if memory['percent'] > 80:
                logging.warning(f"内存使用率过高: {memory['percent']:.1f}%")

            # CPU使用过高警告
            if cpu > 80:
                logging.warning(f"CPU使用率过高: {cpu:.1f}%")

            # 磁盘使用过高警告
            if disk['percent'] > 90:
                logging.warning(f"磁盘使用率过高: {disk['percent']:.1f}%")

            # 每5分钟检查一次
            time.sleep(300)

        except Exception as e:
            logging.error(f"监控过程中出现错误: {e}")
            time.sleep(60)

if __name__ == "__main__":
    logging.info("开始监控系统资源...")
    monitor_resources()
