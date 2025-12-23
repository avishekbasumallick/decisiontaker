/*
  # Decision Engine RAG Database Schema

  ## Overview
  This migration sets up the database for a Retrieval-Augmented Generation (RAG) system 
  that helps users make decisions by searching through ingested documents.

  ## 1. Extensions
    - Enable `vector` extension for pgvector support (semantic search capabilities)

  ## 2. New Tables
    - `documents`
      - `id` (bigserial, primary key): Unique identifier for each document chunk
      - `content` (text): The actual text content of the document chunk
      - `metadata` (jsonb): Stores file information (source, title, page numbers, etc.)
      - `embedding` (vector(384)): 384-dimensional vector embedding using sentence-transformers/all-MiniLM-L6-v2
      - `created_at` (timestamptz): Timestamp when the document was ingested

  ## 3. Indexes
    - HNSW index on `embedding` column for fast vector similarity search
    - Uses cosine distance as the similarity metric

  ## 4. Functions
    - `match_documents(query_embedding, match_threshold, match_count)`
      - Performs semantic search by finding documents similar to the query embedding
      - Parameters:
        - `query_embedding`: The vector representation of the user's query
        - `match_threshold`: Minimum similarity score (default: 0.5)
        - `match_count`: Maximum number of results to return (default: 5)
      - Returns: Documents ordered by similarity (most relevant first)

  ## 5. Security
    - Enable RLS on `documents` table
    - Public read access for all users (since this is a knowledge base)
    - Authenticated users can insert new documents (for ingestion script)
*/

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table with vector embeddings
CREATE TABLE IF NOT EXISTS documents (
  id bigserial PRIMARY KEY,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(384) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create HNSW index for fast vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents 
USING hnsw (embedding vector_cosine_ops);

-- Create function to match documents based on embedding similarity
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(384),
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

-- Allow public read access (for querying knowledge base)
CREATE POLICY "Anyone can read documents"
  ON documents
  FOR SELECT
  TO public
  USING (true);

-- Allow authenticated users to insert documents (for ingestion)
CREATE POLICY "Authenticated users can insert documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (true);