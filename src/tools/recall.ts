import { getPool } from '../db.js';
import { embedText } from '../embeddings.js';
import pgvector from 'pgvector';
import { getSignalsForMemoryIds } from '../edges/signals.js';
import type { RecallSignal } from '../edges/types.js';

const { toSql } = pgvector;

export type Tier = 'preferences' | 'project-context' | 'conversations';
export type MatchType = 'semantic' | 'fulltext' | 'hybrid';
export type SearchMode = 'semantic' | 'fulltext_only';

const TIER_WEIGHTS: Record<string, number> = {
  'preferences': 1.3,
  'project-context': 1.0,
  'conversations': 0.8,
};

const TIER_ORDER: Tier[] = ['preferences', 'project-context', 'conversations'];

// Default to no floor to maintain backward compatibility with v1 callers.
// Set min_score explicitly (e.g. 0.3 for hybrid, 0.1 for fulltext) to filter low-quality results.
const DEFAULT_MIN_SCORE_HYBRID = 0.0;
const DEFAULT_MIN_SCORE_FULLTEXT = 0.0;
const DEFAULT_DIVERSITY = 0.7;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.82;

export interface RecallResult {
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
}

export interface RecallResponse {
  results: RecallResult[];
  query: string;
  total_results: number;
  search_mode: SearchMode;
  tiers_searched: string[];
  tokens_used?: number;
  early_stopped?: boolean;
  signals?: RecallSignal[];
}

export interface RecallInput {
  query: string;
  top_k?: number;
  tier?: Tier;
  max_tokens?: number;
  min_score?: number;
  diversity?: number;
  progressive?: boolean;
  confidence_threshold?: number;
}

// Internal type with pre-tier-weight score and raw embedding for MMR computation
interface InternalResult extends RecallResult {
  rawScore: number;
  rawEmbedding?: number[];
}

// --- Utility functions ---

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
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

function stripInternal(r: InternalResult): RecallResult {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawScore, rawEmbedding, ...rest } = r;
  return rest;
}

function applyTierWeight(score: number, tier: string): number {
  return score * (TIER_WEIGHTS[tier] ?? 1.0);
}

// MMR: Maximum Marginal Relevance — balances relevance vs. diversity to eliminate redundant results.
// lambda=1.0 = pure relevance (same as top-K), lambda=0.0 = pure diversity.
export function applyMMR(candidates: InternalResult[], lambda: number, topK: number): InternalResult[] {
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
  tier?: Tier,
  fetchEmbeddings = false,
): Promise<InternalResult[]> {
  const embeddingSql = toSql(queryEmbedding);
  const params: unknown[] = [embeddingSql, query];
  let tierFilter = '';
  if (tier) {
    tierFilter = ' AND tier = $3';
    params.push(tier);
  }

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
      )${tierFilter}
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

  return rows.map((row: Record<string, unknown>) => {
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
  }).sort((a: InternalResult, b: InternalResult) => b.score - a.score);
}

async function fulltextSearchTier(
  pool: ReturnType<typeof getPool>,
  query: string,
  topK: number,
  tier?: Tier,
): Promise<InternalResult[]> {
  const params: unknown[] = [query];
  let tierFilter = '';
  if (tier) {
    tierFilter = ' AND tier = $2';
    params.push(tier);
  }

  const sql = `
    SELECT
      id, content, tier, type, topics, people, created_at, updated_at,
      ts_rank(tsv, plainto_tsquery('english', $1)) AS fulltext_score
    FROM memories
    WHERE type NOT IN ('rejection', 'archived')
    AND tsv @@ plainto_tsquery('english', $1)${tierFilter}
    ORDER BY fulltext_score DESC
    LIMIT ${topK}
  `;

  const { rows } = await pool.query(sql, params);

  return rows.map((row: Record<string, unknown>) => {
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
  }).sort((a: InternalResult, b: InternalResult) => b.score - a.score);
}

// Progressive tier search: searches tier by tier, top-down, stopping early when a high-confidence
// result is found. This avoids searching lower-signal tiers when the top tier already answers the query.
async function progressiveHybridSearch(
  pool: ReturnType<typeof getPool>,
  query: string,
  queryEmbedding: number[],
  topK: number,
  confidenceThreshold: number,
): Promise<{ results: InternalResult[]; tiersSearched: string[]; earlyStopped: boolean }> {
  const tiersSearched: string[] = [];
  const allResults: InternalResult[] = [];
  let earlyStopped = false;

  for (const tier of TIER_ORDER) {
    tiersSearched.push(tier);
    const tierResults = await hybridSearchTier(pool, query, queryEmbedding, topK, tier, true);

    // Merge without duplicates
    for (const r of tierResults) {
      if (!allResults.some(existing => existing.id === r.id)) {
        allResults.push(r);
      }
    }

    // Early stop: if best raw score exceeds confidence threshold, no need to dig deeper
    if (allResults.length > 0) {
      const topRawScore = Math.max(...allResults.map(r => r.rawScore));
      if (topRawScore >= confidenceThreshold) {
        earlyStopped = true;
        break;
      }
    }
  }

  return { results: allResults, tiersSearched, earlyStopped };
}

// --- Main recall function ---

export async function recall(input: RecallInput): Promise<RecallResponse> {
  const {
    query,
    top_k = 10,
    tier,
    max_tokens,
    min_score,
    diversity = DEFAULT_DIVERSITY,
    progressive = true,
    confidence_threshold = DEFAULT_CONFIDENCE_THRESHOLD,
  } = input;

  const pool = getPool();
  const queryEmbedding = await embedText(query);

  let hasDbEmbeddings = false;
  if (queryEmbedding) {
    const embCheck = await pool.query(
      'SELECT EXISTS(SELECT 1 FROM memories WHERE embedding IS NOT NULL) AS has_embeddings'
    );
    hasDbEmbeddings = embCheck.rows[0].has_embeddings;
  }

  const useHybrid = queryEmbedding !== null && hasDbEmbeddings;
  const searchMode: SearchMode = useHybrid ? 'semantic' : 'fulltext_only';
  const effectiveMinScore = min_score ?? (useHybrid ? DEFAULT_MIN_SCORE_HYBRID : DEFAULT_MIN_SCORE_FULLTEXT);

  // Fetch a larger candidate pool so MMR has room to diversify
  const candidateLimit = Math.max(top_k * 3, 30);

  let rawResults: InternalResult[];
  let tiersSearched: string[];
  let earlyStopped = false;

  if (useHybrid && progressive && !tier) {
    // Phase 3: progressive tier search — most valuable in semantic mode
    const r = await progressiveHybridSearch(pool, query, queryEmbedding!, candidateLimit, confidence_threshold);
    rawResults = r.results;
    tiersSearched = r.tiersSearched;
    earlyStopped = r.earlyStopped;
  } else if (useHybrid) {
    // Flat hybrid search: tier explicitly set or progressive disabled
    rawResults = await hybridSearchTier(pool, query, queryEmbedding!, candidateLimit, tier, true);
    tiersSearched = tier ? [tier] : (TIER_ORDER as string[]);
  } else {
    // Fulltext-only fallback: no embeddings available
    rawResults = await fulltextSearchTier(pool, query, candidateLimit, tier);
    tiersSearched = tier ? [tier] : (TIER_ORDER as string[]);
  }

  // Phase 1a: relevance floor — drop results below minimum quality threshold
  const floorPassed = rawResults.filter(r => r.rawScore >= effectiveMinScore);

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

  const ids = finalResults.map(r => r.id);
  const signals = await getSignalsForMemoryIds(pool, ids);

  return {
    results: finalResults.map(stripInternal),
    query,
    total_results: finalResults.length,
    search_mode: searchMode,
    tiers_searched: tiersSearched,
    tokens_used: tokensUsed,
    early_stopped: earlyStopped,
    signals,
  };
}
