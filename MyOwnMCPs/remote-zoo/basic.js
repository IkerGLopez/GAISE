// Basic Zoo Animal MCP Server using McpServer with Streamable HTTP transport
// TRULY MINIMAL example without authentication - perfect for learning the basics
// Uses only the essential endpoints required for Streamable HTTP transport
// Based on examples from: https://github.com/modelcontextprotocol/typescript-sdk

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import express from "express";
import { randomUUID } from "crypto";
import ZOO_ANIMALS from "./animals.js";

// Create MCP server instance
const mcpServer = new McpServer({
  name: "minimal-zoo-animal-mcp-server",
  version: "1.0.0",
});

// Tool: get_animals_by_species (simplified without auth)
mcpServer.registerTool(
  "get_animals_by_species",
  {
    title: "Get Animals by Species",
    description:
      "Retrieves all animals of a specific species from the zoo. Useful for aggregates like counting penguins or finding the oldest lion.",
    inputSchema: {
      species: z
        .string()
        .describe("Species name, e.g., 'lion' or 'penguin'")
        .default("all"),
    },
  },
  async ({ species }) => {
    console.info(
      `>>> 🛠️ Tool: 'get_animals_by_species' called for '${species}'`
    );

    // If no species specified or "all", return all animals
    if (!species || species === "all") {
      return {
        content: [{ type: "text", text: JSON.stringify(ZOO_ANIMALS, null, 2) }],
      };
    }

    const matches = ZOO_ANIMALS.filter(
      (animal) => animal.species.toLowerCase() === String(species).toLowerCase()
    );

    return {
      content: [{ type: "text", text: JSON.stringify(matches, null, 2) }],
    };
  }
);

// Tool: get_animal_details (simplified without auth)
mcpServer.registerTool(
  "get_animal_details",
  {
    title: "Get Animal Details",
    description: "Retrieves the details of a specific animal by its name.",
    inputSchema: {
      name: z.string().describe("Animal name, e.g., 'Leo'").default(""),
    },
  },
  async ({ name }) => {
    console.info(`>>> 🛠️ Tool: 'get_animal_details' called for '${name}'`);

    // If no name specified, return a helpful message
    if (!name) {
      return {
        content: [
          {
            type: "text",
            text:
              "Please provide an animal name. Available animals: " +
              ZOO_ANIMALS.map((a) => a.name).join(", "),
          },
        ],
      };
    }

    const animal = ZOO_ANIMALS.find(
      (a) => a.name.toLowerCase() === String(name).toLowerCase()
    );

    if (!animal) {
      return {
        content: [
          {
            type: "text",
            text:
              `Animal '${name}' not found. Available animals: ` +
              ZOO_ANIMALS.map((a) => a.name).join(", "),
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(animal, null, 2) }],
    };
  }
);

// Create Express app
const app = express();

// Basic CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, mcp-session-id, mcp-protocol-version"
  );
  res.header("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use(express.json());

// Store active transport sessions (simplified)
const transports = new Map();

// Helper to create/connect a transport for a session
async function getOrCreateTransport(sessionId) {
  if (transports.has(sessionId)) {
    return transports.get(sessionId);
  }

  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    eventSourceEnabled: true,
  });

  transport.sessionId = sessionId;
  transport.onclose = () => {
    console.log(`🗑️ Transport closed for session: ${sessionId}`);
    transports.delete(sessionId);
  };

  await mcpServer.connect(transport);
  transports.set(sessionId, transport);
  console.log(`✅ Created new transport for session: ${sessionId}`);

  return transport;
}

// Basic MCP endpoint - no authentication required
app.post("/mcp", async (req, res) => {
  console.log("📨 Received MCP request:", req.body);

  try {
    const body = req.body;
    const rpcId = body && body.id !== undefined ? body.id : null;

    const headerVal = req.headers["mcp-session-id"];
    const clientSessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    const isInit = body && body.method === "initialize";
    let sessionId = clientSessionId;

    if (isInit || !sessionId) {
      sessionId = randomUUID();
    }

    res.setHeader("Mcp-Session-Id", sessionId);

    const transport = await getOrCreateTransport(sessionId);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error("❌ Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// Basic GET endpoint for SSE streams
app.get("/mcp", async (req, res) => {
  const headerVal = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;

  if (!sessionId || !transports.has(sessionId)) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  console.log(`📡 Establishing SSE stream for session ${sessionId}`);
  const transport = transports.get(sessionId);
  await transport.handleRequest(req, res);
});

// Basic DELETE endpoint for session cleanup
app.delete("/mcp", async (req, res) => {
  const headerVal = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(headerVal) ? headerVal[0] : headerVal;

  if (sessionId && transports.has(sessionId)) {
    console.log(`🗑️ Cleaning up session: ${sessionId}`);
    transports.delete(sessionId);
    res.status(204).end();
  } else {
    res.status(404).json({ error: "Session not found" });
  }
});

// Server info endpoint
app.get("/", (req, res) => {
  const base = `${req.protocol}://${req.headers.host}`;
  res.json({
    name: "Minimal Zoo Animal MCP Server",
    version: "1.0.0",
    description:
      "Minimal MCP server providing zoo animal tools via Streamable HTTP",
    endpoints: {
      mcp: `${base}/mcp`,
    },
    tools: ["get_animals_by_species", "get_animal_details"],
    activeSessions: transports.size,
  });
});

// Main function to start the server
async function main() {
  try {
    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`🚀 Basic MCP server started on port ${port}`);
      console.log(`📡 MCP endpoint: http://localhost:${port}/mcp`);
      console.log(`ℹ️  Server info: http://localhost:${port}/`);
    });
  } catch (error) {
    console.error("❌ Basic MCP server failed to start:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down basic MCP server...");

  for (const [sessionId, transport] of transports) {
    try {
      console.log(`🔄 Closing transport for session ${sessionId}...`);
      await transport.close();
    } catch (error) {
      console.error(
        `❌ Error closing transport for session ${sessionId}:`,
        error
      );
    }
  }

  transports.clear();
  console.log("✅ Server shutdown complete");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down basic MCP server...");

  for (const [sessionId, transport] of transports) {
    try {
      console.log(`🔄 Closing transport for session ${sessionId}...`);
      await transport.close();
    } catch (error) {
      console.error(
        `❌ Error closing transport for session ${sessionId}:`,
        error
      );
    }
  }

  transports.clear();
  console.log("✅ Server shutdown complete");
  process.exit(0);
});

// Start the server
main().catch((err) => {
  console.error("❌ Basic MCP server failed to start:", err);
  process.exit(1);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});
