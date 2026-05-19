import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { spawn } from 'child_process';
import readline from 'readline';
import { EventEmitter } from 'events';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Process states
let activeProcess = null;
let activeProcessInterface = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'crashed'
let activeConfig = null;

// SSE Proxy states
let sseController = null;
let sseMessageUrl = null;

const eventBus = new EventEmitter();

// Setup WebSocket connection upgrade
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  // Immediately send current status
  ws.send(JSON.stringify({
    type: 'status-change',
    status: connectionStatus,
    config: activeConfig
  }));

  // Handle messages from the frontend UI
  ws.on('message', async (messageStr) => {
    try {
      const msg = JSON.parse(messageStr);
      
      switch (msg.type) {
        case 'connect-stdio':
          await handleConnectStdio(msg.config, ws);
          break;
        case 'connect-sse':
          await handleConnectSse(msg.config, ws);
          break;
        case 'disconnect':
          handleDisconnect(ws);
          break;
        case 'send-rpc':
          handleSendRpc(msg.payload, ws);
          break;
        default:
          console.warn('Unknown message type:', msg.type);
      }
    } catch (err) {
      console.error('Error parsing WS message:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid request format from client'
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
});

// Helper to broadcast to all WS clients
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

function updateStatus(status) {
  connectionStatus = status;
  broadcast({
    type: 'status-change',
    status: connectionStatus,
    config: activeConfig
  });
}

// 1. Spawning local stdio MCP processes
async function handleConnectStdio(config, ws) {
  if (activeProcess) {
    handleDisconnect();
  }

  const { command, args = [], cwd, env = {} } = config;
  activeConfig = config;
  updateStatus('connecting');

  console.log(`Spawning MCP process: ${command} ${args.join(' ')} (CWD: ${cwd || 'default'})`);
  broadcast({
    type: 'system-log',
    message: `Spawning server: ${command} ${args.join(' ')}`
  });

  try {
    const mergedEnv = {
      ...process.env,
      ...env,
      FORCE_COLOR: '1' // Request colored logs from subprocesses if they support it
    };

    activeProcess = spawn(command, args, {
      cwd: cwd || undefined,
      env: mergedEnv,
      shell: true // Uses shell for easier path resolutions on Windows
    });

    activeProcessInterface = readline.createInterface({
      input: activeProcess.stdout,
      terminal: false
    });

    // Monitor stdout (JSON-RPC line-delimited)
    activeProcessInterface.on('line', (line) => {
      if (!line.trim()) return;
      
      // Attempt to check if it's a valid JSON-RPC packet
      let isJsonRpc = false;
      try {
        const parsed = JSON.parse(line);
        if (parsed.jsonrpc === '2.0') {
          isJsonRpc = true;
        }
      } catch (e) {}

      broadcast({
        type: 'stdout-line',
        line,
        isJsonRpc
      });
    });

    // Monitor stderr (raw logs)
    activeProcess.stderr.on('data', (data) => {
      const text = data.toString();
      broadcast({
        type: 'stderr-line',
        text
      });
    });

    // Handle process events
    activeProcess.on('error', (err) => {
      console.error('Failed to start subprocess:', err);
      broadcast({
        type: 'system-log',
        message: `Process Error: ${err.message}`
      });
      updateStatus('crashed');
      cleanupProcess();
    });

    activeProcess.on('close', (code, signal) => {
      console.log(`Subprocess exited with code ${code}, signal ${signal}`);
      broadcast({
        type: 'system-log',
        message: `Server process exited. Code: ${code}, Signal: ${signal}`
      });
      if (connectionStatus !== 'disconnected') {
        updateStatus(code === 0 ? 'disconnected' : 'crashed');
      }
      cleanupProcess();
    });

    updateStatus('connected');
    broadcast({
      type: 'system-log',
      message: 'Server process spawned. Initializing handshake...'
    });

  } catch (err) {
    console.error('Error spawning process:', err);
    broadcast({
      type: 'system-log',
      message: `Launch error: ${err.message}`
    });
    updateStatus('crashed');
    cleanupProcess();
  }
}

// Cleanup process resources
function cleanupProcess() {
  activeProcess = null;
  activeProcessInterface = null;
}

// 2. Terminating active connections
function handleDisconnect(ws) {
  console.log('Disconnecting from active server...');
  broadcast({
    type: 'system-log',
    message: 'Disconnect requested by client.'
  });

  if (activeProcess) {
    try {
      activeProcess.kill('SIGTERM');
      // For Windows shell issues where child processes may spawn sub-processes
      setTimeout(() => {
        if (activeProcess) {
          try {
            activeProcess.kill('SIGKILL');
          } catch (e) {}
        }
      }, 500);
    } catch (e) {
      console.error('Error killing process:', e);
    }
    cleanupProcess();
  }

  if (sseController) {
    try {
      sseController.abort();
    } catch (e) {}
    sseController = null;
    sseMessageUrl = null;
  }

  updateStatus('disconnected');
  activeConfig = null;
}

// 3. Forward JSON-RPC payload to stdio stdin or SSE post endpoint
async function handleSendRpc(payload, ws) {
  if (connectionStatus !== 'connected') {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Cannot send message: server is not connected'
    }));
    return;
  }

  const payloadStr = JSON.stringify(payload);

  // Send via stdio
  if (activeProcess) {
    try {
      activeProcess.stdin.write(payloadStr + '\n');
    } catch (err) {
      console.error('Error writing to stdin:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Failed to write to stdin: ${err.message}`
      }));
    }
  } 
  // Send via SSE Proxy
  else if (sseMessageUrl) {
    try {
      const response = await fetch(sseMessageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
    } catch (err) {
      console.error('Error posting to SSE message endpoint:', err);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Failed to send to SSE endpoint: ${err.message}`
      }));
    }
  }
}

// 4. Connecting to remote SSE MCP servers
async function handleConnectSse(config, ws) {
  if (activeProcess || sseController) {
    handleDisconnect();
  }

  const { url } = config;
  activeConfig = config;
  updateStatus('connecting');

  console.log(`Connecting to SSE endpoint: ${url}`);
  broadcast({
    type: 'system-log',
    message: `Connecting to SSE: ${url}`
  });

  sseController = new AbortController();

  try {
    const response = await fetch(url, {
      signal: sseController.signal,
      headers: { Accept: 'text/event-stream' }
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    updateStatus('connected');
    broadcast({
      type: 'system-log',
      message: 'SSE Stream opened. Waiting for endpoint mapping...'
    });

    // Start reading loop async
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line

          let currentEvent = 'message';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const data = trimmed.slice(5).trim();
              
              if (currentEvent === 'endpoint') {
                // Parse post message endpoint URL
                try {
                  // Resolve relative URLs based on the main SSE URL
                  sseMessageUrl = new URL(data, url).toString();
                  broadcast({
                    type: 'system-log',
                    message: `SSE mapped post endpoint: ${sseMessageUrl}`
                  });
                } catch (err) {
                  console.error('Failed to parse SSE endpoint URL:', err);
                  sseMessageUrl = data;
                }
              } else if (currentEvent === 'message') {
                let isJsonRpc = false;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.jsonrpc === '2.0') {
                    isJsonRpc = true;
                  }
                } catch (e) {}

                broadcast({
                  type: 'stdout-line',
                  line: data,
                  isJsonRpc
                });
              }
            }
          }
        }
      } catch (streamErr) {
        if (streamErr.name === 'AbortError') {
          console.log('SSE Stream aborted successfully.');
        } else {
          console.error('SSE Stream error:', streamErr);
          broadcast({
            type: 'system-log',
            message: `SSE Stream Error: ${streamErr.message}`
          });
          updateStatus('crashed');
        }
      } finally {
        sseController = null;
        sseMessageUrl = null;
      }
    })();

  } catch (err) {
    console.error('Error connecting to SSE:', err);
    broadcast({
      type: 'system-log',
      message: `SSE Connection Error: ${err.message}`
    });
    updateStatus('crashed');
    sseController = null;
    sseMessageUrl = null;
  }
}

// Start HTTP server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`MCP Test Harness Backend running on http://localhost:${PORT}`);
});
