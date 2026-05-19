import React, { useState, useEffect, useRef } from 'react';

function App() {
  // Connection Form State
  const [connectionType, setConnectionType] = useState('stdio');
  const [command, setCommand] = useState('node');
  const [argsString, setArgsString] = useState('examples/mock_weather_server.js');
  const [cwd, setCwd] = useState('');
  const [envString, setEnvString] = useState('');
  const [sseUrl, setSseUrl] = useState('http://localhost:3000/sse');
  
  // App connection and capabilities states
  const [status, setStatus] = useState('disconnected');
  const [serverInfo, setServerInfo] = useState(null);
  const [tools, setTools] = useState([]);
  const [resources, setResources] = useState([]);
  const [prompts, setPrompts] = useState([]);
  
  // Selected capability
  const [activeTab, setActiveTab] = useState('tools'); // 'tools' | 'resources' | 'prompts'
  const [selectedItem, setSelectedItem] = useState(null);
  const [formValues, setFormValues] = useState({});
  
  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [lastRequest, setLastRequest] = useState(null);
  const [lastResponse, setLastResponse] = useState(null);
  const [metrics, setMetrics] = useState({ latency: null, size: null, status: null });
  
  // Logs & terminal states
  const [rpcLogs, setRpcLogs] = useState([]);
  const [stderrLogs, setStderrLogs] = useState([]);
  const [consoleTab, setConsoleTab] = useState('rpc'); // 'rpc' | 'stderr'
  const [expandedRpcId, setExpandedRpcId] = useState(null);
  const [logSearch, setLogSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isLogFrozen, setIsLogFrozen] = useState(false);

  // Presets states
  const [presets, setPresets] = useState([]);
  const [newPresetName, setNewPresetName] = useState('');

  // Refs for tracking
  const wsRef = useRef(null);
  const rpcCounter = useRef(0);
  const pendingRequests = useRef({});
  const stderrEndRef = useRef(null);
  const rpcEndRef = useRef(null);

  // Load presets from LocalStorage on mount
  useEffect(() => {
    const savedPresets = localStorage.getItem('mcp_presets');
    if (savedPresets) {
      try {
        let parsed = JSON.parse(savedPresets);
        let migrated = false;
        parsed = parsed.map(preset => {
          if (preset.name === 'Örnek Hava Durumu Sunucusu (Stdio)' || preset.name === 'Örnek Hava Durumu Sunucusu') {
            migrated = true;
            return {
              ...preset,
              name: 'Mock Weather Server (Stdio)',
              argsString: 'examples/mock_weather_server.js'
            };
          }
          return preset;
        });
        setPresets(parsed);
        if (migrated) {
          localStorage.setItem('mcp_presets', JSON.stringify(parsed));
        }
      } catch (e) {
        console.error('Failed to parse presets', e);
      }
    } else {
      // Default presets
      const defaults = [
        {
          name: 'Mock Weather Server (Stdio)',
          connectionType: 'stdio',
          command: 'node',
          argsString: 'examples/mock_weather_server.js',
          cwd: '',
          envString: 'NODE_ENV=development'
        }
      ];
      setPresets(defaults);
      localStorage.setItem('mcp_presets', JSON.stringify(defaults));
    }

    // Connect WebSocket to backend helper
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect loop on unmount
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Auto scroll logs
  useEffect(() => {
    if (autoScroll) {
      if (consoleTab === 'stderr' && stderrEndRef.current) {
        stderrEndRef.current.scrollIntoView({ behavior: 'smooth' });
      } else if (consoleTab === 'rpc' && rpcEndRef.current) {
        rpcEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [rpcLogs, stderrLogs, consoleTab, autoScroll]);

  // Establish WebSocket connection to Node.js backend
  const connectWebSocket = () => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      console.log('WebSocket already active or connecting, skipping connection request');
      return;
    }

    const wsUrl = `ws://${window.location.hostname}:3001`;
    console.log(`Connecting to backend WebSocket: ${wsUrl}`);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'status-change':
            setStatus(msg.status);
            if (msg.status === 'disconnected' || msg.status === 'crashed') {
              setServerInfo(null);
              setTools([]);
              setResources([]);
              setPrompts([]);
              setSelectedItem(null);
            }
            if (msg.status === 'connected') {
              // Initiate Handshake!
              sendInitializeHandshake();
            }
            break;

          case 'stdout-line':
            handleStdoutLine(msg.line, msg.isJsonRpc);
            break;

          case 'stderr-line':
            appendStderrLog(msg.text);
            break;

          case 'system-log':
            appendStderrLog(`[SYSTEM] ${msg.message}`);
            break;

          case 'error':
            alert(`Server Error: ${msg.message}`);
            break;

          default:
            console.log('Unhandled backend event:', msg);
        }
      } catch (err) {
        console.error('Error handling WS event:', err);
      }
    };

    ws.onclose = () => {
      console.log('WS connection closed. Retrying in 3 seconds...');
      setStatus('disconnected');
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  };

  // Append logs helpers
  const appendStderrLog = (text) => {
    if (isLogFrozen) return;
    setStderrLogs((prev) => [...prev, text].slice(-500)); // Keep last 500 lines
  };

  const appendRpcLog = (direction, payload, latency = null, reqMethod = null) => {
    if (isLogFrozen) return;
    
    const type = payload.method 
      ? (payload.id !== undefined ? 'request' : 'notification') 
      : (payload.error ? 'error' : 'response');
      
    let methodDisplay = 'Response';
    if (payload.method) {
      methodDisplay = payload.method;
    } else if (reqMethod) {
      methodDisplay = `${reqMethod} (Response)`;
    } else if (payload.id !== undefined) {
      methodDisplay = `Response (${payload.id})`;
    }
      
    const logItem = {
      id: `${direction}-${payload.id || 'notif'}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toLocaleTimeString(),
      direction,
      type,
      method: methodDisplay,
      payload,
      latency
    };

    setRpcLogs((prev) => [logItem, ...prev].slice(0, 200)); // Keep last 200 items
  };

  // Handlers for stdio streams
  const handleStdoutLine = (line, isJsonRpc) => {
    if (!isJsonRpc) {
      // It's raw stdout text, not JSON-RPC. Treat as system log.
      appendStderrLog(`[STDOUT] ${line}`);
      return;
    }

    try {
      const packet = JSON.parse(line);
      const { id, method, result, error } = packet;

      // Log the JSON-RPC packet
      let latency = null;
      let reqMethod = null;
      if (id !== undefined && pendingRequests.current[id]) {
        const pending = pendingRequests.current[id];
        latency = Math.round(performance.now() - pending.startTime);
        reqMethod = pending.method;
        delete pendingRequests.current[id];
      }

      appendRpcLog('received', packet, latency, reqMethod);

      // Handle specific responses we are waiting for
      if (id !== undefined) {
        // Initialize Response
        if (id === 'init-handshake') {
          if (error) {
            appendStderrLog(`[ERROR] Handshake failed: ${error.message}`);
            setStatus('crashed');
            return;
          }
          
          setServerInfo(result.serverInfo);
          // Send Initialized Notification
          sendNotification('notifications/initialized');
          
          // Request Capabilities Lists
          sendRequest('tools/list', {}, 'list-tools');
          sendRequest('resources/list', {}, 'list-resources');
          sendRequest('prompts/list', {}, 'list-prompts');
          appendStderrLog(`[SYSTEM] Initialized with server: ${result.serverInfo.name} (${result.serverInfo.version})`);
        }
        
        // Capabilities responses
        else if (id === 'list-tools') {
          setTools(result?.tools || []);
        } 
        else if (id === 'list-resources') {
          setResources(result?.resources || []);
        } 
        else if (id === 'list-prompts') {
          setPrompts(result?.prompts || []);
        }
        
        // Tool Execution Response
        else if (id.startsWith('tool-call-')) {
          setIsRunning(false);
          setLastResponse(packet);
          setMetrics((prev) => ({
            ...prev,
            latency: latency,
            size: new Blob([line]).size,
            status: error ? 'error' : 'success'
          }));
        }

        // Resource Read Response
        else if (id.startsWith('resource-read-')) {
          setIsRunning(false);
          setLastResponse(packet);
          setMetrics((prev) => ({
            ...prev,
            latency: latency,
            size: new Blob([line]).size,
            status: error ? 'error' : 'success'
          }));
        }

        // Prompt Get Response
        else if (id.startsWith('prompt-get-')) {
          setIsRunning(false);
          setLastResponse(packet);
          setMetrics((prev) => ({
            ...prev,
            latency: latency,
            size: new Blob([line]).size,
            status: error ? 'error' : 'success'
          }));
        }
      }
    } catch (e) {
      console.error('Failed to parse stdout packet:', e);
    }
  };

  // Handshake helpers
  const sendInitializeHandshake = () => {
    sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      clientInfo: {
        name: 'mcp-test-harness',
        version: '1.0.0'
      }
    }, 'init-handshake');
  };

  // Core JSON-RPC sending helpers
  const sendRequest = (method, params = {}, customId = null) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;

    const id = customId || `req-${rpcCounter.current++}`;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    pendingRequests.current[id] = {
      method,
      startTime: performance.now()
    };

    appendRpcLog('sent', payload);
    wsRef.current.send(JSON.stringify({
      type: 'send-rpc',
      payload
    }));

    return id;
  };

  const sendNotification = (method, params = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;

    const payload = {
      jsonrpc: '2.0',
      method,
      params
    };

    appendRpcLog('sent', payload);
    wsRef.current.send(JSON.stringify({
      type: 'send-rpc',
      payload
    }));
  };

  // Connection trigger button
  const handleConnect = () => {
    if (status !== 'disconnected' && status !== 'crashed') {
      // Disconnect request
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }));
      return;
    }

    setRpcLogs([]);
    setStderrLogs([]);
    setLastResponse(null);
    setLastRequest(null);

    if (connectionType === 'stdio') {
      // Parse env vars
      const env = {};
      envString.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim();
          if (key) env[key] = value;
        }
      });

      // Split args handling quotes briefly
      const args = [];
      const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
      let match;
      while ((match = regex.exec(argsString)) !== null) {
        args.push(match[1] || match[2] || match[3]);
      }

      wsRef.current.send(JSON.stringify({
        type: 'connect-stdio',
        config: { command, args, cwd, env }
      }));
    } else {
      // SSE
      wsRef.current.send(JSON.stringify({
        type: 'connect-sse',
        config: { url: sseUrl }
      }));
    }
  };

  // Save Config as Preset
  const handleSavePreset = (e) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;

    const preset = {
      name: newPresetName,
      connectionType,
      command,
      argsString,
      cwd,
      envString,
      sseUrl
    };

    const updated = [...presets, preset];
    setPresets(updated);
    localStorage.setItem('mcp_presets', JSON.stringify(updated));
    setNewPresetName('');
  };

  const handleLoadPreset = (preset) => {
    setConnectionType(preset.connectionType);
    if (preset.connectionType === 'stdio') {
      setCommand(preset.command || 'node');
      setArgsString(preset.argsString || '');
      setCwd(preset.cwd || '');
      setEnvString(preset.envString || '');
    } else {
      setSseUrl(preset.sseUrl || '');
    }
  };

  const handleDeletePreset = (indexToDelete, e) => {
    e.stopPropagation();
    const updated = presets.filter((_, i) => i !== indexToDelete);
    setPresets(updated);
    localStorage.setItem('mcp_presets', JSON.stringify(updated));
  };

  // Handle Dynamic Forms parameter updates
  const handleFormChange = (key, val, type) => {
    setFormValues((prev) => {
      let finalVal = val;
      if (type === 'number') {
        finalVal = val === '' ? '' : Number(val);
      } else if (type === 'boolean') {
        finalVal = Boolean(val);
      } else if (type === 'array') {
        // Simple parsing for array values entered as comma-separated strings
        finalVal = val.split(',').map(s => s.trim()).filter(Boolean);
      }
      return { ...prev, [key]: finalVal };
    });
  };

  // Render capability item selection
  const handleSelectCapability = (item) => {
    setSelectedItem(item);
    setFormValues({});
    setLastResponse(null);
    setLastRequest(null);
    setMetrics({ latency: null, size: null, status: null });

    // Pre-populate default values from schema properties if available
    if (activeTab === 'tools' && item.inputSchema?.properties) {
      const defaults = {};
      Object.entries(item.inputSchema.properties).forEach(([key, prop]) => {
        if (prop.default !== undefined) {
          defaults[key] = prop.default;
        } else if (prop.type === 'boolean') {
          defaults[key] = false;
        }
      });
      setFormValues(defaults);
    }
  };

  // Trigger Action execution (Tool, Resource, or Prompt)
  const handleTriggerAction = () => {
    if (status !== 'connected' || !selectedItem) return;

    setIsRunning(true);
    setLastResponse(null);
    setMetrics({ latency: null, size: null, status: null });

    if (activeTab === 'tools') {
      const payload = {
        name: selectedItem.name,
        arguments: formValues
      };
      setLastRequest(payload);
      sendRequest('tools/call', payload, `tool-call-${Date.now()}`);
    } 
    
    else if (activeTab === 'resources') {
      const payload = {
        uri: selectedItem.uri
      };
      setLastRequest(payload);
      sendRequest('resources/read', payload, `resource-read-${Date.now()}`);
    } 
    
    else if (activeTab === 'prompts') {
      const payload = {
        name: selectedItem.name,
        arguments: formValues
      };
      setLastRequest(payload);
      sendRequest('prompts/get', payload, `prompt-get-${Date.now()}`);
    }
  };

  // Helper to dynamically render input fields based on JSON Schema
  const renderSchemaField = (name, property, isRequired) => {
    const type = property.type;
    const desc = property.description;
    const hasEnum = Array.isArray(property.enum);
    const currentValue = formValues[name] !== undefined ? formValues[name] : '';

    return (
      <div key={name} className="schema-field">
        <label className="schema-field-label">
          {name}
          {isRequired && <span className="schema-field-required">*</span>}
          {type && <span className="badge badge-neutral btn-sm" style={{fontSize: '9px', padding: '1px 4px'}}>{type}</span>}
        </label>
        
        {desc && <span className="schema-field-desc">{desc}</span>}
        
        <div className="schema-field-input">
          {hasEnum ? (
            <select
              className="form-control"
              value={currentValue}
              onChange={(e) => handleFormChange(name, e.target.value, 'string')}
            >
              <option value="">-- Select Value --</option>
              {property.enum.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : type === 'boolean' ? (
            <input
              type="checkbox"
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              checked={!!currentValue}
              onChange={(e) => handleFormChange(name, e.target.checked, 'boolean')}
            />
          ) : type === 'number' || type === 'integer' ? (
            <input
              type="number"
              className="form-control"
              placeholder={property.default !== undefined ? `Default: ${property.default}` : 'Enter number'}
              value={currentValue}
              onChange={(e) => handleFormChange(name, e.target.value, 'number')}
            />
          ) : type === 'array' ? (
            <input
              type="text"
              className="form-control"
              placeholder="Enter comma-separated values (e.g. apple, orange)"
              value={Array.isArray(currentValue) ? currentValue.join(', ') : currentValue}
              onChange={(e) => handleFormChange(name, e.target.value, 'array')}
            />
          ) : (
            <input
              type="text"
              className="form-control"
              placeholder={property.default !== undefined ? `Default: ${property.default}` : 'Enter text'}
              value={currentValue}
              onChange={(e) => handleFormChange(name, e.target.value, 'string')}
            />
          )}
        </div>
      </div>
    );
  };

  // Log level class resolver
  const getLogLevelClass = (log) => {
    if (log.type === 'error' || log.payload?.error) return 'error';
    if (log.type === 'notification') return 'system';
    if (log.direction === 'sent') return 'stdout';
    return 'warning';
  };

  // Filtered log lines
  const filteredRpcLogs = rpcLogs.filter((log) => {
    if (!logSearch.trim()) return true;
    const searchLower = logSearch.toLowerCase();
    return (
      log.method.toLowerCase().includes(searchLower) ||
      JSON.stringify(log.payload).toLowerCase().includes(searchLower)
    );
  });

  const filteredStderrLogs = stderrLogs.filter((log) => {
    if (!logSearch.trim()) return true;
    return log.toLowerCase().includes(logSearch.toLowerCase());
  });

  return (
    <div className="app-container">
      {/* Header bar */}
      <header className="app-header">
        <div className="logo-section">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">MCP INSPECTOR</span>
          <span className="logo-badge">v1.0.0</span>
        </div>

        <div className="header-status">
          <span className={`status-dot ${status}`}></span>
          <span className="badge badge-neutral" style={{textTransform: 'uppercase'}}>
            {status === 'connected' ? 'CONNECTED' : 
             status === 'connecting' ? 'CONNECTING' : 
             status === 'crashed' ? 'CRASHED' : 'DISCONNECTED'}
          </span>
          {serverInfo && (
            <span className="badge badge-success">
              {serverInfo.name}@{serverInfo.version}
            </span>
          )}
        </div>
      </header>

      {/* Main interface split */}
      <main className="main-workspace">
        
        {/* Left sidebar: Connection configurations */}
        <section className="panel left-sidebar">
          <div className="panel-header">
            <span>Connection Settings</span>
          </div>
          
          <div className="panel-content">
            <div className="form-group">
              <label className="form-label">Transport Type</label>
              <div className="form-row-2">
                <button
                  className={`btn ${connectionType === 'stdio' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setConnectionType('stdio')}
                  disabled={status === 'connected' || status === 'connecting'}
                >
                  Stdio (Local)
                </button>
                <button
                  className={`btn ${connectionType === 'sse' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setConnectionType('sse')}
                  disabled={status === 'connected' || status === 'connecting'}
                >
                  SSE (Remote)
                </button>
              </div>
            </div>

            {connectionType === 'stdio' ? (
              <>
                <div className="form-group">
                  <label className="form-label">Command</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. node or python"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    disabled={status === 'connected' || status === 'connecting'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Arguments</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. dist/index.js or script.py"
                    value={argsString}
                    onChange={(e) => setArgsString(e.target.value)}
                    disabled={status === 'connected' || status === 'connecting'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Working Directory (CWD - Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Default directory"
                    value={cwd}
                    onChange={(e) => setCwd(e.target.value)}
                    disabled={status === 'connected' || status === 'connecting'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Environment Variables (Env Vars - Key=Value)</label>
                  <textarea
                    className="form-control"
                    placeholder="DEBUG=true&#10;MY_API_KEY=123"
                    value={envString}
                    onChange={(e) => setEnvString(e.target.value)}
                    disabled={status === 'connected' || status === 'connecting'}
                  />
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">SSE Endpoint URL</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="http://localhost:3000/sse"
                  value={sseUrl}
                  onChange={(e) => setSseUrl(e.target.value)}
                  disabled={status === 'connected' || status === 'connecting'}
                />
              </div>
            )}

            <button
              className={`btn ${status === 'connected' || status === 'connecting' ? 'btn-danger' : 'btn-primary'}`}
              style={{ width: '100%', padding: '12px', marginTop: '8px' }}
              onClick={handleConnect}
            >
              {status === 'connected' || status === 'connecting' ? 'Disconnect' : 'Start Server / Connect'}
            </button>

            {/* Presets section */}
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <span className="form-label" style={{ fontWeight: '600' }}>Connection Profiles (Presets)</span>
              
              <form onSubmit={handleSavePreset} className="key-value-row" style={{ marginTop: '8px', gridTemplateColumns: '1fr auto' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="New profile name..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary btn-sm" style={{padding: '9px 12px'}}>Save</button>
              </form>

              <div className="preset-list">
                {presets.map((preset, index) => (
                  <div
                    key={index}
                    className="preset-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleLoadPreset(preset)}
                  >
                    <div className="preset-item-info">
                      <span className="preset-item-name">{preset.name}</span>
                      <span className="preset-item-details">
                        {preset.connectionType === 'stdio' ? `${preset.command} ${preset.argsString}` : preset.sseUrl}
                      </span>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ padding: '2px 6px', fontSize: '10px' }}
                      onClick={(e) => handleDeletePreset(index, e)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Center viewer: Capabilities Browser & Trigger Executor */}
        <section className="panel center-viewer">
          {status !== 'connected' ? (
            <div className="empty-state">
              <span className="empty-state-icon">📡</span>
              <span className="empty-state-title">Awaiting Connection</span>
              <span className="empty-state-desc">
                Please connect using the left panel to list and test the capabilities of the MCP server.
              </span>
            </div>
          ) : (
            <div className="tester-layout">
              {/* Capabilities Tabs */}
              <div className="tabs-container">
                <button
                  className={`tab-btn ${activeTab === 'tools' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('tools'); setSelectedItem(null); }}
                >
                  Tools ({tools.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'resources' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('resources'); setSelectedItem(null); }}
                >
                  Resources ({resources.length})
                </button>
                <button
                  className={`tab-btn ${activeTab === 'prompts' ? 'active' : ''}`}
                  onClick={() => { setActiveTab('prompts'); setSelectedItem(null); }}
                >
                  Prompts ({prompts.length})
                </button>
              </div>

              <div className="tester-main">
                {/* Capability selector list */}
                <div className="tester-sidebar">
                  {activeTab === 'tools' && (
                    <div className="list-group">
                      {tools.length === 0 ? (
                        <div className="empty-state-desc">No tools found.</div>
                      ) : (
                        tools.map((tool) => (
                          <div
                            key={tool.name}
                            className={`list-item ${selectedItem?.name === tool.name ? 'selected' : ''}`}
                            onClick={() => handleSelectCapability(tool)}
                          >
                            <span className="list-item-title">{tool.name}</span>
                            <span className="list-item-desc">{tool.description || 'No description.'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'resources' && (
                    <div className="list-group">
                      {resources.length === 0 ? (
                        <div className="empty-state-desc">No resources found.</div>
                      ) : (
                        resources.map((resource) => (
                          <div
                            key={resource.uri}
                            className={`list-item ${selectedItem?.uri === resource.uri ? 'selected' : ''}`}
                            onClick={() => handleSelectCapability(resource)}
                          >
                            <span className="list-item-title" style={{fontSize: '12px', wordBreak: 'break-all'}}>{resource.name}</span>
                            <span className="list-item-desc" style={{fontFamily: 'var(--font-mono)', fontSize: '10px'}}>{resource.uri}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === 'prompts' && (
                    <div className="list-group">
                      {prompts.length === 0 ? (
                        <div className="empty-state-desc">No prompts found.</div>
                      ) : (
                        prompts.map((prompt) => (
                          <div
                            key={prompt.name}
                            className={`list-item ${selectedItem?.name === prompt.name ? 'selected' : ''}`}
                            onClick={() => handleSelectCapability(prompt)}
                          >
                            <span className="list-item-title">{prompt.name}</span>
                            <span className="list-item-desc">{prompt.description || 'No description.'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Call panel executor */}
                <div className="tester-runner">
                  {!selectedItem ? (
                    <div className="empty-state" style={{paddingTop: '80px'}}>
                      <span className="empty-state-icon">👈</span>
                      <span className="empty-state-title">Select an Item</span>
                      <span className="empty-state-desc">
                        Click an item from the list on the left to view details, configure arguments, and trigger execution.
                      </span>
                    </div>
                  ) : (
                    <div>
                      {/* Name & description */}
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <h2 style={{ fontSize: '20px', fontWeight: '700' }}>
                            {selectedItem.name || selectedItem.uri}
                          </h2>
                          <span className="badge badge-success" style={{ textTransform: 'uppercase' }}>
                            {activeTab}
                          </span>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5' }}>
                          {selectedItem.description || 'No description provided for this item.'}
                        </p>
                      </div>

                      {/* Arguments configuration form */}
                      {activeTab === 'tools' && selectedItem.inputSchema?.properties && (
                        <div className="schema-form">
                          <div className="schema-form-title">Tool Parameters (Arguments)</div>
                          {Object.entries(selectedItem.inputSchema.properties).map(([name, prop]) => {
                            const isRequired = Array.isArray(selectedItem.inputSchema.required) && selectedItem.inputSchema.required.includes(name);
                            return renderSchemaField(name, prop, isRequired);
                          })}
                        </div>
                      )}

                      {activeTab === 'prompts' && selectedItem.arguments && selectedItem.arguments.length > 0 && (
                        <div className="schema-form">
                          <div className="schema-form-title">Prompt Arguments</div>
                          {selectedItem.arguments.map((arg) => (
                            renderSchemaField(arg.name, { type: 'string', description: arg.description }, arg.required)
                          ))}
                        </div>
                      )}

                      {/* Trigger Buttons */}
                      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '12px 24px', fontWeight: '600' }}
                          onClick={handleTriggerAction}
                          disabled={isRunning}
                        >
                          {isRunning ? 'Running...' : 'Trigger'}
                        </button>
                      </div>

                      {/* Response Metrics & JSON Visualizer */}
                      {(lastResponse || metrics.latency) && (
                        <div>
                          <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                            Execution Output
                          </h3>

                          {/* Metrics bar */}
                          <div className="metrics-bar">
                            <div className="metric-item">
                              <span className="metric-label">Latency</span>
                              <span className="metric-value" style={{ color: metrics.latency > 500 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                                {metrics.latency ? `${metrics.latency} ms` : '-'}
                              </span>
                            </div>
                            <div className="metric-item">
                              <span className="metric-label">Response Size</span>
                              <span className="metric-value">
                                {metrics.size ? `${(metrics.size / 1024).toFixed(2)} KB` : '-'}
                              </span>
                            </div>
                            <div className="metric-item">
                              <span className="metric-label">Status</span>
                              <span className={`metric-value ${metrics.status === 'success' ? 'badge-success' : 'badge-error'}`} style={{padding: '2px 8px', borderRadius: '4px', fontSize: '11px', textTransform: 'uppercase'}}>
                                {metrics.status || '-'}
                              </span>
                            </div>
                          </div>

                          {/* Response Payload visualization */}
                          {lastResponse && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              
                              {/* Renders image content if returned by the tool */}
                              {lastResponse.result?.content?.map((item, index) => {
                                if (item.type === 'image' && item.data) {
                                  return (
                                    <div key={index} className="card" style={{ display: 'inline-block', maxWidth: '100%' }}>
                                      <div className="card-title">Image Output</div>
                                      <img
                                        src={`data:${item.mimeType || 'image/png'};base64,${item.data}`}
                                        alt="Tool generated result"
                                        style={{ maxWidth: '100%', borderRadius: 'var(--border-radius-md)', display: 'block' }}
                                      />
                                    </div>
                                  );
                                }
                                return null;
                              })}

                              {/* Render rich text responses */}
                              {lastResponse.result?.content?.map((item, index) => {
                                if (item.type === 'text' && item.text) {
                                  return (
                                    <div key={index} className="card" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5', borderLeft: '3px solid var(--accent-cyan)' }}>
                                      {item.text}
                                    </div>
                                  );
                                }
                                return null;
                              })}

                              {/* Full JSON response */}
                              <div>
                                <div className="form-label" style={{ fontSize: '11px' }}>Raw JSON Response</div>
                                <pre className="json-view">
                                  {JSON.stringify(lastResponse, null, 2)}
                                </pre>
                              </div>

                              {/* Request JSON payload */}
                              {lastRequest && (
                                <div style={{ marginTop: '8px' }}>
                                  <div className="form-label" style={{ fontSize: '11px' }}>Sent JSON Request</div>
                                  <pre className="json-view" style={{ color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.2)' }}>
                                    {JSON.stringify(lastRequest, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right sidebar: Real-time Debug Log Console */}
        <section className="panel right-logs">
          <div className="panel-header">
            <span>Diagnostics Console</span>
            <div className="panel-header-actions">
              <button 
                className={`btn btn-secondary btn-sm ${isLogFrozen ? 'badge-warning' : ''}`}
                onClick={() => setIsLogFrozen(!isLogFrozen)}
              >
                {isLogFrozen ? 'Resume Logs' : 'Freeze Logs'}
              </button>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => { setRpcLogs([]); setStderrLogs([]); }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Log search and control filters */}
          <div style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              className="form-control"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              placeholder="Search logs..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={autoScroll} 
                onChange={(e) => setAutoScroll(e.target.checked)} 
              />
              Auto Scroll
            </label>
          </div>

          {/* Logs Tabs */}
          <div className="tabs-container" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <button
              className={`tab-btn ${consoleTab === 'rpc' ? 'active' : ''}`}
              style={{ flex: 1, padding: '10px' }}
              onClick={() => setConsoleTab('rpc')}
            >
              JSON-RPC Logs ({filteredRpcLogs.length})
            </button>
            <button
              className={`tab-btn ${consoleTab === 'stderr' ? 'active' : ''}`}
              style={{ flex: 1, padding: '10px' }}
              onClick={() => setConsoleTab('stderr')}
            >
              Stderr / Console ({filteredStderrLogs.length})
            </button>
          </div>

          <div className="panel-content" style={{ padding: '10px', display: 'flex', flexDirection: 'column' }}>
            
            {/* JSON-RPC message log tab */}
            {consoleTab === 'rpc' && (
              <div className="terminal-container" style={{ flex: 1 }}>
                <div className="terminal-header">
                  <span>LIVE JSON-RPC PACKET INSPECTOR</span>
                  <span>(Newest on top)</span>
                </div>
                
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {filteredRpcLogs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                      No logs captured yet.
                    </div>
                  ) : (
                    filteredRpcLogs.map((log) => {
                      const isExpanded = expandedRpcId === log.id;
                      return (
                        <div
                          key={log.id}
                          className="rpc-item"
                          onClick={() => setExpandedRpcId(isExpanded ? null : log.id)}
                        >
                          <div className="rpc-header">
                            <div className="rpc-summary">
                              <span className={`badge ${getLogLevelClass(log)} btn-sm`} style={{fontSize: '9px', padding: '1px 4px'}}>
                                {log.direction === 'sent' ? 'REQUEST ➜' : '➜ RESPONSE'}
                              </span>
                              <span className="rpc-method">{log.method}</span>
                            </div>
                            <span className="rpc-timestamp">
                              {log.latency ? `${log.latency}ms` : ''} [{log.timestamp}]
                            </span>
                          </div>

                          {isExpanded && (
                            <pre className="rpc-details">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={rpcEndRef} />
                </div>
              </div>
            )}

            {/* Stderr logs tab */}
            {consoleTab === 'stderr' && (
              <div className="terminal-container" style={{ flex: 1 }}>
                <div className="terminal-header">
                  <span>SERVER STANDARD ERROR (STDERR) STREAM</span>
                  <span>(Newest at bottom)</span>
                </div>
                
                <div className="terminal-logs">
                  {filteredStderrLogs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                      No stderr logs captured. Process stderr and console.error messages will stream here.
                    </div>
                  ) : (
                    filteredStderrLogs.map((log, index) => {
                      let logClass = 'stdout';
                      if (log.includes('[ERROR]') || log.includes('error') || log.includes('Exception') || log.includes('Error:')) {
                        logClass = 'error';
                      } else if (log.includes('[WARNING]') || log.includes('warning')) {
                        logClass = 'warning';
                      } else if (log.startsWith('[SYSTEM]')) {
                        logClass = 'system';
                      }
                      
                      return (
                        <div key={index} className={`log-line ${logClass}`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                  <div ref={stderrEndRef} />
                </div>
              </div>
            )}
            
          </div>
        </section>
        
      </main>
    </div>
  );
}

export default App;
