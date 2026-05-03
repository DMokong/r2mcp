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

describe('classifier rejection-skip end-to-end (AC10)', () => {
  it('rejection memories produce no edges, log skip, mark state terminal', async () => {
    const R1 = await insertTestMemory(pool, 'do not add fallback handlers for internal functions', 'rejection', ['code-style', 'error-handling']);
    const P1 = await insertTestMemory(pool, 'we use try/catch with explicit re-raise for the database layer', 'context', ['code-style', 'error-handling']);
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
            // Replicate the rejection-skip rule inline so this test does not need a real Anthropic client.
            // The production path uses stage2OpusClassify which calls shouldSkipForRejection internally.
            if (pair.from.type === 'rejection' || pair.to.type === 'rejection') {
              return { kind: 'rejection_skip', reason: 'rejection memories are out-of-vocabulary' };
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

      // No edges involving rejection memory
      const rejEdges = await pool.query(
        'SELECT count(*)::int AS c FROM memory_edges WHERE $1 IN (from_memory_id, to_memory_id)',
        [R1],
      );
      expect(rejEdges.rows[0].c).toBe(0);

      // The (A,B) non-rejection pair did get classified into a contradicts edge
      const realEdge = await pool.query(
        `SELECT count(*)::int AS c FROM memory_edges
         WHERE relation='contradicts' AND ((from_memory_id=$1 AND to_memory_id=$2) OR (from_memory_id=$2 AND to_memory_id=$1))`,
        [A, B],
      );
      expect(realEdge.rows[0].c).toBe(1);

      // State has a terminal rejection_skip stage for the (R1,P1) pair
      const terminals = await state.terminalPairs('test-ac10');
      expect(terminals.has(pairHash(R1, P1))).toBe(true);

      // Stdout contains the AC10-required SKIP log line
      const stdout = writes.join('');
      expect(stdout).toMatch(/SKIP rejection-pair.*memory_id/);

      // Summary recorded
      expect(summary.edges_written).toBeGreaterThanOrEqual(1);
    } finally {
      (process.stdout as unknown as { write: typeof origWrite }).write = origWrite;
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
