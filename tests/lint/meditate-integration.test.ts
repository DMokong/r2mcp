/**
 * C.AC5 — meditate backward compatibility plus opt-in lint integration.
 *
 * Two contracts:
 *   1. `meditate({mode, dry_run})` (no include_lint flag) returns a response
 *      with the original keys ONLY. No `lint_findings` field at all (not
 *      even an empty array — the property is absent).
 *   2. `meditate({mode, dry_run, include_lint: true})` returns a response
 *      with `lint_findings` populated from the lint check.
 *
 * Backward compat is verified by ensuring the response shape under default
 * input matches the pre-spec keyset exactly.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as dbMod from '../../src/db.js';
import * as graphMod from '../../src/graph-rebuild.js';
import { meditate, type MeditateInput } from '../../src/tools/meditate.js';

afterEach(() => { vi.restoreAllMocks(); });

const PRE_SPEC_KEYS = [
  'archived',
  'deduplicated',
  'cross_referenced',
  'clustered',
  'gaps_found',
  'total_changes',
] as const;

function mockPool(scripts: { stale?: unknown[]; [k: string]: unknown }) {
  return {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      // count queries — return small ints
      if (sql.includes('SELECT COUNT(') || sql.includes('SUM(')) {
        return { rows: [{ count: 0, duplicates: 0, pair_count: 0, cluster_count: 1, gap_count: 0 }] };
      }
      if (sql.includes('UPDATE memories')) return { rows: [] };
      // lint check rows by SQL fingerprint
      if (sql.includes("relation = 'contradicts'") && sql.includes('m1.created_at > m2.created_at')) {
        return { rows: scripts.superseded_unflagged ?? [] };
      }
      if (sql.includes("relation = 'contradicts'")) return { rows: scripts.contradictions ?? [] };
      if (sql.includes('NOT EXISTS') && sql.includes('e.from_memory_id = m.id OR e.to_memory_id = m.id')) return { rows: scripts.orphans ?? [] };
      if (sql.includes('NOT EXISTS') && sql.includes('to_memory_id = m.id')) return { rows: scripts.stale ?? [] };
      if (sql.includes('shared_topics')) return { rows: scripts.drift ?? [] };
      return { rows: [] };
    }),
  };
}

describe('meditate backward compatibility (C.AC5)', () => {
  it('default invocation returns the pre-spec keyset only — no lint_findings', async () => {
    const pool = mockPool({}) as unknown as ReturnType<typeof dbMod.getPool>;
    vi.spyOn(dbMod, 'getPool').mockReturnValue(pool);
    vi.spyOn(graphMod, 'triggerGraphRebuild').mockReturnValue(undefined);

    const input: MeditateInput = { mode: 'full', dry_run: true };
    const result = await meditate(input);
    const keys = Object.keys(result).sort();
    expect(keys).toEqual([...PRE_SPEC_KEYS].sort());
    expect(result).not.toHaveProperty('lint_findings');
  });

  it('invocation with include_lint:true adds lint_findings populated from lint', async () => {
    const pool = mockPool({
      stale: [{ id: 'm-stale', created_at: '2025-01-01', has_outgoing: false }],
    }) as unknown as ReturnType<typeof dbMod.getPool>;
    vi.spyOn(dbMod, 'getPool').mockReturnValue(pool);
    vi.spyOn(graphMod, 'triggerGraphRebuild').mockReturnValue(undefined);

    const result = await meditate({ mode: 'full', dry_run: true, include_lint: true });
    expect(result.lint_findings).toBeDefined();
    expect(result.lint_findings!.length).toBeGreaterThan(0);
    expect(result.lint_findings![0]).toMatchObject({
      check: 'stale', memory_id: 'm-stale',
    });
    // Pre-spec keys are still all present
    for (const k of PRE_SPEC_KEYS) {
      expect(result).toHaveProperty(k);
    }
  });

  it('include_lint:false explicitly preserves the default (no lint_findings)', async () => {
    const pool = mockPool({}) as unknown as ReturnType<typeof dbMod.getPool>;
    vi.spyOn(dbMod, 'getPool').mockReturnValue(pool);
    vi.spyOn(graphMod, 'triggerGraphRebuild').mockReturnValue(undefined);

    const result = await meditate({ mode: 'full', dry_run: true, include_lint: false });
    expect(result).not.toHaveProperty('lint_findings');
  });
});
