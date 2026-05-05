import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";

/**
 * Default Google Generative Language API base URL.
 * The `embedContent` and `batchEmbedContents` REST endpoints live under
 * `/v1beta/models/{model}:embedContent` and `:batchEmbedContents`.
 */
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
  /** Required. Google AI Studio / Gemini API key. */
  apiKey?: string;
  /** Defaults to "gemini-embedding-001". */
  model?: string;
  /**
   * Matryoshka output dimension. gemini-embedding-001 supports 3072 (default),
   * 1536, and 768. We default to 768 so existing pgvector(768) columns keep
   * working without a re-index.
   */
  outputDimensionality?: number;
  /** Defaults to "RETRIEVAL_QUERY". */
  taskType?: GeminiTaskType;
  /** Optional override for the API base URL. */
  baseUrl?: string;
  /** Max documents per batchEmbedContents request. */
  maxBatchSize?: number;
  /** Strip newlines from input text before embedding (matches LangChain default). */
  stripNewLines?: boolean;
}

/**
 * Custom LangChain `Embeddings` implementation for Google's
 * `gemini-embedding-001` model.
 *
 * `@langchain/google-genai`'s built-in `GoogleGenerativeAIEmbeddings` does not
 * forward `outputDimensionality` to the REST API, so we call the API directly
 * here and pin the dimensionality at 768 (Matryoshka representation learning).
 * That keeps the vectors compatible with the existing Supabase
 * `vector(768)` column while letting us upgrade away from the retired
 * `text-embedding-004` model.
 */
export class GeminiEmbeddings extends Embeddings {
  private apiKey: string;
  private model: string;
  private outputDimensionality: number;
  private taskType: GeminiTaskType;
  private baseUrl: string;
  private maxBatchSize: number;
  private stripNewLines: boolean;

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
  }

  private clean(text: string): string {
    return this.stripNewLines ? text.replace(/\n/g, " ") : text;
  }

  private contentPart(text: string) {
    return {
      model: `models/${this.model}`,
      content: { parts: [{ text: this.clean(text) }] },
      taskType: this.taskType,
      outputDimensionality: this.outputDimensionality,
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
    return values;
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
        out.push(values);
      }
    }
    return out;
  }
}
