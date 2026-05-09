import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupEdgesTestDb, teardownEdgesTestDb, insertTestMemory } from './setup.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClassifier } from '../../src/edges/classifier.js';
import { findCandidatePairs } from '../../src/edges/candidate-pairs.js';
import { StateStore, RunSummaryWriter, pairHash } from '../../src/edges/state.js';
import type pg from 'pg';

let pool: pg.Pool;
beforeAll(async () => { pool = await setupEdgesTestDb(); });
afterAll(async () => { await teardownEdgesTestDb(); });

describe('classifier rejection-handling end-to-end (AC10)', () => {
  it('rejection pairs CAN form non-contradicts edges; LLM contradicts on rejection pair gets downgraded', async () => {
    const R1 = await insertTestMemory(pool, 'do not add fallback handlers for internal functions', 'rejection', ['code-style', 'error-handling']);
    const P1 = await insertTestMemory(pool, 'we use try/catch with explicit re-raise for the database layer', 'context', ['code-style', 'error-handling']);
    const R2 = await insertTestMemory(pool, 'do not commit dev tokens to the repo', 'rejection', ['security', 'secrets']);
    const C2 = await insertTestMemory(pool, 'we commit fake test tokens for snapshot stability', 'context', ['security', 'secrets']);
    const A  = await insertTestMemory(pool, 'use library X for HTTP', 'context', ['http', 'library']);
    const B  = await insertTestMemory(pool, 'do not use library X — deprecated', 'context', ['http', 'library']);

    const dataDir = mkdtempSync(join(tmpdir(), 'edges-ac10-'));
    const state = new StateStore(join(dataDir, 'state.jsonl'), join(dataDir, 'state.last-run'));
    const summaryWriter = new RunSummaryWriter(join(dataDir, 'runs'));

    // Capture stdout writes
    const writes: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as unknown as { write: (chunk: string | Uint8Array) => boolean }).write = (chunk) => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    };

    try {
      const summary = await runClassifier(
        { runId: 'test-ac10', maxCostUsd: 1, dryRun: false },
        {
          classifierVersion: 'test-v1',
          state,
          summaryWriter,
          findCandidatePairs: (opts) => findCandidatePairs(pool, opts),
          fetchMemoryById: async (id) => {
            const r = await pool.query('SELECT id, content, type FROM memories WHERE id = $1', [id]);
            return r.rows[0] ?? null;
          },
          stage1Filter: vi.fn().mockResolvedValue({ pass: true, comment: '', cost_usd: 0 }),
          stage2Classify: async (pair) => {
            const aRej = pair.from.type === 'rejection';
            const bRej = pair.to.type === 'rejection';
            const isRej = aRej || bRej;
            // Mock the production AC10 guard semantics:
            // - For (R1, P1): LLM returns related_to (good behavior).
            //   The classifier writes a related_to edge.
            // - For (R2, C2): LLM returns contradicts (bad behavior).
            //   The post-call guard downgrades to none, no edge written.
            // - For (A, B): non-rejection pair, classifier writes contradicts edge.
            const isR1P1 = (pair.from.id === R1 && pair.to.id === P1) || (pair.from.id === P1 && pair.to.id === R1);
            const isR2C2 = (pair.from.id === R2 && pair.to.id === C2) || (pair.from.id === C2 && pair.to.id === R2);
            if (isR1P1) {
              return { kind: 'classified', relation: 'related_to', confidence: 0.78, rationale: 'both about error-handling code style', cost_usd: 0 };
            }
            if (isR2C2) {
              // Simulates LLM violating the rule; production guard downgrades.
              return { kind: 'classified', relation: 'none', confidence: 0.85, rationale: '[AC10] downgraded contradicts→none for rejection pair', cost_usd: 0, downgraded: true };
            }
            if (isRej) {
              return { kind: 'classified', relation: 'none', confidence: 0, rationale: 'distinct', cost_usd: 0 };
            }
            return { kind: 'classified', relation: 'contradicts', confidence: 0.85, rationale: 'mocked', cost_usd: 0 };
          },
          insertEdge: async (fromId, toId, relation, confidence, rationale, version) => {
            const res = await pool.query<{ id: string }>(
              `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
               VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
              [fromId, toId, relation, confidence, rationale, version],
            );
            return res.rows[0].id;
          },
        },
      );

      // (R1, P1) rejection-pair gets a related_to edge — the AC10 fix's whole point
      const rejPairEdge = await pool.query(
        `SELECT count(*)::int AS c FROM memory_edges
         WHERE relation='related_to' AND ((from_memory_id=$1 AND to_memory_id=$2) OR (from_memory_id=$2 AND to_memory_id=$1))`,
        [R1, P1],
      );
      expect(rejPairEdge.rows[0].c).toBe(1);

      // (R2, C2) downgraded pair produces NO edge (guard kicked in)
      const downgradedEdges = await pool.query(
        'SELECT count(*)::int AS c FROM memory_edges WHERE $1 IN (from_memory_id, to_memory_id) AND $2 IN (from_memory_id, to_memory_id)',
        [R2, C2],
      );
      expect(downgradedEdges.rows[0].c).toBe(0);

      // (A, B) non-rejection contradicts edge unchanged
      const realEdge = await pool.query(
        `SELECT count(*)::int AS c FROM memory_edges
         WHERE relation='contradicts' AND ((from_memory_id=$1 AND to_memory_id=$2) OR (from_memory_id=$2 AND to_memory_id=$1))`,
        [A, B],
      );
      expect(realEdge.rows[0].c).toBe(1);

      // State terminal for both rejection-pair runs (no rejection_skip stage anymore — opus_complete instead)
      const terminals = await state.terminalPairs('test-ac10');
      expect(terminals.has(pairHash(R1, P1))).toBe(true);
      expect(terminals.has(pairHash(R2, C2))).toBe(true);

      // Stdout has the AC10 GUARD log for the downgraded pair
      const stdout = writes.join('');
      expect(stdout).toMatch(/AC10 GUARD: downgraded contradicts→none/);

      // Summary records edges (R1,P1 related_to + A,B contradicts = at least 2)
      expect(summary.edges_written).toBeGreaterThanOrEqual(2);
    } finally {
      (process.stdout as unknown as { write: typeof origWrite }).write = origWrite;
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
