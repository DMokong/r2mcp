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
import { currentScope } from '../env.js';

const DEFAULT_LIMIT = 100;
const DEFAULT_SINCE_DAYS = 90;

export async function runLint(
  input: LintInput,
  pool: PoolLike,
  scope: string = currentScope(),
): Promise<LintResult> {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const sinceDays = input.since_days ?? DEFAULT_SINCE_DAYS;
  const checksToRun: CheckName[] = input.check ? [input.check] : [...ALL_CHECKS];

  // claw-nyxd: lint is scoped to the current project — both the read checks
  // (so findings never reference another project) and applyFixes (so a --fix
  // can never archive or rewrite another project's data).
  const findings: LintFinding[] = [];
  for (const check of checksToRun) {
    if (check === 'contradictions') {
      findings.push(
        ...(await findContradictions(pool, { limit, memoryId: input.memory_id, scope })),
      );
    } else if (check === 'stale') {
      findings.push(...(await findStale(pool, { sinceDays, limit, scope })));
    } else if (check === 'orphans') {
      findings.push(...(await findOrphans(pool, { limit, scope })));
    } else if (check === 'drift') {
      findings.push(...(await findDrift(pool, { limit, scope })));
    } else if (check === 'superseded_unflagged') {
      findings.push(...(await findSupersededUnflagged(pool, { limit, scope })));
    }
  }

  const summary = buildSummary(findings);
  const result: LintResult = { summary, findings };

  if (input.fix) {
    const fixesApplied = await applyFixes(pool, findings, scope);
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
  scope: string,
): Promise<NonNullable<LintResult['fixes_applied']>> {
  const applied: NonNullable<LintResult['fixes_applied']> = [];
  for (const f of findings) {
    if (f.confidence < FIX_CONFIDENCE_THRESHOLD) continue;
    if (f.check === 'stale' && f.suggested_action === 'archive') {
      const r = await pool.query(
        `UPDATE memories SET type = 'archived', updated_at = NOW()
         WHERE id = $1 AND type != 'archived' AND project_scope = $2`,
        [f.memory_id, scope],
      );
      if ((r.rowCount ?? 0) > 0) applied.push({ memory_id: f.memory_id, action: 'archive' });
    } else if (
      f.check === 'superseded_unflagged' &&
      f.suggested_action === 'fix_edge_type' &&
      f.related_memory_id
    ) {
      // Rewrite the edge only when BOTH endpoints are in the current scope.
      const r = await pool.query(
        `UPDATE memory_edges e
         SET relation = 'supersedes', updated_at = NOW()
         FROM memories mf, memories mt
         WHERE e.from_memory_id = $1 AND e.to_memory_id = $2
           AND e.relation = 'contradicts' AND e.valid_until IS NULL
           AND mf.id = e.from_memory_id AND mt.id = e.to_memory_id
           AND mf.project_scope = $3 AND mt.project_scope = $3`,
        [f.memory_id, f.related_memory_id, scope],
      );
      if ((r.rowCount ?? 0) > 0) applied.push({ memory_id: f.memory_id, action: 'fix_edge_type' });
    }
  }
  return applied;
}
