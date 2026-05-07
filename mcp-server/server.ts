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
 * Carefully worded so the calling LLM doesn't fabricate options when the
 * user has only stated a problem. Tightening this further is cheap.
 */
const DECIDE_DESCRIPTION = [
  "Recommend the best option from a set of 2+ candidate options for a",
  "specific decision the user is facing. The recommendation is grounded",
  "in mental models retrieved from a curated library of decision-making",
  "books (Thinking Fast and Slow, Decisive, Algorithms to Live By, etc.).",
  "",
  "Use this tool ONLY when the user has named or clearly implied at least",
  "2 candidate options. If the user has stated only a problem with no",
  "options, ask them which alternatives they're considering before",
  "calling this tool. Do NOT invent options on the user's behalf.",
  "",
  "Returns JSON with `recommendation`, `short_reason` (≤2 sentences), and",
  "`detailed_reasoning` (≥150 words, drawn from the retrieved frameworks).",
].join("\n");

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
              text: JSON.stringify(result, null, 2),
            },
          ],
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
