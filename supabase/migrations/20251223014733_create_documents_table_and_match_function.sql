/*
  # Decision Engine RAG Database Schema

  ## Overview
  This migration sets up the database for a Retrieval-Augmented Generation (RAG)
  system that helps users make decisions by searching through ingested documents.

  ## 1. Extensions
    - Enable `vector` extension for pgvector support (semantic search)

  ## 2. Tables
    - `documents`
      - `id` (bigserial PK)
      - `content` (text)
      - `metadata` (jsonb) — includes `source` filename for per-file dedup
      - `embedding` (vector(1024)) — Voyage AI `voyage-4-lite` default output
      - `created_at` (timestamptz)

  ## 3. Indexes
    - HNSW on `embedding` with cosine ops for fast approximate nearest neighbor

  ## 4. Functions
    - `match_documents(query_embedding vector(1024), match_threshold float, match_count int)`

  ## 5. Security (RLS)
    - Public SELECT (this is a read-only knowledge base)
    - Authenticated INSERT (used by the ingest script via the service role)

  ## NOTE on dimensionality
    Earlier revisions of this migration used vector(384) (HuggingFace MiniLM)
    and vector(768) (Google text-embedding-004 / gemini-embedding-001 at
    outputDimensionality=768). The runtime now uses Voyage AI voyage-4-lite at
    1024 dims (its default output). To migrate an existing 768-d (or 384-d)
    table, run once before re-ingesting:

        TRUNCATE TABLE documents RESTART IDENTITY;
        ALTER TABLE documents ALTER COLUMN embedding TYPE vector(1024);
        DROP INDEX IF EXISTS documents_embedding_idx;
        CREATE INDEX documents_embedding_idx ON documents
          USING hnsw (embedding vector_cosine_ops);
        DROP FUNCTION IF EXISTS match_documents(vector, float, int);
        CREATE OR REPLACE FUNCTION match_documents(
          query_embedding vector(1024),
          match_threshold float DEFAULT 0.5,
          match_count int DEFAULT 5
        )
        RETURNS TABLE (id bigint, content text, metadata jsonb, similarity float)
        LANGUAGE plpgsql AS $$
        BEGIN
          RETURN QUERY
          SELECT documents.id, documents.content, documents.metadata,
                 1 - (documents.embedding <=> query_embedding) AS similarity
          FROM documents
          WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
          ORDER BY documents.embedding <=> query_embedding
          LIMIT match_count;
        END; $$;

    Then `pnpm tsx scripts/add-books.ts` to re-embed your library with Voyage.
*/

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table with vector embeddings
CREATE TABLE IF NOT EXISTS documents (
  id bigserial PRIMARY KEY,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(1024) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- HNSW index for fast vector similarity search (cosine)
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents
USING hnsw (embedding vector_cosine_ops);

-- Function to match documents based on embedding similarity
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documents.id,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Allow public read access (querying knowledge base)
CREATE POLICY "Anyone can read documents"
  ON documents
  FOR SELECT
  TO public
  USING (true);

-- Allow authenticated users to insert documents (for ingestion via service role)
CREATE POLICY "Authenticated users can insert documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
