// SPEC-046 Task 10 — recall() entity filter tests.
//
// Validates the new optional `entity` parameter on recall() against AC3, AC3b,
// and AC4 from the spec. Uses the same setupTestDb()/teardownTestDb() pattern
// as tests/entities/db.test.ts (claw-0vsn safety guard).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { recall } from '../../src/tools/recall.js';
import { upsertEntity, linkMemoryToEntity } from '../../src/entities/db.js';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await pool.query('DELETE FROM memory_entities');
  await pool.query('DELETE FROM entities');
  await pool.query('DELETE FROM memories');
});

async function seed3MemoriesWithSpeculator() {
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const { rows } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint)
       VALUES ($1, 'preferences', 'preference', $2)
       RETURNING id`,
      [`memory ${i}`, `fp-recall-${i}`],
    );
    ids.push(rows[0].id);
  }
  const spec = await upsertEntity(pool, {
    type: 'project',
    canonical_name: 'Speculator',
    aliases: ['spec', 'speculator-v2'],
  });
  // Link M1 (ids[0]) and M3 (ids[2]) to Speculator; M2 (ids[1]) stays unlinked.
  await linkMemoryToEntity(pool, ids[0], spec.id, 0.95, 'classifier');
  await linkMemoryToEntity(pool, ids[2], spec.id, 0.95, 'classifier');
  return { ids, specId: spec.id };
}

describe('SPEC-046 recall(entity) — Task 10', () => {
  it('AC3: filters by canonical_name and returns only linked memories with entity_links', async () => {
    const { ids, specId } = await seed3MemoriesWithSpeculator();
    const res = await recall({ query: '', entity: 'Speculator' });
    expect(res.entity_resolved).toBe(true);
    expect(res.entity_id).toBe(specId);
    expect(res.results.map((r) => r.id).sort()).toEqual([ids[0], ids[2]].sort());
    for (const r of res.results) {
      expect(r.entity_links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ canonical_name: 'Speculator', type: 'project' }),
        ]),
      );
    }
  });

  it('AC3: same set via alias', async () => {
    const { ids, specId } = await seed3MemoriesWithSpeculator();
    const res = await recall({ query: '', entity: 'spec' });
    expect(res.entity_resolved).toBe(true);
    expect(res.entity_id).toBe(specId);
    expect(res.results.map((r) => r.id).sort()).toEqual([ids[0], ids[2]].sort());
  });

  it('AC3b: nonexistent entity returns empty with entity_resolved=false', async () => {
    const res = await recall({ query: '', entity: 'NonexistentThing' });
    expect(res.entity_resolved).toBe(false);
    expect(res.entity_id).toBeUndefined();
    expect(res.results).toEqual([]);
    expect(res.total_results).toBe(0);
  });

  it('AC3b: entity with zero linked memories returns empty with entity_resolved=true', async () => {
    const empty = await upsertEntity(pool, {
      type: 'project',
      canonical_name: 'EmptyProject',
    });
    const res = await recall({ query: '', entity: 'EmptyProject' });
    expect(res.entity_resolved).toBe(true);
    expect(res.entity_id).toBe(empty.id);
    expect(res.total_results).toBe(0);
  });

  it('AC4: recall() with no entity param has response shape identical to SPEC-037 (no entity fields)', async () => {
    await seed3MemoriesWithSpeculator();
    const res = await recall({ query: 'memory' });
    expect('entity_resolved' in res).toBe(false);
    expect('entity_id' in res).toBe(false);
    for (const r of res.results) {
      expect('entity_links' in r).toBe(false);
    }
  });
});
