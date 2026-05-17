/**
 * Lint orchestrator — dispatches the requested check (or all five), composes
 * findings into the standard `LintResult` shape, and applies `--fix` actions
 * for findings with confidence >= 0.9.
 *
 * SQL-only. No LLM calls (C.R5). Each check is independent and runs as its
 * own bounded query.
 */

import { findContradictions, type PoolLike } from './checks/contradictions.js';
import { findStale } from './checks/stale.js';
import { findOrphans } from './checks/orphans.js';
import { findDrift } from './checks/drift.js';
import { findSupersededUnflagged } from './checks/superseded-unflagged.js';
import {
  ALL_CHECKS,
  FIX_CONFIDENCE_THRESHOLD,
  type CheckName,
  type LintFinding,
  type LintInput,
  type LintResult,
  type LintSummary,
} from './types.js';

const DEFAULT_LIMIT = 100;
const DEFAULT_SINCE_DAYS = 90;

export async function runLint(input: LintInput, pool: PoolLike): Promise<LintResult> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const sinceDays = input.since_days ?? DEFAULT_SINCE_DAYS;
  const checksToRun: CheckName[] = input.check ? [input.check] : [...ALL_CHECKS];

  const findings: LintFinding[] = [];
  for (const check of checksToRun) {
    if (check === 'contradictions') {
      findings.push(...(await findContradictions(pool, { limit })));
    } else if (check === 'stale') {
      findings.push(...(await findStale(pool, { sinceDays, limit })));
    } else if (check === 'orphans') {
      findings.push(...(await findOrphans(pool, { limit })));
    } else if (check === 'drift') {
      findings.push(...(await findDrift(pool, { limit })));
    } else if (check === 'superseded_unflagged') {
      findings.push(...(await findSupersededUnflagged(pool, { limit })));
    }
  }

  const summary = buildSummary(findings);
  const result: LintResult = { summary, findings };

  if (input.fix) {
    const fixesApplied = await applyFixes(pool, findings);
    result.fixes_applied = fixesApplied;
  }

  return result;
}

/**
 * Compose the per-check counts plus total. Always includes every check name
 * even when count is 0 — keeps the response shape stable across invocations
 * (C.AC2: shape doesn't drift between different `check` selections).
 */
function buildSummary(findings: LintFinding[]): LintSummary {
  const by_check: LintSummary['by_check'] = {
    contradictions: 0,
    stale: 0,
    orphans: 0,
    drift: 0,
    superseded_unflagged: 0,
  };
  for (const f of findings) by_check[f.check]++;
  return {
    total_findings: findings.length,
    by_check,
  };
}

/**
 * Apply auto-fixes for findings with confidence >= 0.9 (C.R3, C.AC4).
 *
 * Currently fixed:
 *   - stale: archive the memory (set type='archived')
 *   - superseded_unflagged: rewrite edge type from 'contradicts' to 'supersedes'
 *
 * Other check types return findings only — `--fix` is a no-op for them.
 */
async function applyFixes(
  pool: PoolLike,
  findings: LintFinding[],
): Promise<NonNullable<LintResult['fixes_applied']>> {
  const applied: NonNullable<LintResult['fixes_applied']> = [];
  for (const f of findings) {
    if (f.confidence < FIX_CONFIDENCE_THRESHOLD) continue;
    if (f.check === 'stale' && f.suggested_action === 'archive') {
      await pool.query(
        `UPDATE memories SET type = 'archived', updated_at = NOW() WHERE id = $1 AND type != 'archived'`,
        [f.memory_id],
      );
      applied.push({ memory_id: f.memory_id, action: 'archive' });
    } else if (
      f.check === 'superseded_unflagged' &&
      f.suggested_action === 'fix_edge_type' &&
      f.related_memory_id
    ) {
      await pool.query(
        `UPDATE memory_edges
         SET relation = 'supersedes', updated_at = NOW()
         WHERE from_memory_id = $1 AND to_memory_id = $2 AND relation = 'contradicts' AND valid_until IS NULL`,
        [f.memory_id, f.related_memory_id],
      );
      applied.push({ memory_id: f.memory_id, action: 'fix_edge_type' });
    }
  }
  return applied;
}
