import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";

/**
 * lib/embeddings.ts
 *
 * Two LangChain-compatible Embeddings implementations:
 *
 *   - GeminiEmbeddings   — Google gemini-embedding-001 (kept for reference;
 *                          not currently wired into the runtime)
 *   - VoyageEmbeddings   — Voyage AI voyage-4-lite (the active embedder used
 *                          by app/api/decide/route.ts and scripts/add-books.ts)
 *
 * VoyageEmbeddings includes a built-in client-side rate limiter and 429
 * retry-with-backoff because every embedding provider (Voyage, Gemini, HF,
 * Cohere, Mistral) will throttle aggressively without one.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function l2Normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (norm === 0 || !Number.isFinite(norm)) return v;
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

// ---------------------------------------------------------------------------
// Voyage AI
// ---------------------------------------------------------------------------

const VOYAGE_API_BASE = "https://api.voyageai.com/v1";

export type VoyageInputType = "query" | "document";

export interface VoyageEmbeddingsParams extends EmbeddingsParams {
  /** Required. Voyage AI API key. */
  apiKey?: string;
  /** Defaults to "voyage-4-lite". */
  model?: string;
  /**
   * Matryoshka output dimension. voyage-4-lite supports 256 / 512 / 1024 (default)
   * / 2048. We default to 1024 to align with the Supabase pgvector(1024) column.
   * Set this only if you need a non-default dim — leaving it undefined keeps
   * the request body cleaner.
   */
  outputDimension?: 256 | 512 | 1024 | 2048;
  /**
   * "document" for the ingest script (corpus side), "query" for the API
   * route (user-typed problem). Voyage prepends a model-specific instruction
   * for each, so retrieval quality is meaningfully better when this is set.
   */
  inputType?: VoyageInputType;
  baseUrl?: string;
  /** Max texts per /embeddings call. Voyage hard limit is 128. */
  maxBatchSize?: number;
  /** L2-normalise outputs. Defaults to true (helps for L2/dot ops; cosine is unaffected). */
  normalize?: boolean;
  /**
   * Minimum milliseconds between consecutive POSTs from this instance.
   * Defaults to 21 000 ms (~3 RPM) which matches Voyage's free no-payment-method
   * tier. With a payment method on file you can drop this drastically (e.g. 30
   * for 2000 RPM tier-1).
   */
  minMsBetweenRequests?: number;
  /** Max 429 retries before giving up. Defaults to 5. */
  maxRetries?: number;
}

/**
 * Voyage AI embeddings via the REST endpoint POST /v1/embeddings.
 *
 * Each instance maintains a per-instance rate-limit gate (waitForSlot) so a
 * long-running ingest using one shared instance can't exceed the configured
 * RPM. On 429 the post() method honours Voyage's `retry-after` header (or
 * falls back to exponential backoff capped at ~8 minutes).
 */
export class VoyageEmbeddings extends Embeddings {
  private apiKey: string;
  private model: string;
  private outputDimension?: number;
  private inputType?: VoyageInputType;
  private baseUrl: string;
  private maxBatchSize: number;
  private normalizeVectors: boolean;
  private minMsBetweenRequests: number;
  private maxRetries: number;
  private nextSlotAt = 0;

  constructor(fields: VoyageEmbeddingsParams = {}) {
    super(fields);
    const apiKey = fields.apiKey ?? process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VoyageEmbeddings: VOYAGE_API_KEY missing — pass `apiKey` or set the env var."
      );
    }
    this.apiKey = apiKey;
    this.model = fields.model ?? "voyage-4-lite";
    this.outputDimension = fields.outputDimension;
    this.inputType = fields.inputType;
    this.baseUrl = (fields.baseUrl ?? VOYAGE_API_BASE).replace(/\/+$/, "");
    this.maxBatchSize = Math.min(fields.maxBatchSize ?? 30, 128);
    this.normalizeVectors = fields.normalize ?? true;
    this.minMsBetweenRequests = fields.minMsBetweenRequests ?? 21_000;
    this.maxRetries = fields.maxRetries ?? 5;
  }

  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    if (now < this.nextSlotAt) {
      await sleep(this.nextSlotAt - now);
    }
    this.nextSlotAt = Date.now() + this.minMsBetweenRequests;
  }

  private async post(input: string[]): Promise<number[][]> {
    const body: Record<string, unknown> = { input, model: this.model };
    if (this.inputType) body.input_type = this.inputType;
    if (this.outputDimension) body.output_dimension = this.outputDimension;

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.waitForSlot();

      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429 && attempt < this.maxRetries) {
        const ra = parseInt(res.headers.get("retry-after") ?? "", 10);
        // Honour retry-after when present, otherwise exponential backoff
        // (30s, 60s, 120s, 240s, 480s capped). Add a small jitter so multiple
        // workers don't pile back on at the same instant.
        const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 30_000 * 2 ** attempt;
        const jitter = Math.floor(Math.random() * 1000);
        const wait = Math.min(backoff, 480_000) + jitter;
        // eslint-disable-next-line no-console
        console.warn(
          `Voyage 429 (attempt ${attempt + 1}/${this.maxRetries}) — sleeping ${wait}ms`
        );
        await sleep(wait);
        attempt++;
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Voyage embeddings request failed (${res.status} ${res.statusText}): ${text}`
        );
      }

      const json = (await res.json()) as {
        data?: Array<{ embedding?: number[]; index?: number }>;
      };
      const items = (json.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (items.length !== input.length) {
        throw new Error(
          `Voyage embeddings: expected ${input.length} vectors, got ${items.length}.`
        );
      }
      return items.map((d) => {
        const v = d.embedding ?? [];
        return this.normalizeVectors ? l2Normalize(v) : v;
      });
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.caller.call(async () => this.post([text]));
    return v;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < documents.length; i += this.maxBatchSize) {
      const batch = documents.slice(i, i + this.maxBatchSize);
      const vectors = await this.caller.call(async () => this.post(batch));
      out.push(...vectors);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Google Gemini (kept for reference — not currently wired into the runtime)
// ---------------------------------------------------------------------------

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GeminiTaskType =
  | "RETRIEVAL_QUERY"
  | "RETRIEVAL_DOCUMENT"
  | "SEMANTIC_SIMILARITY"
  | "CLASSIFICATION"
  | "CLUSTERING"
  | "QUESTION_ANSWERING"
  | "FACT_VERIFICATION"
  | "CODE_RETRIEVAL_QUERY";

export interface GeminiEmbeddingsParams extends EmbeddingsParams {
  apiKey?: string;
  model?: string;
  outputDimensionality?: number;
  taskType?: GeminiTaskType;
  baseUrl?: string;
  maxBatchSize?: number;
  stripNewLines?: boolean;
  normalize?: boolean;
}

/**
 * GeminiEmbeddings — kept for reference. The runtime moved to Voyage AI
 * because gemini-embedding-001's free tier (1000 requests/day, counted
 * per-item even when batched) was too tight for a multi-thousand-chunk
 * knowledge base.
 */
export class GeminiEmbeddings extends Embeddings {
  private apiKey: string;
  private model: string;
  private outputDimensionality: number;
  private taskType: GeminiTaskType;
  private baseUrl: string;
  private maxBatchSize: number;
  private stripNewLines: boolean;
  private normalizeVectors: boolean;

  constructor(fields: GeminiEmbeddingsParams = {}) {
    super(fields);
    const apiKey = fields.apiKey ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GeminiEmbeddings: GOOGLE_API_KEY missing — pass `apiKey` or set the env var."
      );
    }
    this.apiKey = apiKey;
    this.model = fields.model ?? "gemini-embedding-001";
    this.outputDimensionality = fields.outputDimensionality ?? 768;
    this.taskType = fields.taskType ?? "RETRIEVAL_QUERY";
    this.baseUrl = (fields.baseUrl ?? GOOGLE_API_BASE).replace(/\/+$/, "");
    this.maxBatchSize = fields.maxBatchSize ?? 100;
    this.stripNewLines = fields.stripNewLines ?? true;
    this.normalizeVectors = fields.normalize ?? this.outputDimensionality < 3072;
  }

  private clean(text: string): string {
    return this.stripNewLines ? text.replace(/\n/g, " ") : text;
  }

  private contentPart(text: string) {
    return {
      model: `models/${this.model}`,
      content: { parts: [{ text: this.clean(text) }] },
      taskType: this.taskType,
      output_dimensionality: this.outputDimensionality,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${path}?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Gemini embeddings request failed (${res.status} ${res.statusText}): ${text}`
      );
    }
    return (await res.json()) as T;
  }

  async embedQuery(text: string): Promise<number[]> {
    const res = await this.caller.call(async () =>
      this.post<{ embedding?: { values?: number[] } }>(
        `models/${this.model}:embedContent`,
        this.contentPart(text)
      )
    );
    const values = res.embedding?.values ?? [];
    if (values.length !== this.outputDimensionality) {
      throw new Error(
        `Gemini embeddings: expected ${this.outputDimensionality} dims, got ${values.length}.`
      );
    }
    return this.normalizeVectors ? l2Normalize(values) : values;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) return [];
    const out: number[][] = [];
    for (let i = 0; i < documents.length; i += this.maxBatchSize) {
      const batch = documents.slice(i, i + this.maxBatchSize);
      const body = { requests: batch.map((d) => this.contentPart(d)) };
      const res = await this.caller.call(async () =>
        this.post<{ embeddings?: { values?: number[] }[] }>(
          `models/${this.model}:batchEmbedContents`,
          body
        )
      );
      const embeddings = res.embeddings ?? [];
      if (embeddings.length !== batch.length) {
        throw new Error(
          `Gemini embeddings: expected ${batch.length} vectors, got ${embeddings.length}.`
        );
      }
      for (const e of embeddings) {
        const values = e.values ?? [];
        if (values.length !== this.outputDimensionality) {
          throw new Error(
            `Gemini embeddings: expected ${this.outputDimensionality} dims, got ${values.length}.`
          );
        }
        out.push(this.normalizeVectors ? l2Normalize(values) : values);
      }
    }
    return out;
  }
}
