import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, KeyRound } from "lucide-react";

export const metadata = {
  title: "Decision Engine — MCP Server",
  description:
    "Use the Decision Engine as a remote MCP server from claude.ai, Claude Desktop, Cursor, or any Model Context Protocol client.",
};

const ENDPOINT_URL = "https://decisiontaker.vercel.app/api/mcp/mcp";
const REPO_URL = "https://github.com/avishekbasumallick/decisiontaker";

// Read the public bearer at server-render time so rotating the env var on
// Vercel automatically updates these docs on the next deploy. Falls back to a
// placeholder for local dev when MCP_API_KEY isn't set. Server components
// don't ship this value to the client bundle in any sensitive way — it's
// rendered into the static HTML, which is exactly what we want for public
// docs of a shared demo key.
const PUBLIC_KEY = process.env.MCP_API_KEY ?? "YOUR_MCP_API_KEY";
const FULL_URL_WITH_KEY = `${ENDPOINT_URL}?key=${PUBLIC_KEY}`;

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-900 text-gray-100 text-sm p-4 leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <div className="text-gray-700 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

export default function McpDocsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-10">
        <div className="text-center space-y-4">
          <Image
            src="/logo.png"
            alt="Decision Engine Logo"
            width={64}
            height={64}
            className="mx-auto"
          />
          <h1 className="text-3xl font-extrabold text-gray-900">
            Decision Engine — MCP Server
          </h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Use the Decision Engine inside any{" "}
            <a
              href="https://modelcontextprotocol.io"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Model Context Protocol
            </a>{" "}
            client — claude.ai, Claude Desktop, Cursor, or your own LLM app.
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to the web UI
            </Link>
          </div>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-400 text-blue-900 p-4 rounded-md">
          <p className="text-sm">
            <strong>What you get:</strong> a single tool, <code>decide</code>,
            that takes a problem plus 2+ candidate options and returns a
            recommendation grounded in mental models from a curated library
            (<em>Thinking Fast and Slow</em>, <em>Decisive</em>,{" "}
            <em>Algorithms to Live By</em>, <em>Nudge</em>,{" "}
            <em>Principles</em>, and more). Same pipeline that powers this
            site&apos;s web UI.
          </p>
        </div>

        {/* Quick-start panel — copy-pasteable URL + key */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-bold text-gray-900">Quick start</h2>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Server URL
            </div>
            <CodeBlock>{ENDPOINT_URL}</CodeBlock>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Bearer token
            </div>
            <CodeBlock>{PUBLIC_KEY}</CodeBlock>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Single URL with the key embedded (for clients that don&apos;t
              expose a header field, like claude.ai)
            </div>
            <CodeBlock>{FULL_URL_WITH_KEY}</CodeBlock>
          </div>
          <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
            This is a shared, free demo deployment — please use it
            responsibly. Voyage AI and Groq are running on free tiers; if
            usage gets heavy this URL will move behind per-user OAuth and the
            shared key will be retired. For unconstrained use, see{" "}
            <a
              href="#self-host"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              self-hosting
            </a>
            .
          </p>
        </div>

        <Section id="endpoint" title="Endpoint & auth">
          <p>The remote server speaks Streamable HTTP (current MCP spec):</p>
          <CodeBlock>{`POST ${ENDPOINT_URL}`}</CodeBlock>
          <p>
            Pass the bearer token either as an HTTP header (preferred) or as
            a query parameter (used by clients like claude.ai whose UI
            doesn&apos;t expose a header field):
          </p>
          <CodeBlock>{`# Header (curl, mcp-remote, programmatic clients)
Authorization: Bearer ${PUBLIC_KEY}

# OR — query param (claude.ai custom connectors)
${FULL_URL_WITH_KEY}`}</CodeBlock>
        </Section>

        <Section id="tool" title="Tool: decide">
          <p>Input schema:</p>
          <CodeBlock>{`{
  "problem":  string,         // the decision in plain English
  "options":  string[],       // 2 or more candidate options
  "context":  string?         // optional extra context
}`}</CodeBlock>
          <p>Output (markdown text + structuredContent):</p>
          <CodeBlock>{`{
  "recommendation":      string,  // the picked option
  "short_reason":        string,  // ≤2 sentences
  "detailed_reasoning":  string   // ≥150 words, cites mental models from the library
}`}</CodeBlock>
        </Section>

        <Section id="claude-ai" title="Use it from claude.ai">
          <p>
            On a Pro / Max / Team / Enterprise plan, go to{" "}
            <a
              href="https://claude.ai/settings/connectors"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
            >
              Settings → Connectors <ExternalLink className="h-3 w-3" />
            </a>{" "}
            → <strong>Add custom connector</strong> and paste:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              <strong>Name:</strong> Decision Engine
            </li>
            <li>
              <strong>Remote MCP server URL:</strong>
              <div className="mt-1">
                <CodeBlock>{FULL_URL_WITH_KEY}</CodeBlock>
              </div>
            </li>
            <li>Leave the OAuth advanced fields blank.</li>
          </ul>
          <p>
            Then enable the <strong>Decision Engine</strong> toggle in any
            chat&apos;s tool/connector panel and ask Claude a decision question
            — e.g. &quot;Use the decide tool: should I take the Seattle job or
            stay in Boston?&quot;
          </p>
        </Section>

        <Section id="claude-desktop" title="Use it from Claude Desktop">
          <p>
            Claude Desktop only speaks stdio. Bridge it to the remote endpoint
            with{" "}
            <a
              href="https://www.npmjs.com/package/mcp-remote"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              mcp-remote
            </a>
            . Open{" "}
            <code className="text-xs">
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>{" "}
            and add:
          </p>
          <CodeBlock>{`{
  "mcpServers": {
    "decision-engine": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${ENDPOINT_URL}",
        "--header",
        "Authorization: Bearer ${PUBLIC_KEY}"
      ]
    }
  }
}`}</CodeBlock>
          <p>
            Restart Claude Desktop. The <code>decide</code> tool becomes
            available in every chat.
          </p>
        </Section>

        <Section id="cursor" title="Use it from Cursor / other MCP-aware editors">
          <p>
            Cursor accepts the same JSON shape as Claude Desktop. In Cursor
            settings, find the MCP servers config and add the same entry as
            above. Other editors (Cline, Continue, Zed&apos;s MCP support, etc.)
            follow the same pattern: stdio command + args + header for auth.
          </p>
        </Section>

        <Section id="programmatic" title="Use it programmatically">
          <p>
            Any code that speaks MCP can call the server directly. With the
            official TypeScript SDK:
          </p>
          <CodeBlock>{`import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from
  "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("${ENDPOINT_URL}"),
  {
    requestInit: {
      headers: { Authorization: "Bearer ${PUBLIC_KEY}" },
    },
  }
);

const client = new Client({ name: "my-app", version: "0.0.1" });
await client.connect(transport);

const result = await client.callTool({
  name: "decide",
  arguments: {
    problem: "Pick a database for a 50K-user SaaS",
    options: ["Postgres", "DynamoDB", "MongoDB"],
  },
});
console.log(result.structuredContent);`}</CodeBlock>
          <p>
            If you&apos;d rather skip the MCP layer entirely, the underlying
            REST endpoint is still public:
          </p>
          <CodeBlock>{`POST https://decisiontaker.vercel.app/api/decide
Content-Type: application/json

{
  "problem": "...",
  "options": ["Option A", "Option B"]
}`}</CodeBlock>
          <p className="text-sm text-gray-600">
            Returns the same three fields directly as JSON, no auth required
            (rate limiting is on the roadmap).
          </p>
        </Section>

        <Section id="self-host" title="Self-hosting (for unconstrained use)">
          <p>
            The whole stack — Next.js app, MCP server (stdio + HTTP), pgvector
            schema, ingestion script — is open source. To run your own with
            your own quotas:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>
              Fork{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
              >
                {REPO_URL.replace("https://", "")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              Provision Supabase + grab a Voyage AI key + a Groq key (all have
              free tiers).
            </li>
            <li>
              Drop your own books into <code>books/</code> and run{" "}
              <code>pnpm ingest</code>.
            </li>
            <li>Deploy to Vercel; set <code>MCP_API_KEY</code> in env vars.</li>
          </ol>
          <p className="text-sm text-gray-600">
            See{" "}
            <a
              href={`${REPO_URL}/blob/main/mcp-server/README.md`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              mcp-server/README.md
            </a>{" "}
            for the detailed setup.
          </p>
        </Section>

        <Section id="links" title="Links">
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>
              Source code:{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                {REPO_URL}
              </a>
            </li>
            <li>
              MCP specification:{" "}
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                modelcontextprotocol.io
              </a>
            </li>
            <li>
              Vercel&apos;s mcp-handler (used here):{" "}
              <a
                href="https://github.com/vercel/mcp-handler"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                vercel/mcp-handler
              </a>
            </li>
          </ul>
        </Section>

        <div className="text-center text-sm text-gray-500 pt-6 border-t border-gray-200">
          <Link href="/" className="hover:text-gray-900">
            ← Back to the web UI
          </Link>
        </div>
      </div>
    </div>
  );
}
