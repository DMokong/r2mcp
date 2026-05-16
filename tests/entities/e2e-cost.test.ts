// SPEC-046 Task 12 — AC7 cost-on-fixture e2e test.
//
// Seeds 100 memories by tiling the 10-entry synthetic corpus 10x, then runs
// the extractor with a Haiku-like mocked LLM provider (cost ~$0.004–$0.006
// per call). Asserts total cost stays under $0.50 — the SPEC-046 AC7 budget.
//
// Test-DB safety (claw-0vsn): uses setupTestDb()/teardownTestDb() from
// tests/setup.ts, same as tests/entities/extractor.test.ts (Task 6).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type pg from 'pg';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { runExtractor } from '../../src/entities/extractor.js';
import type { LLMProvider, CompleteResponse } from '../../src/providers/types.js';
import corpus from './fixtures/synthetic-corpus.json' with { type: 'json' };

// Realistic mock: cost per call ~ $0.004 ± $0.0005 (Haiku ~200-token I/O).
// 100 calls → ~$0.40 ± a few cents; comfortably under the $0.50 AC7 budget
// without making the assertion flaky from per-call variance.
const haikuLikeProvider: LLMProvider = {
  name: 'anthropic',
  concurrencyLimit: 10,
  complete: async (_req): Promise<CompleteResponse> => ({
    response: JSON.stringify({
      matched: [],
      new_entities: [
        { type: 'project', canonical_name: 'X', aliases: [], confidence: 0.9 },
      ],
    }),
    cost_usd: 0.004 + (Math.random() - 0.5) * 0.001,
    latency_ms: 100,
  }),
};

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('SPEC-046 AC7 cost target on 100-memory corpus', () => {
  beforeEach(async () => {
    await pool.query('DELETE FROM memory_entities');
    await pool.query('DELETE FROM entities');
    await pool.query('DELETE FROM memories');
  });

  it('total cost on 100 memories stays under $0.50 with default settings', async () => {
    // Seed 100 memories by tiling the synthetic corpus 10x.
    for (let i = 0; i < 100; i++) {
      const m = corpus.memories[i % corpus.memories.length];
      await pool.query(
        `INSERT INTO memories (content, tier, type, fingerprint)
         VALUES ($1, 'preferences', 'preference', $2)`,
        [m.content + ` (${i})`, `fp-100-${i}`],
      );
    }
    const dataDir = mkdtempSync(join(tmpdir(), 'e2e-cost-'));
    try {
      const summary = await runExtractor({
        client: pool,
        provider: haikuLikeProvider,
        dataDir,
        maxCostUsd: 1.0,
        contextTopN: 100,
      });
      expect(summary.memories_seen).toBe(100);
      expect(summary.total_cost_usd).toBeLessThan(0.5);
      expect(summary.hit_cost_cap).toBe(false);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
