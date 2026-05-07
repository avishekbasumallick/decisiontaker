/**
 * /api/mcp/[transport]
 *
 * Remote (HTTP / SSE) transport for the Decision Engine MCP server.
 *
 * The `[transport]` dynamic segment lets `mcp-handler` route the two MCP
 * variants to the same handler:
 *
 *   - https://<host>/api/mcp/mcp    → Streamable HTTP (current spec)
 *   - https://<host>/api/mcp/sse    → SSE (kept for older clients)
 *
 * Auth: bearer token from the `MCP_API_KEY` env var. If the env var is
 * unset the route returns 503, so the endpoint can't accidentally go
 * public if you forget to configure it on Vercel. If it is set, every
 * request must carry `Authorization: Bearer <MCP_API_KEY>`.
 */
import { createMcpHandler } from "mcp-handler";
import { registerDecideTool, SERVER_INFO } from "@/mcp-server/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const baseHandler = createMcpHandler(
  (server) => {
    registerDecideTool(server);
  },
  // mcp-handler reads `serverInfo` from this object at runtime even though
  // the SDK's `ServerOptions` type doesn't declare it; the cast keeps TS
  // happy without changing behaviour.
  { serverInfo: SERVER_INFO } as unknown as Parameters<typeof createMcpHandler>[1],
  { basePath: "/api/mcp" }
);

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="decision-engine"',
    },
  });
}

function disabled(): Response {
  return new Response(
    JSON.stringify({
      error:
        "MCP HTTP transport is disabled. Set MCP_API_KEY in the server environment to enable it.",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

async function authedHandler(req: Request): Promise<Response> {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return disabled();

  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  const token = match?.[1]?.trim();
  if (!token || token !== expected) {
    return unauthorized("Missing or invalid bearer token.");
  }

  return baseHandler(req);
}

export const GET = authedHandler;
export const POST = authedHandler;
export const DELETE = authedHandler;
