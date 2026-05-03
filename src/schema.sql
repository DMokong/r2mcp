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

-- ============================================================================
-- SPEC-043: memory_edges — typed relations between memories (Phase 1 wiki-mode)
-- Mirrors OB1's thought_edges shape for future convergence.
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_edges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_memory_id      UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_memory_id        UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation            TEXT NOT NULL CHECK (relation IN (
                        'supports', 'contradicts', 'supersedes',
                        'evolved_into', 'depends_on', 'related_to'
                      )),
  confidence          NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rationale           TEXT NOT NULL,
  classifier_version  TEXT NOT NULL,
  valid_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT memory_edges_no_self CHECK (from_memory_id <> to_memory_id),
  CONSTRAINT memory_edges_unique UNIQUE (from_memory_id, to_memory_id, relation)
);

-- Outgoing-edge lookup (used by recall() signals query AND Phase 2 compile)
CREATE INDEX IF NOT EXISTS idx_edges_from
  ON memory_edges (from_memory_id, relation);

-- Incoming-edge lookup (used by recall() reverse signals AND Phase 2 compile)
CREATE INDEX IF NOT EXISTS idx_edges_to
  ON memory_edges (to_memory_id, relation);

-- Partial index for currently-valid edges (used by Phase 3 lint)
CREATE INDEX IF NOT EXISTS idx_edges_currently_valid
  ON memory_edges (relation, from_memory_id)
  WHERE valid_until IS NULL;
