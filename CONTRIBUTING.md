# Contributing to MCP Inspector ⚡

Thank you for your interest in contributing to **MCP Inspector**! Contributions from the open-source developer community are what make tools like this thrive. 

Whether you want to fix a bug, optimize performance, propose new features, or improve the documentation, we welcome and appreciate your help.

---

## 🗺️ Codebase & Architecture Overview

Before making any changes, it is helpful to understand how the components are structured:

1.  **Frontend App (`src/App.jsx`):** Developed with React 19 and styled with custom HSL-based CSS rules. It maps user inputs, manages local preset configurations in `localStorage`, displays JSON-RPC packets in the Console, and parses standard `inputSchema` schemas to render HTML forms dynamically.
2.  **Backend Proxy (`server/index.js`):** Built with Express and WebSockets (`ws`). It spawns child processes for the Stdio transport, captures and streams stdout/stderr lines, processes remote SSE Accept streams using a non-blocking chunk decoder, and routes incoming JSON-RPC traffic.
3.  **Mock Environment (`examples/mock_weather_server.js`):** Serves as an excellent Stdio sandbox with tools, resources, and prompt templates to test frontend and backend logic.

---

## 🛠️ Step-by-Step Development Setup

To set up a local development environment:

### 1. Clone & Install Dependencies
Fork this repository to your GitHub account and clone it locally:
```bash
git clone https://github.com/YOUR_USERNAME/mcp-inspector.git
cd mcp-inspector
npm install
```

### 2. Run the Connection Helper (Backend)
Start the server launcher and stream proxy. It listens on port `3001`:
```bash
npm run server
```

### 3. Run the Development Client (Vite Frontend)
In a separate terminal shell, boot the Vite web dev server:
```bash
npm run dev
```
Open **`http://localhost:5173`** in your web browser.

---

## 📝 Contribution Guidelines

### 1. Submitting Issues
If you find a bug or want to request a new feature, please open an Issue first to discuss it:
*   Use the appropriate **Issue Template** (Bug Report or Feature Request).
*   Provide a clear and concise description of the problem or proposed feature.
*   Include steps to reproduce, code snippets, or screenshots if applicable.
*   Mention your operating system and Node.js versions.

### 2. Submitting Pull Requests
When you are ready to submit code changes:
1.  **Create a Branch:** Create a branch from `main` named descriptively:
    ```bash
    git checkout -b feat/add-dark-light-mode
    # or
    git checkout -b fix/resolve-sse-timeout
    ```
2.  **Follow Coding Standards:**
    *   Maintain clean, self-documenting code.
    *   Keep React components focused, reusable, and type-safe.
    *   Preserve existing docstrings, comments, and HSL style variables.
3.  **Test Your Changes:**
    *   Verify your code by running `npm run lint`.
    *   Connect to the local `examples/mock_weather_server.js` sandbox and verify that all tools, resources, and prompts execute seamlessly without warnings.
4.  **Use Conventional Commits:** Write clear and structured commit messages:
    *   `feat: add support for custom environment variables`
    *   `fix: resolve memory leak on SSE subprocess cleanup`
    *   `docs: update setup steps in README`
    *   `chore: update devDependencies`
5.  **Submit the PR:** Push your branch to your fork and submit a Pull Request to our `main` branch. Complete the fields in the PR Template.

---

## 💬 Community and Code of Conduct

Help us maintain a respectful, welcoming, and productive environment for everyone. Please be polite, constructive, and helpful when interacting in issues, PRs, or discussions.

Thank you again for helping to build a premium developer experience for Model Context Protocol! ⚡
