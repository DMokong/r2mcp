import { getPool } from '../db.js';
import { triggerGraphRebuild } from '../graph-rebuild.js';
import { runLint } from '../lint/run.js';
import type { LintFinding } from '../lint/types.js';

export interface MeditateInput {
  mode: 'full';
  dry_run: boolean;
  /**
   * SPEC-044 C.R4 — opt-in lint integration. Default false for backward
   * compatibility with existing direct callers (Slack bot, programmatic).
   * When true, lint runs and findings are surfaced in `lint_findings`.
   */
  include_lint?: boolean;
}

export interface MeditateResult {
  archived: number;
  deduplicated: number;
  cross_referenced: number;
  clustered: number;
  gaps_found: number;
  total_changes: number;
  /**
   * Populated only when input.include_lint is true. Absent (undefined) for
   * default callers — preserves the byte-identical default response shape.
   */
  lint_findings?: LintFinding[];
}

export async function meditate(input: MeditateInput, projectRoot?: string): Promise<MeditateResult> {
  const pool = getPool();

  // 1. Archive stale entries
  const archived = await archiveStale(pool, input.dry_run);

  // 2. Deduplicate (sanity check — fingerprints should be unique)
  const deduplicated = await countDuplicateFingerprints(pool);

  // 3. Cross-reference (find entries with 2+ shared topics)
  const cross_referenced = await countCrossReferencePairs(pool);

  // 4. Cluster by theme (count distinct topic clusters)
  const clustered = await countTopicClusters(pool);

  // 5. Surface gaps (topics in preferences but not project-context)
  const gaps_found = await surfaceGaps(pool);

  // Trigger graph rebuild after consolidation (only if not dry_run)
  if (!input.dry_run && projectRoot) {
    triggerGraphRebuild(projectRoot);
  }

  const result: MeditateResult = {
    archived,
    deduplicated,
    cross_referenced,
    clustered,
    gaps_found,
    total_changes: archived + deduplicated,
  };

  if (input.include_lint) {
    const lintResult = await runLint({}, pool);
    result.lint_findings = lintResult.findings;
  }

  return result;
}

/**
 * Archive stale entries:
 * - conversations tier: older than 90 days
 * - project-context tier: older than 180 days
 * - preferences tier: never auto-archived
 */
async function archiveStale(pool: ReturnType<typeof getPool>, dryRun: boolean): Promise<number> {
  // Count how many would be archived
  const countResult = await pool.query(`
    SELECT COUNT(*)::int AS count FROM memories
    WHERE type != 'archived' AND (
      (tier = 'conversations' AND created_at < NOW() - INTERVAL '90 days')
      OR
      (tier = 'project-context' AND created_at < NOW() - INTERVAL '180 days')
    )
  `);

  const count = countResult.rows[0].count;

  if (!dryRun && count > 0) {
    await pool.query(`
      UPDATE memories SET type = 'archived', updated_at = NOW()
      WHERE type != 'archived' AND (
        (tier = 'conversations' AND created_at < NOW() - INTERVAL '90 days')
        OR
        (tier = 'project-context' AND created_at < NOW() - INTERVAL '180 days')
      )
    `);
  }

  return count;
}

/**
 * Count entries with duplicate fingerprints (sanity check).
 * Shouldn't happen due to UNIQUE constraint, but counts them if they exist.
 */
async function countDuplicateFingerprints(pool: ReturnType<typeof getPool>): Promise<number> {
  const result = await pool.query(`
    SELECT COALESCE(SUM(dup_count - 1), 0)::int AS duplicates
    FROM (
      SELECT fingerprint, COUNT(*)::int AS dup_count
      FROM memories
      GROUP BY fingerprint
      HAVING COUNT(*) > 1
    ) sub
  `);

  return result.rows[0].duplicates;
}

/**
 * Find entries with overlapping topics (2+ shared topics) that could be cross-referenced.
 * Returns count of such pairs. Informational only for Phase 2.
 */
async function countCrossReferencePairs(pool: ReturnType<typeof getPool>): Promise<number> {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS pair_count
    FROM (
      SELECT m1.id AS id1, m2.id AS id2
      FROM memories m1
      JOIN memories m2 ON m1.id < m2.id
      WHERE (
        SELECT COUNT(*)
        FROM unnest(m1.topics) t1
        WHERE t1 = ANY(m2.topics)
      ) >= 2
    ) sub
  `);

  return result.rows[0].pair_count;
}

/**
 * Group entries by most common topic. Returns count of distinct topic clusters.
 * Informational only for Phase 2.
 */
async function countTopicClusters(pool: ReturnType<typeof getPool>): Promise<number> {
  const result = await pool.query(`
    SELECT COUNT(DISTINCT topic)::int AS cluster_count
    FROM memories, unnest(topics) AS topic
  `);

  return result.rows[0].cluster_count;
}

/**
 * Surface gaps: topics that appear in preferences but not in project-context.
 * These might indicate missing architectural documentation for decided preferences.
 */
async function surfaceGaps(pool: ReturnType<typeof getPool>): Promise<number> {
  const result = await pool.query(`
    SELECT COUNT(*)::int AS gap_count
    FROM (
      SELECT DISTINCT topic
      FROM memories, unnest(topics) AS topic
      WHERE tier = 'preferences'
      EXCEPT
      SELECT DISTINCT topic
      FROM memories, unnest(topics) AS topic
      WHERE tier = 'project-context'
    ) sub
  `);

  return result.rows[0].gap_count;
}
