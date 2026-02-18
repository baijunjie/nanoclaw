#!/bin/bash
# NanoClaw 停止脚本
# 停止服务并清理所有容器

cd "$(dirname "$0")/.."

echo "=== NanoClaw 停止脚本 ==="
echo ""

# 1. 停止 launchd 服务
echo "[1/4] 停止服务..."
if launchctl list 2>/dev/null | grep -q com.nanoclaw; then
    launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist 2>/dev/null || true
    echo "  ✓ 已卸载服务"
else
    echo "  ✓ 服务未加载"
fi

# 2. 清理残留进程
echo "[2/4] 清理残留进程..."
PIDS=$(pgrep -f "node.*dist/index.js" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null || true
    sleep 1
    echo "  ✓ 已终止残留进程"
else
    echo "  ✓ 无残留进程"
fi

# 3. 清理容器
echo "[3/4] 清理容器..."
OLD_CONTAINERS=$(container list 2>/dev/null | grep nanoclaw-agent | awk '{print $1}' || true)
if [ -n "$OLD_CONTAINERS" ]; then
    COUNT=$(echo "$OLD_CONTAINERS" | wc -l | tr -d ' ')
    # 使用 SIGKILL 强制停止卡住的容器
    echo "$OLD_CONTAINERS" | xargs -I{} container stop --signal SIGKILL --time 0 {} 2>/dev/null || true
    sleep 1
    # 再次检查并强制清理
    REMAINING=$(container list 2>/dev/null | grep nanoclaw-agent | awk '{print $1}' || true)
    if [ -n "$REMAINING" ]; then
        echo "  ⚠️  部分容器未停止，重试..."
        echo "$REMAINING" | xargs -I{} container stop --signal SIGKILL --time 0 {} 2>/dev/null || true
    fi
    echo "  ✓ 已清理 $COUNT 个容器"
else
    echo "  ✓ 无运行中的容器"
fi

# 4. 验证状态
echo "[4/4] 验证状态..."
SERVICE_STOPPED=true
CONTAINER_STOPPED=true

if launchctl list 2>/dev/null | grep -q com.nanoclaw; then
    SERVICE_STOPPED=false
fi

CONTAINER_COUNT=$(container list 2>/dev/null | grep -c nanoclaw-agent || echo "0")
if [ "$CONTAINER_COUNT" -gt 0 ]; then
    CONTAINER_STOPPED=false
fi

if $SERVICE_STOPPED && $CONTAINER_STOPPED; then
    echo "  ✓ 全部已停止"
else
    if ! $SERVICE_STOPPED; then
        echo "  ⚠️  服务可能仍在运行，请手动检查: launchctl list | grep nanoclaw"
    fi
    if ! $CONTAINER_STOPPED; then
        echo "  ⚠️  仍有 $CONTAINER_COUNT 个容器，请手动检查: container list"
    fi
fi

echo ""
echo "=== 停止完成 ==="