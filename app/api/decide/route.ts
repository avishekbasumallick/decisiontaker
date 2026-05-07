/**
 * POST /api/decide
 *
 * Thin transport adapter over `runDecide()` (lib/decide.ts). The actual
 * RAG pipeline lives there so the MCP server (mcp-server/) can reuse it
 * without duplicating logic.
 */
import { runDecide, DecideError } from "@/lib/decide";

export async function POST(req: Request) {
  console.log("--------------- API REQUEST STARTED ---------------");

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runDecide({
      problem: body.problem ?? "",
      options: Array.isArray(body.options) ? body.options : [],
    });
    return Response.json(result);
  } catch (e: any) {
    if (e instanceof DecideError) {
      console.error(`DecideError [${e.code}]:`, e.message);
      return Response.json({ error: e.message }, { status: e.httpStatus });
    }
    console.error("CRITICAL ERROR:", e);
    return Response.json(
      { error: e?.message ?? "Unknown Server Error" },
      { status: 500 }
    );
  }
}
