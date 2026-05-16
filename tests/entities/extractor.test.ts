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
