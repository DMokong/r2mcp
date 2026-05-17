// SPEC-046 Task 6 — extractor driver tests.
//
// Test-DB safety (claw-0vsn): we use setupTestDb()/teardownTestDb() from
// tests/setup.ts, which routes through pickTestUrl() — never reads
// R2MCP_DATABASE_URL directly. Same pattern as tests/entities/db.test.ts.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type pg from 'pg';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { runExtractor } from '../../src/entities/extractor.js';
import type { LLMProvider, CompleteResponse } from '../../src/providers/types.js';
import corpus from './fixtures/synthetic-corpus.json' with { type: 'json' };

function mockProvider(scriptedResponses: string[]): LLMProvider {
  let idx = 0;
  return {
    name: 'anthropic',
    concurrencyLimit: 10,
    complete: async (_req): Promise<CompleteResponse> => {
      const resp = scriptedResponses[idx++ % scriptedResponses.length];
      return { response: resp, cost_usd: 0.005, latency_ms: 10 };
    },
  };
}

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('SPEC-046 runExtractor', () => {
  let dataDir: string;
  beforeEach(async () => {
    await pool.query('DELETE FROM memory_entities');
    await pool.query('DELETE FROM entities');
    await pool.query('DELETE FROM memories');
    dataDir = mkdtempSync(join(tmpdir(), 'extractor-'));
    return () => rmSync(dataDir, { recursive: true, force: true });
  });

  async function seedCorpus() {
    const ids: string[] = [];
    for (const [i, m] of corpus.memories.entries()) {
      const { rows } = await pool.query(
        `INSERT INTO memories (content, tier, type, fingerprint) VALUES ($1, 'preferences', 'preference', $2) RETURNING id`,
        [m.content, `fp-corpus-${i}`],
      );
      ids.push(rows[0].id);
    }
    return ids;
  }

  it('AC2 + AC11: extracts entities over the synthetic corpus, produces a run summary', async () => {
    await seedCorpus();
    const responses = corpus.memories.map((m) =>
      JSON.stringify({
        matched: [],
        new_entities: m.expected_entities.map((e) => ({ ...e, aliases: [], confidence: 0.9 })),
      }),
    );
    const summary = await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });
    expect(summary.memories_seen).toBe(10);
    expect(summary.memories_extracted).toBe(10);
    expect(summary.entities_created).toBeGreaterThanOrEqual(7); // 7 unique expected
    expect(summary.links_created).toBeGreaterThanOrEqual(8); // includes the dual-entity memory
    expect(summary.hit_cost_cap).toBe(false);
    // claw-2jbo finding 2: shape includes hallucinated_matched; zero on happy path.
    expect(summary.hallucinated_matched).toBe(0);
  });

  it('claw-2jbo finding 1 + 2: matched against known set resolves via in-memory map; unknown canonical_names count as hallucinations', async () => {
    // Seed corpus + an existing entity the LLM can legitimately match against.
    await seedCorpus();
    const { rows: [knownRow] } = await pool.query(
      `INSERT INTO entities (type, canonical_name, normalized_name, aliases)
       VALUES ('project', 'Speculator', 'speculator', ARRAY['spec']::text[])
       RETURNING id`,
    );
    // Touch one memory so the candidate pool re-includes existing-linked memories.
    await pool.query("UPDATE memories SET updated_at = NOW() + INTERVAL '1 minute'");

    // Each response: one matched against the known entity ("Speculator"),
    // and one matched against a hallucinated canonical_name ("Phantom").
    const responses = corpus.memories.map(() =>
      JSON.stringify({
        matched: [
          { canonical_name: 'Speculator', confidence: 0.9 },
          { canonical_name: 'Phantom', confidence: 0.8 },
        ],
        new_entities: [],
      }),
    );

    const summary = await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });

    // One hallucination per memory → matches corpus length.
    expect(summary.hallucinated_matched).toBe(corpus.memories.length);
    // No "Phantom" entity ever inserted (hallucinations are silently dropped).
    const { rows: phantomRows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM entities WHERE canonical_name = 'Phantom'",
    );
    expect(phantomRows[0].n).toBe(0);
    // The known-entity link succeeded once per memory.
    const { rows: linkRows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM memory_entities WHERE entity_id = $1',
      [knownRow.id],
    );
    expect(linkRows[0].n).toBe(corpus.memories.length);
  });

  it('AC5: cost cap exits cleanly with hit_cost_cap=true', async () => {
    await seedCorpus();
    const responses = corpus.memories.map(() => JSON.stringify({ matched: [], new_entities: [] }));
    const summary = await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 0.012, // ~2 calls before cap
      contextTopN: 100,
    });
    expect(summary.hit_cost_cap).toBe(true);
    expect(summary.memories_extracted).toBeLessThan(10);
  });

  it('AC5: --resume continues without re-extracting terminal memories', async () => {
    const ids = await seedCorpus();
    const responses = ids.map(() => JSON.stringify({ matched: [], new_entities: [] }));
    const first = await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 0.012,
      contextTopN: 100,
    });
    const second = await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
      resumeFrom: first.run_id,
    });
    expect(second.memories_extracted).toBeLessThan(10);
    expect(second.memories_extracted + first.memories_extracted).toBeLessThanOrEqual(10);
  });

  it('AC3c: parse failures are recorded; memory not marked terminal', async () => {
    await seedCorpus();
    const responses = corpus.memories.map(() => 'not json at all');
    const summary = await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });
    expect(summary.parse_failures).toBe(10);
    expect(summary.memories_extracted).toBe(0);
  });

  it('provider throw: returns run summary with error, does not mark failing memory terminal, preserves prior progress', async () => {
    await seedCorpus();
    // Provider succeeds once then rejects on every subsequent call.
    let calls = 0;
    const flakyProvider: LLMProvider = {
      name: 'anthropic',
      concurrencyLimit: 10,
      complete: async (_req): Promise<CompleteResponse> => {
        calls++;
        if (calls === 1) {
          return {
            response: JSON.stringify({
              matched: [],
              new_entities: [
                { type: 'project', canonical_name: 'First', aliases: [], confidence: 0.9 },
              ],
            }),
            cost_usd: 0.005,
            latency_ms: 10,
          };
        }
        throw new Error('upstream 503');
      },
    };

    const summary = await runExtractor({
      client: pool,
      provider: flakyProvider,
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });

    // 1. Run summary surfaces a non-empty error including "provider error"
    expect(summary.error).toBeTruthy();
    expect(summary.error).toMatch(/provider error/);

    // 2. The memory that triggered the throw is NOT marked terminal — a resume
    //    run can retry it. The first successful memory IS terminal.
    expect(summary.memories_extracted).toBe(1);

    // Second run (resume) — provider behaves normally now. The memory that
    // previously errored must be re-attempted (proving it wasn't marked terminal).
    const responses = corpus.memories.map(() =>
      JSON.stringify({
        matched: [],
        new_entities: [{ type: 'project', canonical_name: 'Retried', aliases: [], confidence: 0.9 }],
      }),
    );
    const resumed = await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
      resumeFrom: summary.run_id,
    });
    // After resume we processed the remaining 9 memories (10 corpus - 1 already extracted).
    expect(resumed.memories_extracted).toBe(corpus.memories.length - 1);

    // 3. Memories processed BEFORE the throw are still recorded — "First" entity persists.
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM entities WHERE canonical_name = $1',
      ['First'],
    );
    expect(rows[0].n).toBe(1);
  });

  it('AC9: invalid type from LLM produces zero DB rows for that type (parser drops it, valid sibling still inserts)', async () => {
    // Single memory; LLM returns one bad-type entry + one valid one. The parser
    // is expected to silently drop the bad type (with a warning) and keep the
    // valid one. After the full extractor pipeline runs, the entities table
    // must contain ONLY the valid row — no rows of type='event'. The schema's
    // CHECK constraint would also reject a type='event' write, but this test
    // proves we never even attempt the bad insert.
    const { rows: [m] } = await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint) VALUES ('about Event and Good', 'preferences', 'preference', 'fp-ac9-1') RETURNING id`,
    );
    const response = JSON.stringify({
      matched: [],
      new_entities: [
        { type: 'event', canonical_name: 'BadType', aliases: [], confidence: 0.9 },
        { type: 'project', canonical_name: 'Good', aliases: [], confidence: 0.9 },
      ],
    });
    const summary = await runExtractor({
      client: pool,
      provider: mockProvider([response]),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });

    // Pipeline completed for the memory (not parse-failed) — bad type is a
    // soft drop, not a hard failure.
    expect(summary.memories_extracted).toBe(1);
    expect(summary.parse_failures).toBe(0);

    // Zero rows of type='event' — the gate-2b recommendation's explicit ask.
    const { rows: eventRows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM entities WHERE type = 'event'",
    );
    expect(eventRows[0].n).toBe(0);

    // The BadType canonical_name must not appear in any entity row.
    const { rows: badName } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM entities WHERE canonical_name = $1',
      ['BadType'],
    );
    expect(badName[0].n).toBe(0);

    // Valid sibling persisted — proves we kept going after the bad entry.
    const { rows: goodRows } = await pool.query(
      "SELECT type, canonical_name FROM entities WHERE canonical_name = 'Good'",
    );
    expect(goodRows).toHaveLength(1);
    expect(goodRows[0].type).toBe('project');

    // Memory IS linked to the valid entity exactly once — no orphan/duplicate.
    const { rows: links } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM memory_entities WHERE memory_id = $1',
      [m.id],
    );
    expect(links[0].n).toBe(1);
  });

  it('R4 sentinel: extractor processes memories sequentially — peak provider in-flight is 1, never exceeds claude-code cap=2', async () => {
    // The extractor driver does not parallelize across memories. This test
    // pins that invariant: if someone parallelizes the loop without adding a
    // Semaphore, peak in-flight would jump past 1 and this assertion fires.
    // Bounded by the strictest provider cap (claude-code = 2) by design.
    await seedCorpus();
    let inFlight = 0;
    let peak = 0;
    const observingProvider: LLMProvider = {
      name: 'claude-code',
      concurrencyLimit: 2,
      complete: async (_req): Promise<CompleteResponse> => {
        inFlight++;
        if (inFlight > peak) peak = inFlight;
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return {
          response: JSON.stringify({ matched: [], new_entities: [] }),
          cost_usd: 0,
          latency_ms: 5,
        };
      },
    };
    const summary = await runExtractor({
      client: pool,
      provider: observingProvider,
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });
    expect(summary.memories_seen).toBe(10);
    expect(peak).toBe(1); // sequential by design
    expect(peak).toBeLessThanOrEqual(observingProvider.concurrencyLimit);
  });

  it('AC6: idempotent re-extraction with same response does not duplicate rows', async () => {
    await seedCorpus();
    const responses = corpus.memories.map(() =>
      JSON.stringify({
        matched: [],
        new_entities: [{ type: 'project', canonical_name: 'Stable', aliases: [], confidence: 0.9 }],
      }),
    );
    await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });
    const before = await pool.query(
      'SELECT COUNT(*)::int FROM entities WHERE canonical_name = $1',
      ['Stable'],
    );
    // Touch updated_at on each memory to force re-extraction
    await pool.query("UPDATE memories SET updated_at = NOW() + INTERVAL '1 minute'");
    await runExtractor({
      client: pool,
      provider: mockProvider(responses),
      dataDir,
      maxCostUsd: 1.0,
      contextTopN: 100,
    });
    const after = await pool.query(
      'SELECT COUNT(*)::int FROM entities WHERE canonical_name = $1',
      ['Stable'],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count); // 1, not 2
  });
});
