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

  it('AC3: entity-only recall works without query (no query field at all)', async () => {
    // MCP schema now allows recall({entity}) with omitted query (Task 10 follow-up).
    // Exercises the same internal code path as the MCP tool wrapper.
    const { ids, specId } = await seed3MemoriesWithSpeculator();
    const res = await recall({ entity: 'Speculator' });
    expect(res.entity_resolved).toBe(true);
    expect(res.entity_id).toBe(specId);
    expect(res.results.map((r) => r.id).sort()).toEqual([ids[0], ids[2]].sort());
    expect(res.query).toBe('');
  });

  it('AC3: entity filter composes with a fulltext query — intersection narrows pool, then ranking applies', async () => {
    // Spec R3/AC3: "When called with recall({entity: 'Speculator', query: '...'}),
    // the result set is the intersection." Three memories share the keyword
    // 'pgvector'; only two are linked to Speculator. recall({entity, query})
    // must return ONLY the entity-linked subset, not all three keyword hits.
    const { rows: m1Row } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint)
       VALUES ('Speculator uses pgvector for memory search', 'preferences', 'preference', 'fp-int-1') RETURNING id`,
    );
    const { rows: m2Row } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint)
       VALUES ('Speculator architecture and pgvector indexing notes', 'preferences', 'preference', 'fp-int-2') RETURNING id`,
    );
    const { rows: m3Row } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint)
       VALUES ('OB1 also uses pgvector but is not the Speculator project', 'preferences', 'preference', 'fp-int-3') RETURNING id`,
    );
    const m1 = m1Row[0].id, m2 = m2Row[0].id, m3 = m3Row[0].id;

    const spec = await upsertEntity(pool, {
      type: 'project',
      canonical_name: 'Speculator',
      aliases: [],
    });
    // Link only m1 and m2 to Speculator; m3 stays unlinked even though its
    // content matches the query.
    await linkMemoryToEntity(pool, m1, spec.id, 0.95, 'classifier');
    await linkMemoryToEntity(pool, m2, spec.id, 0.95, 'classifier');

    // Fulltext-only path: no embeddings on these test rows, so recall falls
    // through to fulltextSearchTier which honors the entityFilter clause.
    const res = await recall({ query: 'pgvector', entity: 'Speculator' });

    // Intersection narrowing: results contain m1+m2 only — m3 is excluded
    // despite being a strong query match.
    expect(res.entity_resolved).toBe(true);
    expect(res.entity_id).toBe(spec.id);
    const resultIds = res.results.map((r) => r.id);
    expect(resultIds).toContain(m1);
    expect(resultIds).toContain(m2);
    expect(resultIds).not.toContain(m3);
    expect(res.total_results).toBe(2);

    // entity_links surface still attached to every result.
    for (const r of res.results) {
      expect(r.entity_links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ canonical_name: 'Speculator' }),
        ]),
      );
    }
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
