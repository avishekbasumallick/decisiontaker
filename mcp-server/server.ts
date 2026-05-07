/**
 * mcp-server/server.ts
 *
 * Transport-agnostic Decision Engine MCP server: defines the `decide`
 * tool against the SDK's `McpServer` and exposes a small registration
 * helper so both the stdio entry point (`mcp-server/stdio.ts`) and the
 * HTTP route handler (`app/api/mcp/[transport]/route.ts`) can wire up
 * the same tool with no logic duplication.
 *
 * The real RAG pipeline lives in `lib/decide.ts` — this file is just the
 * MCP-shaped wrapper around it.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runDecide, DecideError } from "@/lib/decide";

export const SERVER_INFO = {
  name: "decision-engine",
  version: "0.1.0",
} as const;

/**
 * Carefully worded so the calling LLM:
 *   - doesn't fabricate options when the user has only stated a problem
 *   - doesn't paraphrase away the detailed_reasoning (the whole point of
 *     this tool is the mental-model citations from the library)
 */
const DECIDE_DESCRIPTION = [
  "Recommend the best option from a set of 2+ candidate options for any",
  "decision the user is weighing — personal, career, technical/architectural,",
  "business, or otherwise. The recommendation is grounded in mental models",
  "retrieved from a curated library of decision-making books (Thinking Fast",
  "and Slow, Decisive, Algorithms to Live By, Nudge, Principles, etc.).",
  "",
  "Use this tool ONLY when the user has named or clearly implied at least",
  "2 candidate options. If the user has stated only a problem with no",
  "options, ask them which alternatives they're considering before",
  "calling this tool. Do NOT invent options on the user's behalf.",
  "",
  "Output: a markdown document with three sections — Recommendation,",
  "Short reason, and Detailed reasoning. The detailed reasoning is the",
  "main value of this tool — it cites specific mental models from the",
  "user's library. When relaying the result to the user, INCLUDE the",
  "Detailed reasoning section substantially intact (you may add your own",
  "commentary after, but do not summarise it away). The same fields are",
  "also returned as `structuredContent` for programmatic callers.",
].join("\n");

/**
 * Render the runDecide() JSON as a human-readable markdown block. Claude
 * is much more likely to relay structured prose verbatim than to summarise
 * a JSON object, which is why we don't just JSON.stringify the result.
 *
 * The leading "Display instructions" block is a directive Claude reads at
 * response-formatting time — much closer to the moment of action than the
 * tool description itself, which is read once at registration. Stronger
 * lever for keeping the detailed_reasoning intact.
 */
function renderMarkdown(r: {
  recommendation: string;
  short_reason: string;
  detailed_reasoning: string;
}): string {
  return [
    `<!--`,
    `Display instructions for the assistant:`,
    `Reproduce the three sections below (Recommendation, Short reason,`,
    `Detailed reasoning) in your reply substantially verbatim. The`,
    `Detailed reasoning is the value of this tool — its mental-model`,
    `citations from the user's library should not be paraphrased away.`,
    `After reproducing them, you MAY add a separate "Your take" or`,
    `"Practical considerations" section with your own commentary, but`,
    `do not replace or rewrite the sections above.`,
    `-->`,
    ``,
    `## Recommendation`,
    ``,
    r.recommendation,
    ``,
    `## Short reason`,
    ``,
    r.short_reason,
    ``,
    `## Detailed reasoning (from your decision-making library)`,
    ``,
    r.detailed_reasoning,
  ].join("\n");
}

const DECIDE_INPUT_SHAPE = {
  problem: z
    .string()
    .min(1)
    .describe("The decision the user is trying to make, in plain English."),
  options: z
    .array(z.string().min(1))
    .min(2)
    .describe(
      "Two or more candidate options the user is weighing. Use the user's own wording; do not invent."
    ),
  context: z
    .string()
    .optional()
    .describe(
      "Optional extra context from the conversation (constraints, stakeholder info, etc.) that didn't fit into `problem` or `options`."
    ),
};

export function registerDecideTool(server: McpServer): void {
  server.tool(
    "decide",
    DECIDE_DESCRIPTION,
    DECIDE_INPUT_SHAPE,
    async ({ problem, options, context }) => {
      try {
        const result = await runDecide({ problem, options, context });
        return {
          content: [
            {
              type: "text" as const,
              text: renderMarkdown(result),
            },
          ],
          // Also expose the raw fields so MCP clients that want to render
          // their own UI (or post-process programmatically) can pull them
          // out without re-parsing the markdown.
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (e) {
        const message =
          e instanceof DecideError
            ? `[${e.code}] ${e.message}`
            : e instanceof Error
            ? e.message
            : String(e);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `decide failed: ${message}`,
            },
          ],
        };
      }
    }
  );
}
