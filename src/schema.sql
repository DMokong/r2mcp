-- r2mcp — Database Schema
-- PostgreSQL + pgvector: memories table with semantic search indexes

CREATE TABLE IF NOT EXISTS memories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('preferences', 'project-context', 'conversations')),
  type          TEXT NOT NULL CHECK (type IN ('preference', 'decision', 'context', 'relationship', 'observation', 'rejection', 'archived')),
  section       TEXT,
  topics        TEXT[] DEFAULT '{}',
  people        TEXT[] DEFAULT '{}',
  date          DATE,
  fingerprint   TEXT NOT NULL UNIQUE,
  embedding     vector(1536),
  source_file   TEXT,
  source_line   INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index
ALTER TABLE memories ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_memories_tsv ON memories USING gin(tsv);

-- pgvector index for semantic search (hnsw for small corpus)
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING hnsw (embedding vector_cosine_ops);

-- Metadata indexes
CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories (tier);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories (type);
CREATE INDEX IF NOT EXISTS idx_memories_topics ON memories USING gin (topics);
CREATE INDEX IF NOT EXISTS idx_memories_fingerprint ON memories (fingerprint);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories (created_at);

-- Migration: add 'archived' to type CHECK constraint (idempotent)
DO $$
BEGIN
  ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_type_check;
  ALTER TABLE memories ADD CONSTRAINT memories_type_check
    CHECK (type IN ('preference', 'decision', 'context', 'relationship', 'observation', 'rejection', 'archived'));
END $$;
