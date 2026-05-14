# Claude API Proxy

A transparent proxy for the Claude API that transforms responses to match Anthropic's expected format. This is useful when working with custom Claude API-compatible endpoints that may not return responses in the exact format expected by Claude Code or other Anthropic SDK clients.

## Features

- **Content Block Transformation**: Automatically transforms API responses to match Anthropic's content block format
  - Converts string content to proper `[{ type: "text", text: "..." }]` format
  - Handles empty content arrays
  - Fixes missing `type` fields in content blocks
  - Transforms `value` fields to `text` fields

- **Streaming Support**: Handles Server-Sent Events (SSE) for streaming responses
  - Transforms `text_delta` to `text` in content block deltas
  - Properly handles `message_start`, `content_block_start`, and related events

- **Logging & Statistics**:
  - Detailed request/response logging
  - Statistics every 5 minutes (requests, transforms, etc.)
  - Automatic log rotation (100MB or daily)
  - Keeps 5 days of logs

- **Configurable**:
  - `TARGET_URL`: Backend API endpoint
  - `PROXY_PORT`: Local proxy port
  - `LOG_DIR`: Log file directory

## Quick Start

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd claude-api-proxy

# Option 1: Install system-wide (recommended)
./install.sh

# Option 2: Install with custom configuration
./install.sh \
  --target-url http://your-api-server:8443 \
  --proxy-port 18844 \
  --log-dir $HOME/.claude

# Option 3: Run from source
cp .env.example .env
# Edit .env with your target URL
./start.sh
```

### Usage

```bash
# If installed system-wide
claude-proxy              # Start the proxy
claude-proxy-stop         # Stop the proxy

# Or use scripts directly
./start.sh
./stop.sh
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET_URL` | `http://192.168.1.100:8443` | Backend API endpoint |
| `PROXY_PORT` | `18844` | Local proxy port |
| `LOG_DIR` | `~/.claude` | Directory for log files |

### Install Script Options

```bash
./install.sh [OPTIONS]

Options:
  --target-url URL     Target API endpoint (default: http://192.168.1.100:8443)
  --proxy-port PORT    Local proxy port (default: 18844)
  --log-dir DIR        Log directory (default: ~/.claude)
  --install-dir DIR    Installation directory (default: ~/.local/claude-api-proxy)
  --bin-dir DIR        Bin directory for launcher scripts (default: ~/.local/bin)
  -h, --help           Show help message
```

## Usage with Claude Code

Update your Claude Code configuration to use the local proxy:

```json
{
  "claudeCode.environmentVariables": [
    {
      "name": "ANTHROPIC_BASE_URL",
      "value": "http://localhost:18844"
    },
    {
      "name": "ANTHROPIC_AUTH_TOKEN",
      "value": "your-api-key"
    }
  ]
}
```

## Scripts

| Command | Description |
|---------|-------------|
| `./install.sh` | Install system-wide (supports `--help` for options) |
| `claude-proxy` | Start proxy (after install) |
| `claude-proxy-stop` | Stop proxy (after install) |
| `./start.sh` | Start the proxy server (loads `.env`) |
| `./stop.sh` | Stop the proxy server (logs shutdown) |
| `npm start` | Run directly with Node.js |
| `npm run dev` | Run with auto-reload on changes |

## Log Output

Example log output:

```
[2026-05-13, 4:21:35 PM] [REQUEST] POST /v1/messages?beta=true from 127.0.0.1
[2026-05-13, 4:21:36 PM] [RESPONSE] 200 (streaming)
[2026-05-13, 4:21:36 PM] [TRANSFORM] Empty content array -> placeholder
[2026-05-13, 4:21:36 PM] [STREAM] Transformed text_delta -> text
[2026-05-13, 4:21:36 PM] [COMPLETE] 1234ms, body: 2048 bytes

[2026-05-13, 4:26:35 PM] === Proxy Statistics (uptime: 300s) ===
[2026-05-13, 4:26:35 PM] Total requests: 42
[2026-05-13, 4:26:35 PM]   - Successful: 41
[2026-05-13, 4:26:35 PM]   - Failed: 1
[2026-05-13, 4:26:35 PM]   - Streaming: 35
[2026-05-13, 4:26:35 PM] Transformed responses: 12
[2026-05-13, 4:26:35 PM] Content transforms:
[2026-05-13, 4:26:35 PM]   - Empty to array: 5
[2026-05-13, 4:26:35 PM]   - String to array: 3
[2026-05-13, 4:26:35 PM]   - value->text: 8
[2026-05-13, 4:26:35 PM]   - Missing type: 2
[2026-05-13, 4:26:35 PM] Log size: 156KB
[2026-05-13, 4:26:35 PM] =====================================

[2026-05-13, 4:30:00 PM] [SHUTDOWN] Received SIGTERM, stopping...
```

## License

MIT - see [LICENSE](LICENSE) file for details.
