/**
 * lib/decide.ts
 *
 * Pure (transport-agnostic) implementation of the Decision Engine RAG
 * pipeline. Both `app/api/decide/route.ts` (the public Next.js route used
 * by the web UI) and the MCP server (`mcp-server/`) call this so we have
 * a single source of truth for: input sanitisation, embedding,
 * pgvector retrieval, Groq reasoning, and JSON parsing.
 *
 * Env vars are read inside `runDecide()`, not at module load, because this
 * file is imported from contexts (the stdio MCP binary) that load `.env`
 * lazily.
 */
import { createClient } from "@supabase/supabase-js";
import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { VoyageEmbeddings } from "@/lib/embeddings";

// Embedding model + dimensionality must match the Supabase
// `documents.embedding` column. voyage-4-lite returns 1024-d vectors,
// matching the pgvector(1024) column declared in
// supabase/migrations/20251223014733_*.sql.
export const EMBEDDING_MODEL = "voyage-4-lite";
export const EMBEDDING_DIMENSIONS = 1024;

export interface DecideInput {
  problem: string;
  options: string[];
  /** Optional free-form context the caller wants appended to the prompt. */
  context?: string;
}

export interface DecideResult {
  recommendation: string;
  short_reason: string;
  detailed_reasoning: string;
}

/**
 * Distinct error class so callers can map to the right HTTP status / MCP
 * tool error without string-matching on `Error.message`.
 */
export class DecideError extends Error {
  readonly code:
    | "missing_env"
    | "invalid_input"
    | "embedding_failed"
    | "retrieval_failed"
    | "no_context"
    | "llm_parse_failed"
    | "unknown";
  readonly httpStatus: number;
  constructor(
    code: DecideError["code"],
    message: string,
    httpStatus = 500
  ) {
    super(message);
    this.name = "DecideError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ---------------------------------------------------------------------------
// JSON cleaner — same logic as the original route handler. Lives here so
// both transports get the same defensive parsing.
// ---------------------------------------------------------------------------
function cleanAndParseJSON(text: string): DecideResult {
  try {
    let clean = text.replace(/(```json|```)/g, "");
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1) clean = clean.substring(start, end + 1);
    clean = clean.replace(/"""/g, '"');
    clean = clean.replace(/(?<!\\)\n/g, "\\n");
    clean = clean.replace(/\t/g, "\\t");
    return JSON.parse(clean);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("JSON PARSE FAILED, attempting regex fallback:", text);
    const recMatch = text.match(/"recommendation":\s*"([^"]*?)"/);
    const shortMatch = text.match(/"short_reason":\s*"([^"]*?)"/);
    const detailMatch =
      text.match(/"detailed_reasoning":\s*"?([\s\S]*?)"?\s*}/) ||
      text.match(/"detailed_reasoning":\s*([\s\S]*)/);
    return {
      recommendation: recMatch ? recMatch[1] : "Analysis Complete",
      short_reason: shortMatch
        ? shortMatch[1]
        : "See detailed reasoning below.",
      detailed_reasoning: detailMatch
        ? detailMatch[1].trim().replace(/^"|"$|}$/g, "")
        : text,
    };
  }
}

const PROMPT = PromptTemplate.fromTemplate(`
  You are an expert decision consultant.

  User Problem: {problem}
  User Options: {options}
  {extra_context}

  CONTEXT FROM LIBRARY (STRICT):
  {context}

  Instructions:
  1. Select one option.
  2. "recommendation": The option text.
  3. "short_reason": 2 sentences max.
  4. "detailed_reasoning": A comprehensive analysis (Min 150 words).
     - Identify the specific mental models found in the context.
     - Do NOT force a framework if it is not in the context.
     - Use standard paragraphs separated by newlines.
     - Do NOT use Markdown formatting (no bolding or asterisks).
  5. CRITICAL JSON RULES:
     - Return valid JSON only.
     - Use standard double quotes (") for strings.
     - DO NOT use triple quotes (""").
     - Escape all newlines inside strings as "\\n".
`);

const stripCtrl = (s: string) => s.replace(/[\x00-\x1F\x7F]/g, "");

/**
 * Run the full RAG pipeline. Throws `DecideError` on any handled failure;
 * callers should map `.code` / `.httpStatus` to their transport.
 */
export async function runDecide(input: DecideInput): Promise<DecideResult> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const GROQ_KEY = process.env.GROQ_API_KEY;
  const VOYAGE_KEY = process.env.VOYAGE_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY || !GROQ_KEY || !VOYAGE_KEY) {
    throw new DecideError("missing_env", "Missing API Keys", 500);
  }

  const problem = stripCtrl(input.problem ?? "").trim();
  const options = (input.options ?? []).map((o) => stripCtrl(o).trim()).filter(Boolean);
  const extra = stripCtrl(input.context ?? "").trim();

  if (!problem) {
    throw new DecideError("invalid_input", "`problem` is required.", 400);
  }
  if (options.length < 2) {
    throw new DecideError(
      "invalid_input",
      "Provide at least 2 options.",
      400
    );
  }

  // --- STEP 1: Embed the problem (Voyage AI) ---
  const embeddings = new VoyageEmbeddings({
    apiKey: VOYAGE_KEY,
    model: EMBEDDING_MODEL,
    inputType: "query",
    // Single per-user request; class-level retry-on-429 still kicks in if
    // Voyage's per-minute window is full.
    minMsBetweenRequests: 0,
    maxRetries: 3,
  });

  let vector: number[];
  try {
    vector = await embeddings.embedQuery(problem);
  } catch (err: any) {
    throw new DecideError(
      "embedding_failed",
      `Embedding service busy: ${err?.message ?? err}`,
      503
    );
  }

  // --- STEP 2: Retrieval (Supabase pgvector RPC) ---
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: documents, error } = await supabase.rpc("match_documents", {
    query_embedding: vector,
    match_threshold: 0.1,
    match_count: 10,
  });
  if (error) {
    throw new DecideError(
      "retrieval_failed",
      `Database search failed: ${error.message}`,
      500
    );
  }

  if (!documents || documents.length === 0) {
    // Surface the same shape the UI has historically rendered for "library
    // had no relevant chunks" — this is a successful response, not an error.
    return {
      recommendation: "Unable to analyze.",
      short_reason: "No relevant frameworks found in your library.",
      detailed_reasoning:
        "The system searched your uploaded books but could not find a mental model that applies to this specific problem.",
    };
  }

  const contextText = documents
    .map((doc: { content: string }) => doc.content)
    .join("\n---\n");

  // --- STEP 3: Reasoning (Groq) ---
  // `llama-3.1-8b-instant` was deprecated by Groq on 2026-08-16; migrated
  // to the recommended replacement, `openai/gpt-oss-20b`.
  const model = new ChatGroq({
    apiKey: GROQ_KEY,
    model: "openai/gpt-oss-20b",
    temperature: 0.1,
  });

  const formatted = await PROMPT.format({
    context: contextText,
    problem,
    options: options.join(", "),
    extra_context: extra ? `\n  Additional Context: ${extra}` : "",
  });

  const response = await model.invoke(formatted);
  const rawOutputString = response.content as string;

  try {
    return cleanAndParseJSON(rawOutputString);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("LLM JSON parse failed, raw output below:");
    // eslint-disable-next-line no-console
    console.error(rawOutputString);
    throw new DecideError(
      "llm_parse_failed",
      "AI returned invalid JSON format. Check server logs.",
      502
    );
  }
}
