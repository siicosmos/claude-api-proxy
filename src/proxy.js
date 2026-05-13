const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// Configuration
const TARGET_URL = process.env.TARGET_URL || 'http://192.168.1.100:8443';
const PROXY_PORT = process.env.PROXY_PORT || 18844;
const LOG_DIR = process.env.LOG_DIR || path.join(process.env.HOME || '/tmp', '.claude');
const LOG_FILE = path.join(LOG_DIR, 'claude-proxy.log');
const MAX_LOG_DAYS = 5;

// Statistics
const stats = {
  startTime: new Date(),
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  transformedResponses: 0,
  streamingRequests: 0,
  contentTransforms: {
    emptyToArray: 0,
    stringToArray: 0,
    valueToText: 0,
    missingType: 0
  }
};

// Log rotation - daily at 2 AM or every 100MB
let lastRotation = Date.now();
let currentLogSize = 0;

function rotateLogs() {
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rotatedFile = `${LOG_FILE}.${date}`;

  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.renameSync(LOG_FILE, rotatedFile);
      console.log(`[${ts()}] [LOG] Rotated to ${rotatedFile}`);
    }
    // Clean up old logs
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const maxAge = MAX_LOG_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.startsWith('claude-proxy.log.')) {
        const filePath = path.join(LOG_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`[${ts()}] [LOG] Deleted old log: ${file}`);
        }
      }
    }
    currentLogSize = 0;
  } catch (e) {
    console.error(`[${ts()}] [LOG] Rotation error: ${e.message}`);
  }
}

// Check for log rotation every minute
setInterval(() => {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      currentLogSize = stat.size;

      // Rotate if file > 100MB
      if (currentLogSize > 100 * 1024 * 1024) {
        rotateLogs();
      }
    }
  } catch (e) {
    // Ignore rotation errors
  }
}, 60000);

// Helper to format timestamp
function ts() {
  return new Date().toLocaleString('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

// Statistics every 5 minutes
setInterval(() => {
  const uptime = Math.round((Date.now() - stats.startTime.getTime()) / 1000);
  console.log(`\n[${ts()}] === Proxy Statistics (uptime: ${uptime}s) ===`);
  console.log(`[${ts()}] Total requests: ${stats.totalRequests}`);
  console.log(`[${ts()}]   - Successful: ${stats.successfulRequests}`);
  console.log(`[${ts()}]   - Failed: ${stats.failedRequests}`);
  console.log(`[${ts()}]   - Streaming: ${stats.streamingRequests}`);
  console.log(`[${ts()}] Transformed responses: ${stats.transformedResponses}`);
  console.log(`[${ts()}] Content transforms:`);
  console.log(`[${ts()}]   - Empty to array: ${stats.contentTransforms.emptyToArray}`);
  console.log(`[${ts()}]   - String to array: ${stats.contentTransforms.stringToArray}`);
  console.log(`[${ts()}]   - value->text: ${stats.contentTransforms.valueToText}`);
  console.log(`[${ts()}]   - Missing type: ${stats.contentTransforms.missingType}`);
  console.log(`[${ts()}] Log size: ${Math.round(currentLogSize / 1024)}KB`);
  console.log(`[${ts()}] =====================================\n`);
}, 300000);

function transformContent(content, statsRef = true) {
  // If content is already an array, process each block
  if (Array.isArray(content)) {
    if (content.length === 0 && statsRef) {
      stats.contentTransforms.emptyToArray++;
      console.log(`[${ts()}] [TRANSFORM] Empty content array -> placeholder`);
    }
    return content.map(block => {
      // Ensure each block has a type
      if (!block.type) {
        block.type = 'text';
        statsRef && stats.contentTransforms.missingType++;
        console.log(`[${ts()}] [TRANSFORM] Added missing type to content block`);
      }
      // Ensure text blocks have 'text' field
      if (block.type === 'text' && block.text === undefined && block.value !== undefined) {
        block.text = block.value;
        delete block.value;
        statsRef && stats.contentTransforms.valueToText++;
        console.log(`[${ts()}] [TRANSFORM] Converted 'value' to 'text'`);
      }
      return block;
    });
  }
  // If content is a string, wrap it
  if (typeof content === 'string') {
    statsRef && stats.contentTransforms.stringToArray++;
    console.log(`[${ts()}] [TRANSFORM] String content -> array`);
    return [{ type: 'text', text: content }];
  }
  // If content is null/undefined, return empty array
  if (content === null || content === undefined) {
    statsRef && stats.contentTransforms.emptyToArray++;
    console.log(`[${ts()}] [TRANSFORM] Null/undefined content -> empty text block`);
    return [{ type: 'text', text: '' }];
  }
  // Fallback
  console.log(`[${ts()}] [TRANSFORM] Unknown content type -> string`);
  return [{ type: 'text', text: String(content) }];
}

function transformResponse(data) {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    let wasTransformed = false;

    // Transform message responses
    if (parsed.type === 'message' || parsed.id) {
      let needsTransform = false;

      // Check if transformation is needed
      if (Array.isArray(parsed.content) && parsed.content.length === 0) {
        needsTransform = true;
        console.log(`[${ts()}] [RESPONSE] Empty content array detected`);
      } else if (parsed.content !== undefined && !Array.isArray(parsed.content)) {
        needsTransform = true;
        console.log(`[${ts()}] [RESPONSE] Non-array content detected`);
      }

      if (needsTransform) {
        parsed.content = transformContent(parsed.content);
        wasTransformed = true;
      } else if (parsed.content !== undefined) {
        // Still process content but don't count as transformed
        transformContent(parsed.content, false);
      }

      // Ensure required fields
      if (!parsed.type) parsed.type = 'message';
      if (!parsed.role) parsed.role = 'assistant';
      if (!parsed.stop_reason) parsed.stop_reason = 'end_turn';
    }

    if (wasTransformed) {
      stats.transformedResponses++;
    }
    return JSON.stringify(parsed);
  } catch (e) {
    console.error(`[${ts()}] [ERROR] Transform error: ${e.message}`);
    stats.failedRequests++;
    return data;
  }
}

function proxyRequest(req, res) {
  stats.totalRequests++;
  const startTime = Date.now();
  const targetUrl = new URL(TARGET_URL + req.url);

  console.log(`[${ts()}] [REQUEST] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: { ...req.headers }
  };

  // Fix host header
  delete options.headers.host;

  const proxyReq = (targetUrl.protocol === 'https:' ? https : http).request(options, (proxyRes) => {
    const isStreaming = proxyRes.headers['content-type']?.includes('text/event-stream');

    if (isStreaming) {
      stats.streamingRequests++;
      console.log(`[${ts()}] [RESPONSE] ${proxyRes.statusCode} (streaming)`);
    } else {
      console.log(`[${ts()}] [RESPONSE] ${proxyRes.statusCode} ${proxyRes.headers['content-type'] || ''}`);
    }

    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    let chunks = [];
    proxyRes.on('data', (chunk) => {
      chunks.push(chunk);
    });

    proxyRes.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = proxyRes.headers['content-type'] || '';
      const duration = Date.now() - startTime;

      if (contentType.includes('application/json') || contentType.includes('text/event-stream')) {
        // Handle streaming (SSE)
        if (contentType.includes('text/event-stream')) {
          const lines = body.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonData = JSON.parse(line.slice(6));
                // Transform content_block_delta events
                if (jsonData.type === 'content_block_delta' && jsonData.delta) {
                  if (jsonData.delta.text_delta !== undefined && jsonData.delta.text === undefined) {
                    jsonData.delta.text = jsonData.delta.text_delta;
                    delete jsonData.delta.text_delta;
                    stats.contentTransforms.valueToText++;
                    console.log(`[${ts()}] [STREAM] Transformed text_delta -> text`);
                  }
                }
                // Transform message_start with content
                if (jsonData.type === 'message_start' && jsonData.message) {
                  if (jsonData.message.content !== undefined) {
                    jsonData.message.content = transformContent(jsonData.message.content, false);
                  }
                }
                res.write(`data: ${JSON.stringify(jsonData)}\n`);
              } catch (e) {
                res.write(line + '\n');
              }
            } else if (line.trim()) {
              res.write(line + '\n');
            }
          }
        } else {
          // Non-streaming JSON
          const transformed = transformResponse(body.toString());
          res.write(transformed);
        }
      } else {
        res.write(body);
      }

      console.log(`[${ts()}] [COMPLETE] ${duration}ms, body: ${body.length} bytes`);
      stats.successfulRequests++;
      res.end();
    });
  });

  proxyReq.on('error', (e) => {
    console.error(`[${ts()}] [ERROR] Proxy error: ${e.message}`);
    stats.failedRequests++;
    res.writeHead(502);
    res.end(JSON.stringify({ error: 'Proxy error', message: e.message }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer(proxyRequest);

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[${ts()}] Proxy started: ${TARGET_URL} -> localhost:${PROXY_PORT}`);
});

process.on('SIGINT', () => {
  console.log(`\n[${ts()}] === Final Statistics ===`);
  const uptime = Math.round((Date.now() - stats.startTime.getTime()) / 1000);
  console.log(`[${ts()}] Uptime: ${uptime}s`);
  console.log(`[${ts()}] Total requests: ${stats.totalRequests}`);
  console.log(`[${ts()}] Successful: ${stats.successfulRequests}`);
  console.log(`[${ts()}] Failed: ${stats.failedRequests}`);
  console.log(`[${ts()}] Streaming: ${stats.streamingRequests}`);
  console.log(`[${ts()}] Transformed: ${stats.transformedResponses}`);
  console.log(`[${ts()}] Log size: ${Math.round(currentLogSize / 1024)}KB`);
  console.log(`[${ts()}] ========================\n`);
  server.close();
  process.exit();
});

process.on('SIGTERM', () => {
  console.log(`[${ts()}] [SHUTDOWN] Received SIGTERM, stopping...`);
  server.close();
  process.exit();
});
