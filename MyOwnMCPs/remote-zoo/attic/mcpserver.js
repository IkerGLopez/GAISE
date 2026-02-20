// Zoo Animal MCP Server using McpServer from SDK
// This implements the same functionality as server.js but using the modern McpServer class
// Following the pattern from: https://mcpcat.io/guides/building-mcp-server-typescript/

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import ZOO_ANIMALS from "../animals.js";

const server = new McpServer({
  name: "zoo-animal-mcp-server",
  version: "1.0.0",
});

// Tool: get_animals_by_species
server.registerTool(
  "get_animals_by_species",
  {
    title: "Get Animals by Species",
    description:
      "Retrieves all animals of a specific species from the zoo. Useful for aggregates like counting penguins or finding the oldest lion.",
    inputSchema: {
      species: z.string().describe("Species name, e.g., 'lion' or 'penguin'"),
    },
  },
  async ({ species }) => {
    const matches = ZOO_ANIMALS.filter(
      (animal) => animal.species.toLowerCase() === String(species).toLowerCase()
    );

    return {
      content: [{ type: "text", text: JSON.stringify(matches, null, 2) }],
    };
  }
);

// Tool: get_animal_details
server.registerTool(
  "get_animal_details",
  {
    title: "Get Animal Details",
    description: "Retrieves the details of a specific animal by its name.",
    inputSchema: {
      name: z.string().describe("Animal name, e.g., 'Leo'"),
    },
  },
  async ({ name }) => {
    const animal = ZOO_ANIMALS.find(
      (a) => a.name.toLowerCase() === String(name).toLowerCase()
    );

    return {
      content: [{ type: "text", text: JSON.stringify(animal || {}, null, 2) }],
    };
  }
);

// Main function to start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await server.close();
  process.exit(0);
});

// Start the server
main().catch((err) => {
  process.exit(1);
});
