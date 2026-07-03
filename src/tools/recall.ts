import { getPool } from '../db.js';
import { embedText, embeddingWarning } from '../embeddings.js';
import { currentScope, DEFAULT_SCOPE } from '../env.js';
import pgvector from 'pgvector';
import { getSignalsForMemoryIds } from '../edges/signals.js';
import type { RecallSignal } from '../edges/types.js';
import { findEntityByInput, getEntityLinksForMemories } from '../entities/db.js';
import type { EntityRow, EntityType } from '../entities/types.js';

const { toSql } = pgvector;

/**
 * Build a scope predicate (claw-nyxd). `scopes === null` means all_scopes — no
 * filter. Otherwise restrict to the given scopes (normally [current, 'global']).
 * Pushes the array onto params and returns the SQL fragment (empty when null).
 * `prefix` is the table alias, e.g. 'm.' for queries that alias memories as m.
 */
function scopeClause(prefix: string, params: unknown[], scopes: string[] | null): string {
  if (scopes === null) return '';
  params.push(scopes);
  return ` AND ${prefix}project_scope = ANY($${params.length}::text[])`;
}

export type Tier = 'preferences' | 'project-context' | 'conversations';
export type MatchType = 'semantic' | 'fulltext' | 'hybrid';
export type SearchMode = 'semantic' | 'fulltext_only';

const TIER_WEIGHTS: Record<string, number> = {
  preferences: 1.3,
  'project-context': 1.0,
  conversations: 0.8,
};

const TIER_ORDER: Tier[] = ['preferences', 'project-context', 'conversations'];

// Default to no floor to maintain backward compatibility with v1 callers.
// Set min_score explicitly (e.g. 0.3 for hybrid, 0.1 for fulltext) to filter low-quality results.
const DEFAULT_MIN_SCORE_HYBRID = 0.0;
const DEFAULT_MIN_SCORE_FULLTEXT = 0.0;
const DEFAULT_DIVERSITY = 0.7;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.82;

export interface EntityLink {
  type: EntityType;
  canonical_name: string;
  confidence: number;
}

/**
 * Pre-compaction result shape used internally: dual timestamps, full-precision
 * score, always-present persons. The wire shape is RecallResult — see
 * compactResult (claw-ohhj.3).
 */
export interface FullRecallResult {
  id: string;
  tier: string;
  content: string;
  metadata: {
    type: string;
    topics: string[];
    persons: string[];
    created: string;
    updated: string;
  };
  score: number;
  match_type: MatchType;
  /** SPEC-046: present only when recall() is called with an `entity` filter. */
  entity_links?: EntityLink[];
}

/**
 * Wire shape (claw-ohhj.3 compaction): score rounded to 3 decimals, one
 * timestamp (`updated` — equals creation time when the memory was never
 * updated), empty persons elided.
 */
export interface RecallResult {
  id: string;
  tier: string;
  content: string;
  metadata: {
    type: string;
    topics: string[];
    persons?: string[];
    updated: string;
  };
  score: number;
  match_type: MatchType;
  /** SPEC-046: present only when recall() is called with an `entity` filter. */
  entity_links?: EntityLink[];
}

/** Pre-compaction response assembled by runRecall; compactResponse trims it. */
export interface FullRecallResponse {
  results: RecallResult[];
  query: string;
  search_mode: SearchMode;
  tiers_searched: string[];
  tokens_used?: number;
  early_stopped?: boolean;
  signals?: RecallSignal[];
  entity_resolved?: boolean;
  entity_id?: string;
  warnings?: string[];
}

/**
 * Wire shape (claw-ohhj.3 compaction): no `query` echo, no `total_results`
 * (derivable from results.length), `early_stopped` only when true, `signals`
 * only when non-empty.
 */
export interface RecallResponse {
  results: RecallResult[];
  search_mode: SearchMode;
  tiers_searched: string[];
  tokens_used?: number;
  /** Present only when true. */
  early_stopped?: boolean;
  /** SPEC-043 signals; present only when non-empty (claw-ohhj.3 elision). */
  signals?: RecallSignal[];
  /** SPEC-046: present only when recall() is called with an `entity` filter. */
  entity_resolved?: boolean;
  /** SPEC-046: present only when `entity_resolved` is true. */
  entity_id?: string;
  /** Present only when the search ran degraded, e.g. embeddings unavailable (claw-8cjf.2). */
  warnings?: string[];
}

/** claw-ohhj.3: full-precision internal result → compact wire result. */
export function compactResult(r: FullRecallResult): RecallResult {
  const { created: _created, persons, ...metaRest } = r.metadata;
  return {
    ...r,
    score: Math.round(r.score * 1000) / 1000,
    metadata: {
      ...metaRest,
      ...(persons && persons.length > 0 ? { persons } : {}),
    },
  };
}

/** claw-ohhj.3: full response → compact wire response. */
export function compactResponse(full: FullRecallResponse): RecallResponse {
  const { query: _query, early_stopped, signals, ...rest } = full;
  return {
    ...rest,
    ...(early_stopped ? { early_stopped: true } : {}),
    ...(signals && signals.length > 0 ? { signals } : {}),
  };
}

export interface RecallInput {
  /** Free-text query. Optional only when `entity` is provided (SPEC-046 entity-only fast path). */
  query?: string;
  top_k?: number;
  tier?: Tier;
  max_tokens?: number;
  min_score?: number;
  diversity?: number;
  progressive?: boolean;
  confidence_threshold?: number;
  /** SPEC-046: optional entity filter. Resolves via canonical_name or alias. */
  entity?: string;
  /** claw-nyxd: when true, search across ALL project scopes (default: current + global). */
  all_scopes?: boolean;
  /**
   * claw-sdcn (P0a): read a SPECIFIC scope instead of the env's current scope.
   * Reads `scope` + global (so shared knowledge stays visible). Lets one process
   * read another scope's corpus — e.g. compile/read the 'ai-landscape' wiki from
   * a global-scope server. Ignored when all_scopes is true.
   */
  scope?: string;
}

// Internal type with pre-tier-weight score and raw embedding for MMR computation
interface InternalResult extends FullRecallResult {
  rawScore: number;
  rawEmbedding?: number[];
}

// --- Utility functions ---

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function estimateTokens(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * 1.3);
}

function parseEmbedding(raw: unknown): number[] | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  try {
    return raw.slice(1, -1).split(',').map(Number);
  } catch {
    return undefined;
  }
}

function docSimilarity(a: InternalResult, b: InternalResult): number {
  if (a.rawEmbedding && b.rawEmbedding) {
    return cosineSimilarity(a.rawEmbedding, b.rawEmbedding);
  }
  return jaccardSimilarity(a.content, b.content);
}

function stripInternal(r: InternalResult): FullRecallResult {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawScore, rawEmbedding, ...rest } = r;
  return rest;
}

function applyTierWeight(score: number, tier: string): number {
  return score * (TIER_WEIGHTS[tier] ?? 1.0);
}

// MMR: Maximum Marginal Relevance — balances relevance vs. diversity to eliminate redundant results.
// lambda=1.0 = pure relevance (same as top-K), lambda=0.0 = pure diversity.
export function applyMMR(
  candidates: InternalResult[],
  lambda: number,
  topK: number,
): InternalResult[] {
  if (candidates.length === 0) return [];
  if (candidates.length <= 1) return candidates.slice(0, topK);

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: InternalResult[] = [sorted[0]];
  const remaining = sorted.slice(1);

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = -1;
    let bestMMR = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = remaining[i].score;
      let maxSim = 0;
      for (const sel of selected) {
        const sim = docSimilarity(remaining[i], sel);
        if (sim > maxSim) maxSim = sim;
      }
      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestMMR) {
        bestMMR = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}

// --- DB search functions ---

async function hybridSearchTier(
  pool: ReturnType<typeof getPool>,
  query: string,
  queryEmbedding: number[],
  topK: number,
  scopes: string[] | null,
  tier?: Tier,
  fetchEmbeddings = false,
  entityId?: string,
): Promise<InternalResult[]> {
  const embeddingSql = toSql(queryEmbedding);
  const params: unknown[] = [embeddingSql, query];
  let tierFilter = '';
  if (tier) {
    tierFilter = ` AND tier = $${params.length + 1}`;
    params.push(tier);
  }
  // SPEC-046: narrow the candidate pool to memories linked to the resolved
  // entity. Cheapest expression is a subquery in the WHERE clause — applied
  // inside the CTE so ranking only ever runs over the entity-scoped pool.
  let entityFilter = '';
  if (entityId) {
    entityFilter = ` AND id IN (SELECT memory_id FROM memory_entities WHERE entity_id = $${params.length + 1})`;
    params.push(entityId);
  }
  const scopeFilter = scopeClause('', params, scopes);

  const embeddingCol = fetchEmbeddings ? 'embedding::text AS raw_embedding,' : '';

  const sql = `
    WITH scored AS (
      SELECT
        id, content, tier, type, topics, people, created_at, updated_at,
        ${embeddingCol}
        (1 - (embedding <=> $1::vector)) AS semantic_score,
        ts_rank(tsv, plainto_tsquery('english', $2)) AS fulltext_score,
        CASE
          WHEN embedding IS NOT NULL AND ts_rank(tsv, plainto_tsquery('english', $2)) > 0 THEN 'hybrid'
          WHEN embedding IS NOT NULL THEN 'semantic'
          ELSE 'fulltext'
        END AS match_type
      FROM memories
      WHERE type NOT IN ('rejection', 'archived')
      AND (
        embedding IS NOT NULL
        OR tsv @@ plainto_tsquery('english', $2)
      )${tierFilter}${entityFilter}${scopeFilter}
    )
    SELECT *,
      CASE match_type
        WHEN 'hybrid' THEN (0.7 * semantic_score + 0.3 * fulltext_score)
        WHEN 'semantic' THEN semantic_score
        ELSE fulltext_score
      END AS combined_score
    FROM scored
    ORDER BY combined_score DESC
    LIMIT ${topK}
  `;

  const { rows } = await pool.query(sql, params);

  return rows
    .map((row: Record<string, unknown>) => {
      const rawScore = row.combined_score as number;
      return {
        id: row.id as string,
        tier: row.tier as string,
        content: row.content as string,
        metadata: {
          type: row.type as string,
          topics: (row.topics as string[]) || [],
          persons: (row.people as string[]) || [],
          created: (row.created_at as Date).toISOString(),
          updated: (row.updated_at as Date).toISOString(),
        },
        score: applyTierWeight(rawScore, row.tier as string),
        match_type: row.match_type as MatchType,
        rawScore,
        rawEmbedding: fetchEmbeddings ? parseEmbedding(row.raw_embedding) : undefined,
      };
    })
    .sort((a: InternalResult, b: InternalResult) => b.score - a.score);
}

async function fulltextSearchTier(
  pool: ReturnType<typeof getPool>,
  query: string,
  topK: number,
  scopes: string[] | null,
  tier?: Tier,
  entityId?: string,
): Promise<InternalResult[]> {
  const params: unknown[] = [query];
  let tierFilter = '';
  if (tier) {
    tierFilter = ` AND tier = $${params.length + 1}`;
    params.push(tier);
  }
  let entityFilter = '';
  if (entityId) {
    entityFilter = ` AND id IN (SELECT memory_id FROM memory_entities WHERE entity_id = $${params.length + 1})`;
    params.push(entityId);
  }
  const scopeFilter = scopeClause('', params, scopes);

  const sql = `
    SELECT
      id, content, tier, type, topics, people, created_at, updated_at,
      ts_rank(tsv, plainto_tsquery('english', $1)) AS fulltext_score
    FROM memories
    WHERE type NOT IN ('rejection', 'archived')
    AND tsv @@ plainto_tsquery('english', $1)${tierFilter}${entityFilter}${scopeFilter}
    ORDER BY fulltext_score DESC
    LIMIT ${topK}
  `;

  const { rows } = await pool.query(sql, params);

  return rows
    .map((row: Record<string, unknown>) => {
      const rawScore = row.fulltext_score as number;
      return {
        id: row.id as string,
        tier: row.tier as string,
        content: row.content as string,
        metadata: {
          type: row.type as string,
          topics: (row.topics as string[]) || [],
          persons: (row.people as string[]) || [],
          created: (row.created_at as Date).toISOString(),
          updated: (row.updated_at as Date).toISOString(),
        },
        score: applyTierWeight(rawScore, row.tier as string),
        match_type: 'fulltext' as MatchType,
        rawScore,
      };
    })
    .sort((a: InternalResult, b: InternalResult) => b.score - a.score);
}

// Progressive tier search: searches tier by tier, top-down, stopping early when a high-confidence
// result is found. This avoids searching lower-signal tiers when the top tier already answers the query.
async function progressiveHybridSearch(
  pool: ReturnType<typeof getPool>,
  query: string,
  queryEmbedding: number[],
  topK: number,
  confidenceThreshold: number,
  scopes: string[] | null,
  entityId?: string,
): Promise<{ results: InternalResult[]; tiersSearched: string[]; earlyStopped: boolean }> {
  const tiersSearched: string[] = [];
  const allResults: InternalResult[] = [];
  let earlyStopped = false;

  for (const tier of TIER_ORDER) {
    tiersSearched.push(tier);
    const tierResults = await hybridSearchTier(
      pool,
      query,
      queryEmbedding,
      topK,
      scopes,
      tier,
      true,
      entityId,
    );

    // Merge without duplicates
    for (const r of tierResults) {
      if (!allResults.some((existing) => existing.id === r.id)) {
        allResults.push(r);
      }
    }

    // Early stop: if best raw score exceeds confidence threshold, no need to dig deeper
    if (allResults.length > 0) {
      const topRawScore = Math.max(...allResults.map((r) => r.rawScore));
      if (topRawScore >= confidenceThreshold) {
        earlyStopped = true;
        break;
      }
    }
  }

  return { results: allResults, tiersSearched, earlyStopped };
}

// --- Entity-only fast path ---

// When an entity filter is set but the caller provides no query (or an empty
// one), we skip semantic/fulltext ranking entirely — there's nothing to rank
// against. Return all memories linked to the entity, ordered by recency, so
// the entity_links attachment downstream still has a stable result set.
async function entityOnlySearch(
  pool: ReturnType<typeof getPool>,
  entityId: string,
  topK: number,
  scopes: string[] | null,
  tier?: Tier,
): Promise<InternalResult[]> {
  const params: unknown[] = [entityId];
  let tierFilter = '';
  if (tier) {
    tierFilter = ` AND m.tier = $${params.length + 1}`;
    params.push(tier);
  }
  const scopeFilter = scopeClause('m.', params, scopes);
  const sql = `
    SELECT m.id, m.content, m.tier, m.type, m.topics, m.people, m.created_at, m.updated_at
    FROM memories m
    WHERE m.type NOT IN ('rejection', 'archived')
    AND m.id IN (SELECT memory_id FROM memory_entities WHERE entity_id = $1)${tierFilter}${scopeFilter}
    ORDER BY m.updated_at DESC
    LIMIT ${topK}
  `;
  const { rows } = await pool.query(sql, params);
  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    tier: row.tier as string,
    content: row.content as string,
    metadata: {
      type: row.type as string,
      topics: (row.topics as string[]) || [],
      persons: (row.people as string[]) || [],
      created: (row.created_at as Date).toISOString(),
      updated: (row.updated_at as Date).toISOString(),
    },
    score: 1.0,
    match_type: 'fulltext' as MatchType,
    rawScore: 1.0,
  }));
}

// --- Main recall function ---

export async function recall(input: RecallInput): Promise<RecallResponse> {
  const {
    // SPEC-046: query is optional when `entity` is set (entity-only recall).
    // Normalize undefined → '' so downstream code keeps the same string contract.
    query = '',
    top_k = 10,
    tier,
    max_tokens,
    min_score,
    diversity = DEFAULT_DIVERSITY,
    progressive = true,
    confidence_threshold = DEFAULT_CONFIDENCE_THRESHOLD,
    entity,
    all_scopes = false,
    scope,
  } = input;

  const pool = getPool();

  // claw-nyxd: default reads union the current scope with 'global' (shared
  // knowledge). all_scopes=true bypasses the filter entirely (null = no clause).
  // claw-sdcn (P0a): an explicit `scope` reads that scope + global instead of
  // the env's current scope.
  const scopes: string[] | null = all_scopes
    ? null
    : Array.from(new Set([scope ?? currentScope(), DEFAULT_SCOPE]));

  // SPEC-046: resolve entity BEFORE retrieval. The resolution is the cheapest
  // possible signal — a single indexed lookup on entities.normalized_name.
  // When it fails, short-circuit with an empty result + entity_resolved=false
  // (no error, per AC3b).
  const entityFilterActive = entity !== undefined && entity !== '';
  let resolvedEntity: EntityRow | null = null;
  if (entityFilterActive) {
    // Entity resolution honors the same scope union (or all_scopes bypass).
    resolvedEntity = await findEntityByInput(pool, entity!, scopes);
    if (!resolvedEntity) {
      return {
        results: [],
        search_mode: 'semantic',
        tiers_searched: [],
        entity_resolved: false,
      };
    }
  }

  // Skip embedText entirely on the entity-only fast path: an empty query
  // would either burn an embedding round-trip for nothing or break ranking.
  const skipRanking = entityFilterActive && (!query || query === '');
  const queryEmbedding = skipRanking ? null : await embedText(query);
  // Only warn when an embedding was actually attempted (claw-8cjf.2).
  const degradedWarning = skipRanking ? null : embeddingWarning(queryEmbedding);

  let hasDbEmbeddings = false;
  if (queryEmbedding) {
    // Probe within the SAME scope set recall will query, so "has embeddings?"
    // can't diverge from the rows actually searched (claw-nyxd).
    const probeParams: unknown[] = [];
    const probeScope = scopeClause('', probeParams, scopes);
    const embCheck = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM memories WHERE embedding IS NOT NULL${probeScope}) AS has_embeddings`,
      probeParams,
    );
    hasDbEmbeddings = embCheck.rows[0].has_embeddings;
  }

  const useHybrid = queryEmbedding !== null && hasDbEmbeddings;
  const searchMode: SearchMode = useHybrid ? 'semantic' : 'fulltext_only';
  const effectiveMinScore =
    min_score ?? (useHybrid ? DEFAULT_MIN_SCORE_HYBRID : DEFAULT_MIN_SCORE_FULLTEXT);

  // Fetch a larger candidate pool so MMR has room to diversify
  const candidateLimit = Math.max(top_k * 3, 30);

  let rawResults: InternalResult[];
  let tiersSearched: string[];
  let earlyStopped = false;

  const entityId = resolvedEntity?.id;

  if (skipRanking && entityId) {
    // SPEC-046: entity-only fast path. No query → no ranking signal; just
    // return entity-linked memories ordered by recency.
    rawResults = await entityOnlySearch(pool, entityId, candidateLimit, scopes, tier);
    tiersSearched = tier ? [tier] : (TIER_ORDER as string[]);
  } else if (useHybrid && progressive && !tier) {
    // Phase 3: progressive tier search — most valuable in semantic mode
    const r = await progressiveHybridSearch(
      pool,
      query,
      queryEmbedding!,
      candidateLimit,
      confidence_threshold,
      scopes,
      entityId,
    );
    rawResults = r.results;
    tiersSearched = r.tiersSearched;
    earlyStopped = r.earlyStopped;
  } else if (useHybrid) {
    // Flat hybrid search: tier explicitly set or progressive disabled
    rawResults = await hybridSearchTier(
      pool,
      query,
      queryEmbedding!,
      candidateLimit,
      scopes,
      tier,
      true,
      entityId,
    );
    tiersSearched = tier ? [tier] : (TIER_ORDER as string[]);
  } else {
    // Fulltext-only fallback: no embeddings available
    rawResults = await fulltextSearchTier(pool, query, candidateLimit, scopes, tier, entityId);
    tiersSearched = tier ? [tier] : (TIER_ORDER as string[]);
  }

  // Phase 1a: relevance floor — drop results below minimum quality threshold
  const floorPassed = rawResults.filter((r) => r.rawScore >= effectiveMinScore);

  // Phase 1b: MMR diversity — re-rank to eliminate near-duplicate results
  const diverse = applyMMR(floorPassed, diversity, max_tokens ? candidateLimit : top_k);

  // Phase 2: context budgeting — fit within token budget, or apply top_k
  let finalResults: InternalResult[];
  let tokensUsed: number;

  if (max_tokens !== undefined) {
    finalResults = [];
    let tokenCount = 0;
    for (const r of diverse) {
      if (finalResults.length >= top_k) break; // top_k is always an upper bound
      const tokens = estimateTokens(r.content);
      if (tokenCount + tokens > max_tokens) break;
      finalResults.push(r);
      tokenCount += tokens;
    }
    tokensUsed = finalResults.reduce((sum, r) => sum + estimateTokens(r.content), 0);
  } else {
    finalResults = diverse.slice(0, top_k);
    tokensUsed = finalResults.reduce((sum, r) => sum + estimateTokens(r.content), 0);
  }

  const ids = finalResults.map((r) => r.id);
  const signals = await getSignalsForMemoryIds(pool, ids);

  // SPEC-046: when the entity filter is active, attach per-memory entity_links
  // (the FULL link set for each memory, not just the filter entity — callers
  // can see the wider entity graph for these results) and set top-level
  // entity_resolved + entity_id. When the filter is OFF, no entity keys appear
  // — not even undefined ones. Results and response then pass through the
  // claw-ohhj.3 compaction (rounded scores, single timestamp, no query echo).
  const stripped = finalResults.map(stripInternal);
  if (entityFilterActive && resolvedEntity) {
    const linkMap = await getEntityLinksForMemories(pool, ids);
    for (const r of stripped) {
      r.entity_links = linkMap.get(r.id) ?? [];
    }
    return compactResponse({
      results: stripped.map(compactResult),
      query,
      search_mode: searchMode,
      tiers_searched: tiersSearched,
      tokens_used: tokensUsed,
      early_stopped: earlyStopped,
      signals,
      entity_resolved: true,
      entity_id: resolvedEntity.id,
      ...(degradedWarning ? { warnings: [degradedWarning] } : {}),
    });
  }

  return compactResponse({
    results: stripped.map(compactResult),
    query,
    search_mode: searchMode,
    tiers_searched: tiersSearched,
    tokens_used: tokensUsed,
    early_stopped: earlyStopped,
    signals,
    ...(degradedWarning ? { warnings: [degradedWarning] } : {}),
  });
}
