import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory, resetEdgesTestDb } from './setup.js';
import { findCandidatePairs } from '../../src/edges/candidate-pairs.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });
beforeEach(async () => { await resetEdgesTestDb(pool); });

async function setPeople(pool: pg.Pool, id: string, people: string[]) {
  await pool.query('UPDATE memories SET people = $2 WHERE id = $1', [id, people]);
}

describe('candidate-pair pre-filter (R5)', () => {
  it('pairs sharing >=2 topics qualify', async () => {
    const a = await insertTestMemory(pool, 'a', 'context', ['t1', 't2']);
    const b = await insertTestMemory(pool, 'b', 'context', ['t1', 't2']);
    const pairs = await findCandidatePairs(pool, {});
    expect(pairs.some(p => (p.from_id === a && p.to_id === b) || (p.from_id === b && p.to_id === a))).toBe(true);
  });

  it('pairs sharing only 1 topic do NOT qualify', async () => {
    const a = await insertTestMemory(pool, 'a', 'context', ['t1', 't2']);
    const b = await insertTestMemory(pool, 'b', 'context', ['t1']);
    const pairs = await findCandidatePairs(pool, {});
    expect(pairs.some(p => (p.from_id === a && p.to_id === b) || (p.from_id === b && p.to_id === a))).toBe(false);
  });

  it('pairs sharing >=1 person qualify', async () => {
    const a = await insertTestMemory(pool, 'a', 'context', []);
    const b = await insertTestMemory(pool, 'b', 'context', []);
    await setPeople(pool, a, ['Dustin']);
    await setPeople(pool, b, ['Dustin']);
    const pairs = await findCandidatePairs(pool, {});
    expect(pairs.length).toBe(1);
  });

  it('does not return self-pairs', async () => {
    const a = await insertTestMemory(pool, 'a', 'context', ['t1', 't2']);
    const pairs = await findCandidatePairs(pool, {});
    expect(pairs.some(p => p.from_id === a && p.to_id === a)).toBe(false);
  });

  it('does not return both directions of the same pair', async () => {
    const a = await insertTestMemory(pool, 'a', 'context', ['t1', 't2']);
    const b = await insertTestMemory(pool, 'b', 'context', ['t1', 't2']);
    const pairs = await findCandidatePairs(pool, {});
    const matching = pairs.filter(
      p => (p.from_id === a && p.to_id === b) || (p.from_id === b && p.to_id === a),
    );
    expect(matching.length).toBe(1);
  });

  it('--since filter excludes pairs where both memories are older than the cutoff', async () => {
    const a = await insertTestMemory(pool, 'a', 'context', ['t1', 't2']);
    const b = await insertTestMemory(pool, 'b', 'context', ['t1', 't2']);
    // Backdate both
    await pool.query(`UPDATE memories SET created_at = NOW() - INTERVAL '30 days' WHERE id IN ($1, $2)`, [a, b]);
    const pairs = await findCandidatePairs(pool, { sinceDays: 7 });
    expect(pairs.length).toBe(0);
  });
});
