#!/bin/bash
# Start the Claude API proxy server
# This transforms API responses to match Anthropic's expected format

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROXY_FILE="$SCRIPT_DIR/src/proxy.js"
PID_FILE="$SCRIPT_DIR/proxy.pid"
ENV_FILE="$SCRIPT_DIR/.env"

# Load environment variables from .env file first
if [ -f "$ENV_FILE" ]; then
    echo "Loading environment from .env..."
    set -a
    source "$ENV_FILE"
    set +a
fi

# Set defaults if not in .env
LOG_DIR="${LOG_DIR:-$HOME/.claude}"
LOG_FILE="$LOG_DIR/claude-proxy.log"
PID_FILE="$SCRIPT_DIR/proxy.pid"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Proxy already running on PID $OLD_PID"
        exit 0
    fi
    rm -f "$PID_FILE"
fi

# Start the proxy
echo "Starting Claude API proxy..."
cd "$SCRIPT_DIR"
nohup node "$PROXY_FILE" >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 1
echo "Proxy started on PID $(cat $PID_FILE) at localhost:${PROXY_PORT:-18844}"
echo "Logs: $LOG_FILE"
echo "Log rotation: Automatic (daily or 100MB, keeps 5 days)"
