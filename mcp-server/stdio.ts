#!/usr/bin/env node
/**
 * mcp-server/stdio.ts
 *
 * stdio entry point for the Decision Engine MCP server. Run with:
 *
 *     pnpm mcp:stdio
 *
 * Or wire it into an MCP client (Claude Desktop, Cursor, Cowork) — see
 * mcp-server/README.md for the config snippet.
 *
 * IMPORTANT: stdio transport reserves stdout for protocol traffic. Any
 * console.log() inside the request path will corrupt the JSON-RPC stream
 * and the client will silently disconnect. We only log to stderr here.
 */
import { config as loadDotenv } from "dotenv";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDecideTool, SERVER_INFO } from "./server.js";

// Load .env / .env.local from the repo root. When launched as a
// subprocess by Claude Desktop the cwd is unpredictable, so resolve
// relative to this file.
const repoRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(repoRoot, ".env") });
loadDotenv({ path: path.join(repoRoot, ".env.local"), override: false });

async function main() {
  const server = new McpServer(SERVER_INFO);
  registerDecideTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // eslint-disable-next-line no-console
  console.error(
    `[${SERVER_INFO.name} ${SERVER_INFO.version}] stdio server ready`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal MCP stdio error:", err);
  process.exit(1);
});
