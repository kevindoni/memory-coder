import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initDatabase, flushNow } from "./db/index.js";
import { loadEnvFile } from "./utils/env.js";
import { startBridge } from "./bridge/http.js";
import { startAutoIndexer } from "./core/git-indexer.js";
import { startFileWatcher } from "./core/file-watcher.js";
import { tools, toolHandlers } from "./tools/index.js";

// Ensure debounced DB writes are flushed on shutdown
function registerShutdownHooks(): void {
  const flushAndExit = (sig: string) => {
    console.error(`\n[${sig}] flushing pending writes...`);
    flushNow();
    process.exit(0);
  };
  process.on("SIGINT", () => flushAndExit("SIGINT"));
  process.on("SIGTERM", () => flushAndExit("SIGTERM"));
  process.on("beforeExit", () => flushNow());
}

class MemoryCoderServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      { name: "memory-coder", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const handler = toolHandlers[name];

      if (!handler) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: `Unknown tool: ${name}` }) }],
          isError: true
        };
      }

      try {
        const result = await handler(args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }) }],
          isError: true
        };
      }
    });
  }

  async run() {
    try {
      await initDatabase("./data/memory.db");
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("🚀 Memory Coder MCP Server running...");
    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }
}

async function main() {
  loadEnvFile();
  await initDatabase("./data/memory.db");
  registerShutdownHooks();

  if (process.env.MEMORY_CODER_MODE === "bridge") {
    const port = Number(process.env.MEMORY_CODER_PORT || 3333);
    await startBridge(port);
    startAutoIndexer();
    startFileWatcher();
    return;
  }

  const server = new MemoryCoderServer();
  await server.run();
}

void main();
