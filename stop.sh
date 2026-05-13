#!/bin/bash
# Stop the Claude API proxy server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/proxy.pid"

# Try to find .env file in multiple locations
ENV_FILE=""
if [ -f "$SCRIPT_DIR/.env" ]; then
    ENV_FILE="$SCRIPT_DIR/.env"
elif [ -f "$HOME/.local/claude-api-proxy/.env" ]; then
    ENV_FILE="$HOME/.local/claude-api-proxy/.env"
elif [ -f "$HOME/.claude/.env" ]; then
    ENV_FILE="$HOME/.claude/.env"
fi

# Load .env to get LOG_DIR
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

LOG_DIR="${LOG_DIR:-$HOME/.claude}"
LOG_FILE="$LOG_DIR/claude-proxy.log"

if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Stopping proxy (PID $OLD_PID)..."
        # Log the shutdown
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SHUTDOWN] Proxy stopped by user" >> "$LOG_FILE"
        kill "$OLD_PID"
        sleep 2
        if kill -0 "$OLD_PID" 2>/dev/null; then
            echo "Force killing..."
            kill -9 "$OLD_PID"
        fi
        rm -f "$PID_FILE"
        echo "Proxy stopped"
    else
        echo "Proxy not running (stale PID file)"
        rm -f "$PID_FILE"
    fi
else
    echo "Proxy not running (no PID file)"
fi
