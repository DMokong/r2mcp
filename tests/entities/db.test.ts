// SPEC-046 Task 4 — entities DB layer tests.
//
// Note on test-DB safety (claw-0vsn): we use setupTestDb()/teardownTestDb()
// from tests/setup.ts. That setup calls pickTestUrl() from test-db-guard.ts,
// which refuses to run if R2MCP_DATABASE_URL points at a non-local / non-test
// database. We never read R2MCP_DATABASE_URL directly in this file.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { setupTestDb, teardownTestDb } from '../setup.js';
import {
  upsertEntity,
  findEntityByInput,
  linkMemoryToEntity,
  mergeAliases,
  getTopEntitiesByFrequency,
  findCandidateMemories,
  getEntityLinksForMemories,
} from '../../src/entities/db.js';

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

describe('SPEC-046 entities DB layer', () => {
  it('upsertEntity inserts new and returns id; second call with same (type, normalized_name) is no-op returning same id', async () => {
    const e1 = await upsertEntity(pool, {
      type: 'project',
      canonical_name: 'Speculator',
      aliases: ['spec'],
    });
    const e2 = await upsertEntity(pool, {
      type: 'project',
      canonical_name: 'Speculator',
      aliases: ['spec'],
    });
    expect(e1.id).toBe(e2.id);
    expect(e1.created).toBe(true);
    expect(e2.created).toBe(false);
  });

  it('findEntityByInput resolves canonical name AND alias case-insensitively (AC3)', async () => {
    await upsertEntity(pool, {
      type: 'project',
      canonical_name: 'Speculator',
      aliases: ['spec', 'speculator-v2'],
    });
    const byCanonical = await findEntityByInput(pool, 'Speculator');
    expect(byCanonical?.canonical_name).toBe('Speculator');
    const byAlias = await findEntityByInput(pool, 'spec');
    expect(byAlias?.canonical_name).toBe('Speculator');
    const upper = await findEntityByInput(pool, 'SPEC');
    expect(upper?.canonical_name).toBe('Speculator');
    const miss = await findEntityByInput(pool, 'NonexistentThing');
    expect(miss).toBeNull();
  });

  it('mergeAliases appends new aliases without duplicating existing (AC6)', async () => {
    const e = await upsertEntity(pool, {
      type: 'project',
      canonical_name: 'Speculator',
      aliases: ['spec'],
    });
    const merged = await mergeAliases(pool, e.id, ['spec', 'speculator-v2']);
    expect(merged.sort()).toEqual(['spec', 'speculator-v2']);
  });

  it('linkMemoryToEntity is idempotent (PK prevents duplicates)', async () => {
    const {
      rows: [m],
    } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint) VALUES ('x', 'preferences', 'preference', 'fp-link-1') RETURNING id`,
    );
    const e = await upsertEntity(pool, { type: 'project', canonical_name: 'A' });
    const first = await linkMemoryToEntity(pool, m.id, e.id, 0.9, 'classifier');
    const second = await linkMemoryToEntity(pool, m.id, e.id, 0.7, 'classifier');
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
  });

  it('getTopEntitiesByFrequency orders by link count desc, respects N', async () => {
    const a = await upsertEntity(pool, { type: 'project', canonical_name: 'A' });
    const b = await upsertEntity(pool, { type: 'project', canonical_name: 'B' });
    // A gets 2 links, B gets 1
    for (let i = 0; i < 2; i++) {
      const {
        rows: [m],
      } = await pool.query(
        `INSERT INTO memories (content, tier, type, fingerprint) VALUES ($1, 'preferences', 'preference', $2) RETURNING id`,
        [`m${i}`, `fp-topN-${i}`],
      );
      await linkMemoryToEntity(pool, m.id, a.id, 1.0, 'classifier');
    }
    const {
      rows: [m3],
    } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint) VALUES ('m3', 'preferences', 'preference', 'fp-topN-3') RETURNING id`,
    );
    await linkMemoryToEntity(pool, m3.id, b.id, 1.0, 'classifier');

    const top = await getTopEntitiesByFrequency(pool, 100);
    expect(top[0].canonical_name).toBe('A');
    expect(top[1].canonical_name).toBe('B');
    const justOne = await getTopEntitiesByFrequency(pool, 1);
    expect(justOne).toHaveLength(1);
  });

  it('findCandidateMemories returns only memories without entity rows OR updated since (AC8)', async () => {
    const e = await upsertEntity(pool, { type: 'project', canonical_name: 'A' });
    const {
      rows: [m1],
    } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint) VALUES ('m1', 'preferences', 'preference', 'fp-cand-1') RETURNING id`,
    );
    const {
      rows: [m2],
    } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint) VALUES ('m2', 'preferences', 'preference', 'fp-cand-2') RETURNING id`,
    );
    // Link m1, leave m2 unlinked
    await linkMemoryToEntity(pool, m1.id, e.id, 1.0, 'classifier');
    const candidates = await findCandidateMemories(pool, {});
    expect(candidates.map((c) => c.id)).toContain(m2.id);
    expect(candidates.map((c) => c.id)).not.toContain(m1.id);
    // Update m1 → it should become a candidate again
    await pool.query(
      `UPDATE memories SET updated_at = NOW() + INTERVAL '1 minute' WHERE id = $1`,
      [m1.id],
    );
    const after = await findCandidateMemories(pool, {});
    expect(after.map((c) => c.id)).toContain(m1.id);
  });

  it('findCandidateMemories with sinceDays narrows window further', async () => {
    const {
      rows: [m],
    } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint, updated_at) VALUES ('old', 'preferences', 'preference', 'fp-old', NOW() - INTERVAL '10 days') RETURNING id`,
    );
    const withSince = await findCandidateMemories(pool, { sinceDays: 7 });
    expect(withSince.map((c) => c.id)).not.toContain(m.id);
    const withoutSince = await findCandidateMemories(pool, {});
    expect(withoutSince.map((c) => c.id)).toContain(m.id);
  });

  it('getEntityLinksForMemories returns full link set per memory (for AC3 entity_links)', async () => {
    const {
      rows: [m],
    } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint) VALUES ('x', 'preferences', 'preference', 'fp-elinks-1') RETURNING id`,
    );
    const a = await upsertEntity(pool, { type: 'project', canonical_name: 'A' });
    const b = await upsertEntity(pool, { type: 'tool', canonical_name: 'B' });
    await linkMemoryToEntity(pool, m.id, a.id, 0.9, 'classifier');
    await linkMemoryToEntity(pool, m.id, b.id, 0.7, 'classifier');
    const links = await getEntityLinksForMemories(pool, [m.id]);
    expect(links.get(m.id)).toHaveLength(2);
  });
});
