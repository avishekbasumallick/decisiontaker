# Decision Engine — MCP server

The Decision Engine is also exposed as a [Model Context Protocol](https://modelcontextprotocol.io)
server, so any MCP-aware client (Claude Desktop, Cursor, Cowork,
claude.ai custom connectors) can call the same RAG pipeline that powers
the web UI.

## Tool surface

One tool, `decide`, with input fields:

| Field      | Type       | Required | Notes                                                      |
| ---------- | ---------- | :------: | ---------------------------------------------------------- |
| `problem`  | `string`   | yes      | The decision the user is making, in plain English.         |
| `options`  | `string[]` | yes (≥2) | Candidate options. The LLM should pull these verbatim.     |
| `context`  | `string`   | no       | Extra conversation context (constraints, stakeholders, …). |

It returns the same JSON shape as `POST /api/decide`:

```json
{
  "recommendation": "...",
  "short_reason": "...",
  "detailed_reasoning": "..."
}
```

Errors are returned as MCP tool errors (`isError: true`) with a
`[code] message` body. Codes: `missing_env`, `invalid_input`,
`embedding_failed`, `retrieval_failed`, `llm_parse_failed`.

## Running locally (stdio transport)

The stdio binary works the same way locally as it will inside any MCP
client.

```bash
pnpm install
pnpm mcp:stdio
```

It auto-loads `.env` and `.env.local` from the repo root, so the same
keys you use for `pnpm dev` (Voyage / Groq / Supabase) are picked up.

### Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json`
and add (substitute the absolute path to your clone):

```jsonc
{
  "mcpServers": {
    "decision-engine": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/absolute/path/to/decisiontaker", "mcp:stdio"]
    }
  }
}
```

If you'd rather not depend on `pnpm` being on `PATH` from inside Claude
Desktop, run `pnpm tsx mcp-server/stdio.ts` once to confirm it starts,
then point the config directly at `node` and the compiled JS once you
add a build step.

Restart Claude Desktop. In any chat, ask it a decision question — Claude
will discover the `decide` tool and call it when appropriate.

### Cursor / Cowork / other MCP clients

Same idea: point the client at the `pnpm mcp:stdio` command (or
equivalent) inside this repo's directory.

## Running remote (HTTP transport)

The HTTP transport is exposed as a Next.js route under `/api/mcp/...`.
It supports both Streamable HTTP and the legacy SSE transport via the
`[transport]` segment:

- `https://<host>/api/mcp/mcp` — Streamable HTTP (current spec)
- `https://<host>/api/mcp/sse` — SSE (older clients)

### Enabling it

The route returns 503 by default. To enable it, set `MCP_API_KEY` in
your server environment (Vercel project settings, `.env`, etc.) to any
random string. Once set, every request must carry
`Authorization: Bearer <MCP_API_KEY>`. There is no per-user auth — the
bearer token is a shared secret that gates access to the entire server.

### Connecting from claude.ai

In claude.ai → Settings → Connectors → Add custom connector:

- **URL:** `https://<your-deployment>/api/mcp/mcp`
- **Header:** `Authorization: Bearer <MCP_API_KEY>`

### Hosting notes

- The `decide` tool calls Voyage + Supabase + Groq. If any of those
  hiccup, the request can run for a few seconds. The route declares
  `maxDuration = 60` to give Vercel some headroom.
- There is **no rate limiting** beyond the bearer-token gate. Anyone
  with the token can drain your Voyage / Groq quota — share carefully.
