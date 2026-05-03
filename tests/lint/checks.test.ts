/**
 * Per-check unit tests for the five lint queries (C.AC1, C.AC6).
 *
 * The pool is a vi.fn-mocked PoolLike that returns scripted rows. Tests
 * assert on the structured `LintFinding` shape each check produces — not
 * on the SQL string. The SQL itself is exercised end-to-end against a real
 * DB in a separate live test.
 */

import { describe, it, expect, vi } from 'vitest';
import { findContradictions, type PoolLike } from '../../src/lint/checks/contradictions.js';
import { findStale } from '../../src/lint/checks/stale.js';
import { findOrphans } from '../../src/lint/checks/orphans.js';
import { findDrift } from '../../src/lint/checks/drift.js';
import { findSupersededUnflagged } from '../../src/lint/checks/superseded-unflagged.js';

function mockPool(rows: unknown[]): PoolLike {
  return {
    query: vi.fn(async () => ({ rows: rows as never })),
  };
}

describe('contradictions check (C.AC1, C.AC6)', () => {
  it('returns one finding per contradicts edge', async () => {
    const pool = mockPool([
      {
        from_id: 'A', to_id: 'B', confidence: 0.8, rationale: 'A says X, B says not-X',
        from_created_at: '2026-05-01', to_created_at: '2026-04-01',
      },
    ]);
    const findings = await findContradictions(pool, { limit: 100 });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      check: 'contradictions',
      memory_id: 'A',
      related_memory_id: 'B',
      confidence: 0.8,
    });
  });

  it('routes to add_supersedes_edge when from is newer with high confidence', async () => {
    const pool = mockPool([
      {
        from_id: 'newer', to_id: 'older', confidence: 0.85, rationale: 'r',
        from_created_at: '2026-05-03', to_created_at: '2026-04-01',
      },
    ]);
    const [f] = await findContradictions(pool, { limit: 100 });
    expect(f.suggested_action).toBe('add_supersedes_edge');
  });

  it('routes to archive_one for high-confidence factual contradictions same-age', async () => {
    const pool = mockPool([
      {
        from_id: 'A', to_id: 'B', confidence: 0.9, rationale: 'r',
        from_created_at: '2026-05-01', to_created_at: '2026-05-01',
      },
    ]);
    const [f] = await findContradictions(pool, { limit: 100 });
    expect(f.suggested_action).toBe('archive_one');
  });

  it('routes to human_review for low-confidence contradictions', async () => {
    const pool = mockPool([
      {
        from_id: 'A', to_id: 'B', confidence: 0.5, rationale: 'r',
        from_created_at: '2026-05-01', to_created_at: '2026-05-01',
      },
    ]);
    const [f] = await findContradictions(pool, { limit: 100 });
    expect(f.suggested_action).toBe('human_review');
  });

  it('only emits suggested_action values from the documented vocabulary (C.AC6)', async () => {
    const VALID = new Set(['archive_one', 'add_supersedes_edge', 'human_review']);
    const pool = mockPool([
      { from_id: 'A', to_id: 'B', confidence: 0.95, rationale: 'r', from_created_at: '2026-05-03', to_created_at: '2026-05-01' },
      { from_id: 'C', to_id: 'D', confidence: 0.6,  rationale: 'r', from_created_at: '2026-05-01', to_created_at: '2026-05-01' },
      { from_id: 'E', to_id: 'F', confidence: 0.92, rationale: 'r', from_created_at: '2026-05-01', to_created_at: '2026-05-01' },
    ]);
    const findings = await findContradictions(pool, { limit: 100 });
    for (const f of findings) {
      expect(VALID.has(f.suggested_action)).toBe(true);
    }
  });
});

describe('stale check', () => {
  it('emits high confidence (0.95) for fully isolated stale memories', async () => {
    const pool = mockPool([
      { id: 'm-stale', created_at: '2025-01-01', has_outgoing: false },
    ]);
    const findings = await findStale(pool, { sinceDays: 90, limit: 100 });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      check: 'stale',
      memory_id: 'm-stale',
      suggested_action: 'archive',
      confidence: 0.95,
    });
  });

  it('lowers confidence (0.7) when stale memory has outgoing edges', async () => {
    const pool = mockPool([
      { id: 'm-stale', created_at: '2025-01-01', has_outgoing: true },
    ]);
    const [f] = await findStale(pool, { sinceDays: 90, limit: 100 });
    expect(f.confidence).toBe(0.7);
  });
});

describe('orphans check', () => {
  it('emits a moderate-confidence finding (0.6) for orphans, suggesting human_review', async () => {
    const pool = mockPool([
      { id: 'm-orphan', created_at: '2025-12-01' },
    ]);
    const [f] = await findOrphans(pool, { limit: 100 });
    expect(f.check).toBe('orphans');
    expect(f.confidence).toBe(0.6);
    expect(f.suggested_action).toBe('human_review');
  });
});

describe('drift check', () => {
  it('emits a reclassify finding for pairs with no edge but shared topics', async () => {
    const pool = mockPool([
      { newer_id: 'm-new', older_id: 'm-old', shared_topics: 3 },
    ]);
    const [f] = await findDrift(pool, { limit: 100 });
    expect(f.check).toBe('drift');
    expect(f.suggested_action).toBe('reclassify');
    expect(f.memory_id).toBe('m-new');
    expect(f.related_memory_id).toBe('m-old');
    // Confidence is below the 0.9 fix threshold
    expect(f.confidence).toBeLessThan(0.9);
  });
});

describe('superseded_unflagged check', () => {
  it('emits fix_edge_type for newer-older contradicts pairs', async () => {
    const pool = mockPool([
      {
        edge_id: 'e1', from_id: 'newer', to_id: 'older',
        confidence: 0.8, rationale: 'r',
        from_created_at: '2026-05-01', to_created_at: '2026-01-01',
        shared_topics: 2,
      },
    ]);
    const [f] = await findSupersededUnflagged(pool, { limit: 100 });
    expect(f.check).toBe('superseded_unflagged');
    expect(f.suggested_action).toBe('fix_edge_type');
    expect(f.memory_id).toBe('newer');
    expect(f.related_memory_id).toBe('older');
  });

  it('bumps confidence to ≥0.9 when topic overlap and time gap are both significant', async () => {
    const pool = mockPool([
      {
        edge_id: 'e1', from_id: 'newer', to_id: 'older',
        confidence: 0.8, rationale: 'r',
        from_created_at: '2026-05-01', to_created_at: '2026-01-01', // 120 days apart
        shared_topics: 2,
      },
    ]);
    const [f] = await findSupersededUnflagged(pool, { limit: 100 });
    expect(f.confidence).toBeGreaterThanOrEqual(0.9);
  });
});
