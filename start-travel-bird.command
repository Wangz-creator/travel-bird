#!/bin/bash
# 旅行的鸽子 — 唯一启动入口；双击本文件将启动服务并在浏览器中打开（macOS）。
# 停止：在本窗口按 Ctrl+C，或直接关闭窗口。

set -euo pipefail
cd "$(dirname "$0")"

# 优先使用当前用户安装的稳定版 Node，避免双击时误用 Homebrew 的其他版本。
PREFERRED_NODE_BIN="$HOME/.local/node/bin"
if [[ -x "$PREFERRED_NODE_BIN/node" && -x "$PREFERRED_NODE_BIN/npm" ]]; then
  export PATH="$PREFERRED_NODE_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
else
  export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
fi

# 与本项目 server/index.js 一致（也可用环境变量覆盖）
HTTP_PORT="${PORT:-3000}"
HTTPS_PORT="${HTTPS_PORT:-3443}"
export PORT="$HTTP_PORT"
export HTTPS_PORT

if ! command -v npm >/dev/null 2>&1; then
  osascript -e 'display alert "未找到 npm" message "请先安装 Node.js：https://nodejs.org"' 2>/dev/null || \
    echo "错误：未找到 npm，请先安装 Node.js。"
  exit 1
fi

echo "当前 Node: $(command -v node) ($(node -v))"
echo "当前 npm : $(command -v npm) ($(npm -v))"

if [[ ! -f package.json ]]; then
  echo "错误：请在「旅行的鸽子」项目根目录中保留本脚本（当前: $(pwd)）"
  read -r _
  exit 1
fi

# 释放本应用默认端口上的旧进程，避免「端口已被占用」或重复实例
kill_port_listeners() {
  local port pids
  for port in "$@"; do
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -z "$pids" ]] && continue
    echo "正在结束占用端口 $port 的进程：$pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.5
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      echo "正在强制结束端口 $port …"
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  done
}

echo "检查并释放端口 ${HTTP_PORT}、${HTTPS_PORT}（无占用则跳过）…"
kill_port_listeners "$HTTP_PORT" "$HTTPS_PORT"
sleep 0.3

cleanup() {
  if [[ -n "${NPM_PID:-}" ]] && kill -0 "$NPM_PID" 2>/dev/null; then
    echo ""
    echo "正在停止服务 (PID $NPM_PID)…"
    kill "$NPM_PID" 2>/dev/null || true
    wait "$NPM_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

if [[ ! -d node_modules ]]; then
  echo "未检测到 node_modules，正在安装依赖..."
  npm install
fi

echo "正在启动：npm start …"
npm start &
NPM_PID=$!

echo "等待 HTTP 端口 ${HTTP_PORT}…"
for _ in $(seq 1 40); do
  if curl -s -o /dev/null --connect-timeout 1 "http://127.0.0.1:${HTTP_PORT}/" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

open "http://localhost:${HTTP_PORT}" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  旅行的鸽子 已运行"
echo "  浏览器: http://localhost:${HTTP_PORT}"
echo "  HTTPS : https://localhost:${HTTPS_PORT}（需已生成证书时）"
echo ""
echo "  停止服务：按 Ctrl+C，或关闭本窗口"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

wait "$NPM_PID"
