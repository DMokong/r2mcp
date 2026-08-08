/**
 * claw-tsgd: stats() aggregated across ALL project scopes — seven bare
 * `FROM memories` queries with no scope predicate. Against production it
 * reported total=426 when the server's own scope held 238, and top_topics was
 * dominated by another scope's corpus. That made stats() actively misleading
 * for the scope it was being run in.
 *
 * Kept separate from stats.test.ts deliberately: that file has a module-level
 * `beforeEach` that wipes `memories`, which would delete this suite's seeded
 * rows before every test.
 *
 * Assertions are differential rather than absolute: every scoped read also
 * includes 'global' (mirroring recall()), and the shared test DB carries
 * residue, so the invariant we can trust is the DELTA between two scoped
 * reads — not either one's raw total.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { stats } from '../../src/tools/stats.js';
import { pickTestUrl } from '../test-db-guard.js';

const TEST_DB = pickTestUrl();

describe.skipIf(!TEST_DB)('stats scope confinement (claw-tsgd)', () => {
  let client: pg.Client;

  // 1 row in scope-a, 2 in scope-b — the asymmetry is what the delta asserts on.
  const SEED: Array<[string, string]> = [
    ['fp-stats-a1', 'stats-scope-a'],
    ['fp-stats-b1', 'stats-scope-b'],
    ['fp-stats-b2', 'stats-scope-b'],
  ];

  beforeAll(async () => {
    client = new pg.Client({ connectionString: TEST_DB });
    await client.connect();
    for (const [fp, scope] of SEED) {
      await client.query(
        `INSERT INTO memories (content, tier, type, section, fingerprint, project_scope, topics)
         VALUES ('stats scope test', 'preferences', 'observation', 'stats-scope-test', $1, $2, ARRAY['stats-scope-topic'])
         ON CONFLICT (project_scope, fingerprint) DO UPDATE SET content = EXCLUDED.content`,
        [fp, scope],
      );
    }
  });

  afterAll(async () => {
    await client.query(`DELETE FROM memories WHERE section = 'stats-scope-test'`);
    await client.end();
  });

  it('confines totals to the requested scope + global', async () => {
    const a = await stats({ scope: 'stats-scope-a' });
    const b = await stats({ scope: 'stats-scope-b' });
    // Both include the same 'global' rows, so the difference is exactly the
    // seeded asymmetry: scope-b has one more row than scope-a.
    expect(b.total - a.total).toBe(1);
  });

  it('all_scopes sees every scope (pre-fix behavior, now opt-in)', async () => {
    const a = await stats({ scope: 'stats-scope-a' });
    const all = await stats({ all_scopes: true });
    // all_scopes additionally counts scope-b's two rows.
    expect(all.total).toBeGreaterThanOrEqual(a.total + 2);
  });

  it('by_type is scoped, not global', async () => {
    const a = await stats({ scope: 'stats-scope-a' });
    const b = await stats({ scope: 'stats-scope-b' });
    expect(b.by_type.observation - a.by_type.observation).toBe(1);
  });

  it('top_topics is scoped, not global', async () => {
    const a = await stats({ scope: 'stats-scope-a' });
    const b = await stats({ scope: 'stats-scope-b' });
    const count = (s: Awaited<ReturnType<typeof stats>>) =>
      s.top_topics.find((t) => t.topic === 'stats-scope-topic')?.count ?? 0;
    expect(count(a)).toBe(1);
    expect(count(b)).toBe(2);
  });
});
