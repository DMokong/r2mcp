import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory, resetEdgesTestDb } from './setup.js';
import { recall } from '../../src/tools/recall.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });
beforeEach(async () => { await resetEdgesTestDb(pool); });

describe('recall() backward compatibility (AC9)', () => {
  it('no-edges run: signals elided when empty, wire fields present (claw-ohhj.3 shape)', async () => {
    for (let i = 0; i < 5; i++) {
      await insertTestMemory(pool, `test memory ${i}`, 'context', ['test']);
    }

    const response = await recall({ query: 'test', top_k: 5 });

    // claw-ohhj.3: empty signals are elided from the wire shape
    expect(response).not.toHaveProperty('signals');

    // Wire fields present with correct types (query echo + total_results
    // removed by claw-ohhj.3 — results.length carries the count)
    expect(['semantic', 'fulltext_only']).toContain(response.search_mode);
    expect(Array.isArray(response.tiers_searched)).toBe(true);
    expect(typeof response.tokens_used === 'number' || response.tokens_used === undefined).toBe(true);
    expect(typeof response.early_stopped === 'boolean' || response.early_stopped === undefined).toBe(true);
    expect(Array.isArray(response.results)).toBe(true);
  });

  it('edges-present: existing field shapes are unchanged (additive only)', async () => {
    const A = await insertTestMemory(pool, 'memory A', 'context', ['t']);
    const B = await insertTestMemory(pool, 'memory B', 'context', ['t']);
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'contradicts', 0.85, 'rationale', 'v1')`,
      [A, B],
    );

    const response = await recall({ query: 'memory', top_k: 5 });

    // Snapshot of expected key set on the response. Additive-only fields:
    // signals (SPEC-043), warnings (claw-8cjf.2 — present when embeddings degrade).
    const expectedKeys = new Set([
      'results', 'search_mode',
      'tiers_searched', 'tokens_used', 'early_stopped', 'signals', 'warnings',
    ]);
    for (const k of Object.keys(response)) {
      expect(expectedKeys.has(k), `unexpected key ${k} in response`).toBe(true);
    }

    // results entries have the same shape they always had
    for (const r of response.results) {
      expect(typeof r.id).toBe('string');
      expect(typeof r.tier).toBe('string');
      expect(typeof r.content).toBe('string');
      expect(typeof r.score).toBe('number');
      expect(['semantic', 'fulltext', 'hybrid']).toContain(r.match_type);
      expect(typeof r.metadata).toBe('object');
    }
  });
});
