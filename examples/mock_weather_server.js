// Mock MCP Server for Testing the Test Harness
// Uses standard stdio transport with line-delimited JSON-RPC 2.0.

import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Stderr logger
function logError(message) {
  process.stderr.write(`[MockServer Debug] ${message}\n`);
}

logError("Mock MCP Server starting up...");

// Capabilities definition
const capabilities = {
  tools: {
    listChanged: false
  },
  resources: {
    subscribe: true,
    listChanged: false
  },
  prompts: {
    listChanged: false
  }
};

const serverInfo = {
  name: "mock-weather-server",
  version: "1.0.0"
};

const toolsList = [
  {
    name: "get_weather",
    description: "Get the current weather for a specific city.",
    inputSchema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The name of the city, e.g., Istanbul, Paris, Tokyo."
        },
        unit: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          default: "celsius",
          description: "The temperature unit to return."
        }
      },
      required: ["city"]
    }
  },
  {
    name: "calculate_sum",
    description: "Calculate the sum of two numbers with a simulated network delay and verbose stderr logs.",
    inputSchema: {
      type: "object",
      properties: {
        a: {
          type: "number",
          description: "First number"
        },
        b: {
          type: "number",
          description: "Second number"
        }
      },
      required: ["a", "b"]
    }
  }
];

const resourcesList = [
  {
    uri: "file://weather/alerts.txt",
    name: "Severe Weather Alerts",
    description: "Real-time list of active severe weather warnings.",
    mimeType: "text/plain"
  }
];

const promptsList = [
  {
    name: "summarize_weather",
    description: "Generate a friendly summary of weather conditions for a user report.",
    arguments: [
      {
        name: "city",
        description: "The city to generate the report for.",
        required: true
      },
      {
        name: "mood",
        description: "The tone of the summary (e.g. happy, professional, dramatic).",
        required: false
      }
    ]
  }
];

// Handle JSON-RPC messages
rl.on('line', async (line) => {
  if (!line.trim()) return;

  logError(`Received raw packet: ${line}`);

  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    sendError(null, -32700, "Parse error");
    return;
  }

  const { jsonrpc, id, method, params } = request;

  if (jsonrpc !== "2.0") {
    sendError(id, -32600, "Invalid Request");
    return;
  }

  // Handle requests
  switch (method) {
    case "initialize":
      sendResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities,
        serverInfo
      });
      break;

    case "notifications/initialized":
      logError("Client successfully initialized!");
      break;

    case "tools/list":
      sendResponse(id, {
        tools: toolsList
      });
      break;

    case "tools/call":
      await handleToolCall(id, params);
      break;

    case "resources/list":
      sendResponse(id, {
        resources: resourcesList
      });
      break;

    case "resources/read":
      handleResourceRead(id, params);
      break;

    case "prompts/list":
      sendResponse(id, {
        prompts: promptsList
      });
      break;

    case "prompts/get":
      handlePromptGet(id, params);
      break;

    case "ping":
      sendResponse(id, {});
      break;

    default:
      sendError(id, -32601, `Method not found: ${method}`);
      break;
  }
});

// Respond helpers
function sendResponse(id, result) {
  const response = {
    jsonrpc: "2.0",
    id,
    result
  };
  const jsonStr = JSON.stringify(response);
  logError(`Sending response: ${jsonStr}`);
  process.stdout.write(jsonStr + '\n');
}

function sendError(id, code, message, data = null) {
  const response = {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data && { data })
    }
  };
  const jsonStr = JSON.stringify(response);
  logError(`Sending error: ${jsonStr}`);
  process.stdout.write(jsonStr + '\n');
}

// Tool handler
async function handleToolCall(id, params) {
  const { name, arguments: args } = params;

  logError(`Calling tool: ${name} with args ${JSON.stringify(args)}`);

  if (name === "get_weather") {
    const city = args?.city || "Unknown";
    const unit = args?.unit || "celsius";

    // Mock weather database
    const temp = Math.floor(Math.random() * 30) + 10; // 10-40 degrees
    const desc = ["Sunny", "Partly Cloudy", "Rainy", "Windy", "Thunderstorm"][Math.floor(Math.random() * 5)];
    const tempStr = unit === "celsius" ? `${temp}°C` : `${(temp * 9) / 5 + 32}°F`;

    sendResponse(id, {
      content: [
        {
          type: "text",
          text: `Weather in ${city}: ${tempStr}, ${desc}. Forecast for tomorrow is mostly ${desc.toLowerCase()}.`
        }
      ]
    });
  } else if (name === "calculate_sum") {
    const a = Number(args?.a);
    const b = Number(args?.b);

    if (isNaN(a) || isNaN(b)) {
      sendError(id, -32602, "Invalid params: a and b must be numbers");
      return;
    }

    logError("Starting computation...");
    logError("Warning: Simulating complex CPU calculations on thread...");
    
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 800));

    logError("Sum calculation completed successfully.");
    
    sendResponse(id, {
      content: [
        {
          type: "text",
          text: `Result: ${a} + ${b} = ${a + b}`
        }
      ]
    });
  } else {
    sendError(id, -32602, `Unknown tool: ${name}`);
  }
}

// Resource handler
function handleResourceRead(id, params) {
  const { uri } = params;

  if (uri === "file://weather/alerts.txt") {
    sendResponse(id, {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: "[WARNING] High wind warning in Istanbul until 22:00. Please stay indoors.\n[INFO] Temperatures expected to drop by 5 degrees tomorrow."
        }
      ]
    });
  } else {
    sendError(id, -32602, `Resource not found: ${uri}`);
  }
}

// Prompt handler
function handlePromptGet(id, params) {
  const { name, arguments: args } = params;

  if (name === "summarize_weather") {
    const city = args?.city || "Unknown";
    const mood = args?.mood || "friendly";

    let messageText = `You are a helpful assistant. Summarize the weather for ${city}.`;
    if (mood === "dramatic") {
      messageText = `You are a theatrical weather reporter. Narrate the epic atmospheric conditions unfolding in ${city}!`;
    } else if (mood === "professional") {
      messageText = `Provide a concise, data-driven professional meteorological briefing for ${city}.`;
    }

    sendResponse(id, {
      description: `Weather summary for ${city} in a ${mood} tone.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: messageText
          }
        }
      ]
    });
  } else {
    sendError(id, -32602, `Unknown prompt: ${name}`);
  }
}
