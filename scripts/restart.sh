#!/bin/bash
# NanoClaw 重启脚本
# 自动处理 token 更新、会话清理、构建和服务重启

set -e

cd "$(dirname "$0")/.."

echo "=== NanoClaw 重启脚本 ==="
echo ""

# 1. 更新 OAuth Token
echo "[1/6] 更新 OAuth Token..."
TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | jq -r '.claudeAiOauth.accessToken' 2>/dev/null || echo "")

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "  ⚠️  无法从 Keychain 获取 token，跳过更新"
else
    # 更新或添加 token（保留其他变量）
    if grep -q "^CLAUDE_CODE_OAUTH_TOKEN=" .env 2>/dev/null; then
        sed -i '' "s|^CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=$TOKEN|" .env
    else
        echo "CLAUDE_CODE_OAUTH_TOKEN=$TOKEN" >> .env
    fi
    # 同步到容器环境文件
    mkdir -p data/env
    echo "CLAUDE_CODE_OAUTH_TOKEN=$TOKEN" > data/env/env
    echo "  ✓ Token 已更新 (${TOKEN:0:20}...)"
fi

# 2. 会话缓存（默认保留）
# 使用 --clean 参数强制清理会话
echo "[2/6] 检查会话缓存..."
if [ "$1" = "--clean" ]; then
    if [ -d "data/sessions/main/.claude" ]; then
        rm -rf data/sessions/main/.claude/*
        echo "  ✓ 已清理 Claude Code 缓存"
    fi
    if [ -f "data/sessions.json" ]; then
        rm -f data/sessions.json
        echo "  ✓ 已删除会话索引"
    fi
else
    echo "  ✓ 保留会话上下文（使用 --clean 强制清理）"
fi

# 3. 重新构建
echo "[3/6] 构建 TypeScript..."
npm run build > /dev/null 2>&1
echo "  ✓ 构建完成"

# 4. 清理旧容器
echo "[4/6] 清理旧容器..."
OLD_CONTAINERS=$(container list 2>/dev/null | grep nanoclaw-agent | awk '{print $1}' || true)
if [ -n "$OLD_CONTAINERS" ]; then
    echo "$OLD_CONTAINERS" | xargs -I{} container stop {} 2>/dev/null || true
    echo "  ✓ 已清理旧容器"
else
    echo "  ✓ 无旧容器"
fi

# 5. 重启服务
echo "[5/6] 重启服务..."
PLIST=~/Library/LaunchAgents/com.nanoclaw.plist
if launchctl list | grep -q com.nanoclaw; then
    # 服务已加载，用 kickstart 重启
    launchctl kickstart -k gui/$(id -u)/com.nanoclaw > /dev/null 2>&1 || true
else
    # 服务未加载，先 load
    launchctl load "$PLIST" 2>/dev/null || true
fi
sleep 2

# 6. 验证服务状态
echo "[6/6] 验证服务状态..."
STATUS=$(launchctl list | grep nanoclaw || echo "")
if [ -n "$STATUS" ]; then
    PID=$(echo "$STATUS" | awk '{print $1}')
    # PID 为数字表示进程在运行
    if [[ "$PID" =~ ^[0-9]+$ ]]; then
        echo "  ✓ 服务运行中 (PID: $PID)"
    else
        echo "  ⚠️  无法确认服务状态，请手动检查: launchctl list | grep nanoclaw"
    fi
else
    echo "  ⚠️  无法确认服务状态，请手动检查: launchctl list | grep nanoclaw"
fi

echo ""
echo "=== 重启完成 ==="
