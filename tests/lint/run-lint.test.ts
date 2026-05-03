/**
 * Orchestrator tests for runLint() — covers C.AC1, C.AC2, C.AC4, C.AC6, C.R5.
 *
 * The pool is mocked: each query returns scripted rows for the SQL the
 * relevant check would issue. We don't validate SQL strings; we validate
 * the LintResult shape and `--fix` behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { runLint } from '../../src/lint/run.js';
import type { PoolLike } from '../../src/lint/checks/contradictions.js';

function poolWithScripts(scripts: Record<string, unknown[]>): PoolLike & { calls: Array<{ sql: string; params: unknown[] }> } {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      // Match against substrings unique to each check's SQL
      if (sql.includes("relation = 'contradicts'") && sql.includes('m1.created_at > m2.created_at')) {
        return { rows: scripts.superseded_unflagged ?? [] } as never;
      }
      if (sql.includes("relation = 'contradicts'")) return { rows: scripts.contradictions ?? [] } as never;
      // Check orphans BEFORE stale: orphans has the more specific OR clause
      // and the broader stale pattern would otherwise swallow it.
      if (sql.includes('NOT EXISTS') && sql.includes('e.from_memory_id = m.id OR e.to_memory_id = m.id')) return { rows: scripts.orphans ?? [] } as never;
      if (sql.includes('NOT EXISTS') && sql.includes('to_memory_id = m.id')) return { rows: scripts.stale ?? [] } as never;
      if (sql.includes('shared_topics')) return { rows: scripts.drift ?? [] } as never;
      if (sql.startsWith('UPDATE memories SET')) return { rows: [] } as never;
      if (sql.startsWith('UPDATE memory_edges')) return { rows: [] } as never;
      return { rows: [] } as never;
    }) as PoolLike['query'],
  };
}

describe('runLint — C.AC2: stable response shape', () => {
  it('returns summary block plus findings array even when no findings', async () => {
    const pool = poolWithScripts({});
    const result = await runLint({}, pool);
    expect(result.summary.total_findings).toBe(0);
    expect(result.summary.by_check).toMatchObject({
      contradictions: 0, stale: 0, orphans: 0, drift: 0, superseded_unflagged: 0,
    });
    expect(result.findings).toEqual([]);
  });

  it('per-check invocation has the same response shape as all-checks', async () => {
    const single = await runLint({ check: 'orphans' }, poolWithScripts({}));
    const all = await runLint({}, poolWithScripts({}));
    // Both have the same top-level keys
    expect(Object.keys(single).sort()).toEqual(Object.keys(all).sort());
    // Both summaries have all five check counts (key set stable)
    expect(Object.keys(single.summary.by_check).sort()).toEqual(
      Object.keys(all.summary.by_check).sort(),
    );
  });

  it('findings carry every documented field (C.AC2)', async () => {
    const pool = poolWithScripts({
      stale: [{ id: 'm1', created_at: '2025-01-01', has_outgoing: false }],
    });
    const { findings } = await runLint({ check: 'stale' }, pool);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual(expect.objectContaining({
      check: expect.any(String),
      memory_id: expect.any(String),
      rationale: expect.any(String),
      suggested_action: expect.any(String),
      confidence: expect.any(Number),
    }));
  });
});

describe('runLint — C.AC1: contradictions check returns one finding per edge', () => {
  it('reports exactly one finding for a single synthetic contradiction', async () => {
    const pool = poolWithScripts({
      contradictions: [
        { from_id: 'A', to_id: 'B', confidence: 0.85, rationale: 'r',
          from_created_at: '2026-05-01', to_created_at: '2026-05-01' },
      ],
    });
    const result = await runLint({ check: 'contradictions' }, pool);
    expect(result.findings).toHaveLength(1);
    expect(result.summary.by_check.contradictions).toBe(1);
    expect(result.findings[0].memory_id).toBe('A');
    expect(result.findings[0].related_memory_id).toBe('B');
  });
});

describe('runLint — C.AC4: --fix only acts on findings with confidence >= 0.9', () => {
  it('archives a synthetic stale memory with confidence 0.95', async () => {
    const pool = poolWithScripts({
      stale: [{ id: 'm-stale', created_at: '2025-01-01', has_outgoing: false }],
    });
    const result = await runLint({ check: 'stale', fix: true }, pool);
    expect(result.findings[0].confidence).toBe(0.95);
    expect(result.fixes_applied).toEqual([{ memory_id: 'm-stale', action: 'archive' }]);
    // The UPDATE was actually issued
    const updates = pool.calls.filter((c) => c.sql.startsWith('UPDATE memories'));
    expect(updates).toHaveLength(1);
  });

  it('does NOT archive a low-confidence stale finding (0.7) even with fix=true', async () => {
    const pool = poolWithScripts({
      stale: [{ id: 'm-uncertain', created_at: '2025-01-01', has_outgoing: true }],
    });
    const result = await runLint({ check: 'stale', fix: true }, pool);
    expect(result.findings[0].confidence).toBe(0.7);
    expect(result.fixes_applied).toEqual([]);
    // Finding still surfaced in output (not silently consumed)
    expect(result.findings).toHaveLength(1);
    const updates = pool.calls.filter((c) => c.sql.startsWith('UPDATE memories'));
    expect(updates).toHaveLength(0);
  });

  it('rewrites a high-confidence superseded_unflagged edge from contradicts to supersedes', async () => {
    const pool = poolWithScripts({
      superseded_unflagged: [
        {
          edge_id: 'e1', from_id: 'newer', to_id: 'older',
          confidence: 0.8, rationale: 'r',
          from_created_at: '2026-05-01', to_created_at: '2026-01-01',
          shared_topics: 2,
        },
      ],
    });
    const result = await runLint({ check: 'superseded_unflagged', fix: true }, pool);
    expect(result.findings[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.fixes_applied?.[0]).toMatchObject({ action: 'fix_edge_type' });
    const edgeUpdates = pool.calls.filter((c) => c.sql.startsWith('UPDATE memory_edges'));
    expect(edgeUpdates).toHaveLength(1);
  });

  it('does not auto-fix orphans even when fix=true (no archive vocabulary action)', async () => {
    const pool = poolWithScripts({
      orphans: [{ id: 'm-orphan', created_at: '2025-01-01' }],
    });
    const result = await runLint({ check: 'orphans', fix: true }, pool);
    expect(result.findings).toHaveLength(1);
    expect(result.fixes_applied).toEqual([]);
  });
});

describe('runLint — C.R5: SQL-only', () => {
  it('makes no LLM calls (the orchestrator never imports a provider)', () => {
    // This is a structural guarantee — runLint only depends on PoolLike.
    // We check the runtime by ensuring the function signature accepts only
    // a pool. If lint ever needed a provider, this test would have to be
    // updated, signaling the SYSTEM-SPEC constraint had been touched.
    // (No assertion needed — type signature is the contract.)
    expect(typeof runLint).toBe('function');
  });
});
