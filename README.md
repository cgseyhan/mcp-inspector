# MCP Inspector ⚡

A premium visual test and debug harness for testing and profiling Model Context Protocol (MCP) servers. It provides a visual interface to connect to local (stdio) or remote (SSE) MCP servers, run tools/resources/prompts, inspect schemas, track raw JSON-RPC traffic, and visualize response latency.

---

## 🚀 Features

1. **Dual Transport Support:** Test standard local servers via Stdio (supports arguments, work directories, and environment variables) or remote servers via Server-Sent Events (SSE).
2. **Manual Handshake Mode:** Take full control of the `initialize` parameters. Disable automatic negotiation to manually inspect client capabilities, protocol versioning, and client metadata.
3. **Custom JSON-RPC Sender:** Dispatch raw JSON-RPC payloads directly from an editor console equipped with pre-loaded command templates.
4. **Latency Telemetry & Profiling:** A live SVG latency timeline accompanied by response-size tracking (KB), error rate calculations, and average/min/max telemetry statistics.
5. **Request History & Replay:** Log all active requests, review execution statuses, and reload parameters back to execution forms in one click.
6. **Logging & Diagnostics Export:** Standard output, stderr, and raw JSON-RPC streams can be exported at any time into a `.json` debug file or `.csv` latency chart report.

---

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server (Frontend)
```bash
npm run dev
```

### 3. Start the Connection Helper (Backend Proxy)
```bash
npm run server
```

The web application runs on `http://localhost:5173` (Vite) and communicates via WebSocket to the helper backend on `http://localhost:3001` to launch and multiplex local sub-processes.

---

## 🎨 UI Design System
- **Dark Mode Palette:** Tailored HSL dark gradients with subtle borders and status badges matching modern developer tools.
- **Diagnostics Panel:** Live-updating split logging views for RPC payloads (color-coded by method types) and subprocess `stderr` outputs.
