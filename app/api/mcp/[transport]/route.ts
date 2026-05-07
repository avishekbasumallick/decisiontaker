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
 * request must carry the secret in one of two forms:
 *
 *   - Preferred (curl, mcp-remote, Claude Desktop):
 *       Authorization: Bearer <MCP_API_KEY>
 *
 *   - Fallback (claude.ai custom connectors, which only let you set a
 *     URL — no header field is exposed in the UI):
 *       URL ends with ?key=<MCP_API_KEY>
 *
 *     Treat URL-embedded secrets as a personal-use convenience only —
 *     the secret leaks into request logs and the claude.ai connector
 *     UI. For sharing the connector with anyone else, replace this
 *     with proper OAuth via mcp-handler's withMcpAuth().
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

function extractToken(req: Request): string | undefined {
  // 1. Authorization: Bearer <token> — preferred
  const auth = req.headers.get("authorization") ?? "";
  const headerMatch = /^Bearer\s+(.+)$/i.exec(auth);
  const headerToken = headerMatch?.[1]?.trim();
  if (headerToken) return headerToken;

  // 2. ?key=<token> in the URL — fallback for claude.ai custom connectors
  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("key")?.trim();
    if (queryToken) return queryToken;
  } catch {
    // Malformed URL — fall through to undefined.
  }

  return undefined;
}

async function authedHandler(req: Request): Promise<Response> {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return disabled();

  const token = extractToken(req);
  if (!token || token !== expected) {
    return unauthorized("Missing or invalid bearer token.");
  }

  return baseHandler(req);
}

export const GET = authedHandler;
export const POST = authedHandler;
export const DELETE = authedHandler;
