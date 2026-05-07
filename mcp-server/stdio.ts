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
//
// Mirror Next.js precedence: `.env.local` overrides `.env`. Without
// `override: true` here a stale key in `.env` would shadow the working
// key in `.env.local` and any upstream API call would 403.
const repoRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(repoRoot, ".env") });
loadDotenv({ path: path.join(repoRoot, ".env.local"), override: true });

function keyPrefix(name: string): string {
  const v = process.env[name] ?? "";
  return v ? `${v.slice(0, 8)}…(${v.length})` : "(unset)";
}

async function main() {
  const server = new McpServer(SERVER_INFO);
  registerDecideTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // eslint-disable-next-line no-console
  console.error(
    `[${SERVER_INFO.name} ${SERVER_INFO.version}] stdio server ready`
  );
  // Log key prefixes (NEVER full keys) on startup so future "is the right
  // key loaded?" debugging is a one-glance check in the MCP logs.
  // eslint-disable-next-line no-console
  console.error(
    `  env: VOYAGE=${keyPrefix("VOYAGE_API_KEY")} GROQ=${keyPrefix(
      "GROQ_API_KEY"
    )} SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(unset)"}`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal MCP stdio error:", err);
  process.exit(1);
});
