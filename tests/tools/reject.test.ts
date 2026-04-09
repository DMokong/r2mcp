import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { remember } from '../../src/tools/remember.js';
import { reject } from '../../src/tools/reject.js';
import { search } from '../../src/tools/search.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });
beforeEach(async () => { await pool.query('DELETE FROM memories'); });

describe('reject() tool', () => {
  it('marks a memory as rejected and stores the reason', async () => {
    const stored = await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Always add verbose error handling',
      metadata: { type: 'preference', topics: ['code-style'] },
    });

    const result = await reject({
      id: stored.id!,
      reason: 'Over-engineered — keep error handling minimal for internal functions',
    });

    expect(result.rejected_id).toBe(stored.id);
    expect(result.reason_id).toBeDefined();

    // Verify original memory type changed to 'rejection'
    const original = await pool.query('SELECT type FROM memories WHERE id = $1', [stored.id]);
    expect(original.rows[0].type).toBe('rejection');

    // Verify reason entry exists
    const reason = await pool.query('SELECT * FROM memories WHERE id = $1', [result.reason_id]);
    expect(reason.rows[0].type).toBe('rejection');
    expect(reason.rows[0].content).toBe('Over-engineered — keep error handling minimal for internal functions');
    expect(reason.rows[0].section).toBe(`rejection-of:${stored.id}`);
  });

  it('rejected memories are excluded from search results', async () => {
    const stored = await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Always add verbose error handling for code',
      metadata: { type: 'preference', topics: ['code-style'] },
    });

    // Should appear before rejection
    const beforeReject = await search({
      filter: { topics: ['code-style'] },
    });
    expect(beforeReject.count).toBe(1);

    await reject({
      id: stored.id!,
      reason: 'Too verbose',
    });

    // Should not appear after rejection (both the rejected entry and the rejection reason
    // have type 'rejected' or 'rejection' which are excluded)
    const afterReject = await search({
      filter: { topics: ['code-style'] },
    });
    expect(afterReject.count).toBe(0);
  });
});
