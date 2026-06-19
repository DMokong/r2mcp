import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './setup.js';
import { remember } from '../src/tools/remember.js';
import { recall } from '../src/tools/recall.js';
import { search } from '../src/tools/search.js';
import { reject } from '../src/tools/reject.js';
import { meditate } from '../src/tools/meditate.js';
import type pg from 'pg';

// claw-nyxd: the load-bearing proof that project scopes are isolated. Uses the
// real DB. Reads (recall/search) resolve scope from R2MCP_SCOPE, so withScope()
// sets+restores it around each assertion; an afterEach scrubs it so no scope
// bleeds across tests.

let pool: pg.Pool;
let savedScope: string | undefined;

beforeAll(async () => {
  pool = await setupTestDb();
});
afterAll(async () => {
  await teardownTestDb();
});
beforeEach(async () => {
  savedScope = process.env.R2MCP_SCOPE;
  await pool.query('DELETE FROM memory_edges');
  await pool.query('DELETE FROM memories');
});
afterEach(() => {
  if (savedScope === undefined) delete process.env.R2MCP_SCOPE;
  else process.env.R2MCP_SCOPE = savedScope;
});

function withScope<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  process.env.R2MCP_SCOPE = scope;
  return fn();
}

async function addIn(scope: string, content: string, type = 'preference') {
  return remember(
    { operation: 'ADD', tier: 'preferences', content, metadata: { type: type as never } },
    undefined,
    scope,
  );
}

describe('scope isolation (claw-nyxd) — five guarantees', () => {
  it('G1: a project cannot see another project\'s memories by default', async () => {
    await addIn('projectA', 'alpha-only secret about widgets');
    await addIn('projectB', 'beta-only secret about gadgets');

    const fromA = await withScope('projectA', () => recall({ query: 'secret' }));
    const fromB = await withScope('projectB', () => recall({ query: 'secret' }));

    expect(fromA.results.map((r) => r.content)).toEqual(['alpha-only secret about widgets']);
    expect(fromB.results.map((r) => r.content)).toEqual(['beta-only secret about gadgets']);
  });

  it("G2: 'global' memories are visible from every scope", async () => {
    // Both contain the single token 'widget' (plainto_tsquery ANDs terms, so a
    // multi-word query would require co-occurrence — use one shared keyword).
    await addIn('global', 'shared widget knowledge for everyone');
    await addIn('projectA', 'alpha private widget note');

    const fromA = await withScope('projectA', () => recall({ query: 'widget' }));
    const fromB = await withScope('projectB', () => recall({ query: 'widget' }));

    expect(fromA.results.map((r) => r.content).sort()).toEqual(
      ['alpha private widget note', 'shared widget knowledge for everyone'].sort(),
    );
    // projectB sees only the global one, not A's private note.
    expect(fromB.results.map((r) => r.content)).toEqual(['shared widget knowledge for everyone']);
  });

  it('G3: all_scopes:true bypasses the scope filter for reads', async () => {
    await addIn('projectA', 'alpha widgets');
    await addIn('projectB', 'beta widgets');

    const scoped = await withScope('projectA', () => recall({ query: 'widgets' }));
    const all = await withScope('projectA', () => recall({ query: 'widgets', all_scopes: true }));
    expect(scoped.results).toHaveLength(1);
    expect(all.results).toHaveLength(2);

    // search() honors all_scopes too.
    const sScoped = await withScope('projectA', () => search({ query: 'widgets' }));
    const sAll = await withScope('projectA', () => search({ query: 'widgets', all_scopes: true }));
    expect(sScoped.count).toBe(1);
    expect(sAll.count).toBe(2);
  });

  it('P0a: recall({scope}) reads a SPECIFIC other scope (+ global) without changing the env scope', async () => {
    await addIn('projectA', 'alpha gadget');
    await addIn('ai-landscape', 'landscape gadget extract');
    await addIn('global', 'shared gadget');

    // Operating in projectA, explicitly read the ai-landscape scope. Should see
    // ai-landscape + global, NOT projectA — proves one process can read another
    // scope's wiki corpus without restart (the LLM-Wiki producer/reader split).
    const r = await withScope('projectA', () => recall({ query: 'gadget', scope: 'ai-landscape' }));
    expect(r.results.map((x) => x.content).sort()).toEqual(
      ['landscape gadget extract', 'shared gadget'].sort(),
    );
    expect(r.results.map((x) => x.content)).not.toContain('alpha gadget');
  });

  it('G4: dedup is per-scope — identical content in two scopes makes two rows', async () => {
    const content = 'the exact same insight verbatim';
    const a = await addIn('projectA', content);
    const b = await addIn('projectB', content);
    expect(a.dedup).toBe(false);
    expect(b.dedup).toBe(false); // NOT deduped against A's copy
    expect(a.id).not.toBe(b.id);

    // ...but the SAME scope still dedups.
    const aAgain = await addIn('projectA', content);
    expect(aAgain.dedup).toBe(true);
    expect(aAgain.id).toBe(a.id);

    const total = await pool.query("SELECT COUNT(*)::int AS n FROM memories WHERE content = $1", [
      content,
    ]);
    expect(total.rows[0].n).toBe(2);
  });

  it('G5: meditate (destructive) never touches another scope', async () => {
    // Seed a stale conversations-tier memory in each scope (>90 days old).
    for (const scope of ['projectA', 'projectB']) {
      await pool.query(
        `INSERT INTO memories (content, tier, type, fingerprint, project_scope, created_at)
         VALUES ($1, 'conversations', 'relationship', $2, $3, NOW() - INTERVAL '120 days')`,
        [`stale note in ${scope}`, `fp-stale-${scope}`, scope],
      );
    }

    const res = await meditate({ mode: 'full', dry_run: false }, undefined, 'projectA');
    expect(res.archived).toBe(1); // only A's stale memory

    const aType = await pool.query(
      "SELECT type FROM memories WHERE fingerprint = 'fp-stale-projectA'",
    );
    const bType = await pool.query(
      "SELECT type FROM memories WHERE fingerprint = 'fp-stale-projectB'",
    );
    expect(aType.rows[0].type).toBe('archived');
    expect(bType.rows[0].type).toBe('relationship'); // B untouched
  });

  it('G5b: reject cannot reject another scope\'s memory', async () => {
    const a = await addIn('projectA', 'a memory in A to reject');
    // Attempt to reject A's memory while operating in scope B → should fail.
    await expect(reject({ id: a.id!, reason: 'nope' }, 'projectB')).rejects.toThrow();
    // A's memory is untouched.
    const stillThere = await pool.query('SELECT type FROM memories WHERE id = $1', [a.id]);
    expect(stillThere.rows[0].type).toBe('preference');
    // In its own scope, reject works.
    await expect(reject({ id: a.id!, reason: 'yes' }, 'projectA')).resolves.toBeTruthy();
  });
});
