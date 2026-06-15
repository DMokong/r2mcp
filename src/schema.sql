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
  fingerprint   TEXT NOT NULL,
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
-- E3 (claw-nyxd): project_scope namespacing — idempotent migration.
-- Multiple projects can share one database without their memories colliding.
-- Existing rows backfill to 'global' (preserves prior shared-pool behavior for
-- any adopter upgrading). Per-deployment isolation is opt-in via R2MCP_SCOPE.
-- ============================================================================

-- 1. Add the scope column. NOT NULL DEFAULT backfills every existing row to
--    'global' in one pass; IF NOT EXISTS makes re-runs on boot a no-op.
ALTER TABLE memories ADD COLUMN IF NOT EXISTS project_scope TEXT NOT NULL DEFAULT 'global';
CREATE INDEX IF NOT EXISTS idx_memories_project_scope ON memories (project_scope);
CREATE INDEX IF NOT EXISTS idx_memories_scope_fingerprint ON memories (project_scope, fingerprint);

-- 2. Swap the global unique(fingerprint) for a per-scope composite. Discover the
--    old constraint by DEFINITION (not by assumed name) so it works whatever
--    Postgres auto-named the inline column UNIQUE. Pure constraint reshape — no
--    rows touched; the composite is strictly weaker so it can't fail on live data.
DO $$
DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
   WHERE rel.relname = 'memories'
     AND con.contype = 'u'
     AND array_length(con.conkey, 1) = 1
     AND att.attname = 'fingerprint';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE memories DROP CONSTRAINT %I', cname);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'memories_scope_fingerprint_key' AND conrelid = 'memories'::regclass
  ) THEN
    ALTER TABLE memories ADD CONSTRAINT memories_scope_fingerprint_key UNIQUE (project_scope, fingerprint);
  END IF;
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

-- ============================================================================
-- SPEC-046: entities + memory_entities — light entity extraction (Phase 4 wiki-mode)
-- Four-type taxonomy; one join table. Lighter than OB1's full ontology.
-- ============================================================================

CREATE TABLE IF NOT EXISTS entities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL CHECK (type IN ('project', 'person', 'tool', 'decision')),
  canonical_name  TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  aliases         TEXT[] NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entities_unique UNIQUE (type, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities (normalized_name);
CREATE INDEX IF NOT EXISTS idx_entities_aliases    ON entities USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_entities_type       ON entities (type);

-- E3 (claw-nyxd): scope entities per project, in lockstep with src/entities/db.ts
-- (the upsert's ON CONFLICT target must match this composite). Idempotent.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS project_scope TEXT NOT NULL DEFAULT 'global';
CREATE INDEX IF NOT EXISTS idx_entities_project_scope ON entities (project_scope);
DO $$
DECLARE cols int;
BEGIN
  -- Re-create entities_unique as the 3-col composite only if it isn't already
  -- (re-running on boot must be a no-op; the old 2-col version gets replaced once).
  SELECT array_length(con.conkey, 1) INTO cols
    FROM pg_constraint con
   WHERE con.conname = 'entities_unique' AND con.conrelid = 'entities'::regclass;
  IF cols IS DISTINCT FROM 3 THEN
    ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_unique;
    ALTER TABLE entities ADD CONSTRAINT entities_unique UNIQUE (project_scope, type, normalized_name);
  END IF;
END $$;

-- Note: memory_entities.confidence is NUMERIC(3,2) to match memory_edges.confidence
-- from SPEC-043 (already shipped). The SPEC-046 PR review (claw-2jbo) flagged the
-- prior REAL type as a cross-table inconsistency. Aligning here is safe because
-- memory_entities ships for the first time in this PR — no shipped consumers.
CREATE TABLE IF NOT EXISTS memory_entities (
  memory_id   UUID         NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  entity_id   UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  source      TEXT         NOT NULL DEFAULT 'classifier',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (memory_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_entities_entity ON memory_entities (entity_id);
CREATE INDEX IF NOT EXISTS idx_memory_entities_memory ON memory_entities (memory_id);
