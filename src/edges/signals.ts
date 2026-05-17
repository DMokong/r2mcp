import type pg from 'pg';
import type { RecallSignal } from './types.js';

/**
 * Build the signals[] array for a recall response. For every returned memory ID:
 * - emit a `contradicts` signal for each outgoing `contradicts` edge
 * - emit a `superseded_by` signal for each outgoing `supersedes` edge (returned memory is the newer one; signal's `from_id` will be the DB row's `to_memory_id`)
 *   AND for each incoming `supersedes` edge (returned memory is the older one; signal's `from_id` will be its own ID)
 *
 * Direction semantics: in the DB, `(from=newer, to=older, relation=supersedes)` means
 * "newer supersedes older". The recall signal `superseded_by` always points
 * from the older memory to the newer one, regardless of which side appeared in results[].
 */
export async function getSignalsForMemoryIds(
  pool: pg.Pool,
  memoryIds: string[],
): Promise<RecallSignal[]> {
  if (memoryIds.length === 0) return [];

  // Outgoing contradicts (memory in results -> some other memory)
  const contradictsRes = await pool.query<{
    from_memory_id: string;
    to_memory_id: string;
    rationale: string;
    confidence: string;
  }>(
    `SELECT from_memory_id, to_memory_id, rationale, confidence
     FROM memory_edges
     WHERE from_memory_id = ANY($1) AND relation = 'contradicts' AND valid_until IS NULL`,
    [memoryIds],
  );

  // Supersession: surface in either direction so the consumer always sees it
  const supersedesRes = await pool.query<{
    from_memory_id: string;
    to_memory_id: string;
    rationale: string;
    confidence: string;
  }>(
    `SELECT from_memory_id, to_memory_id, rationale, confidence
     FROM memory_edges
     WHERE (from_memory_id = ANY($1) OR to_memory_id = ANY($1))
       AND relation = 'supersedes' AND valid_until IS NULL`,
    [memoryIds],
  );

  const signals: RecallSignal[] = [];

  for (const row of contradictsRes.rows) {
    signals.push({
      kind: 'contradicts',
      from_id: row.from_memory_id,
      to_id: row.to_memory_id,
      rationale: row.rationale,
      confidence: Number(row.confidence),
    });
  }

  for (const row of supersedesRes.rows) {
    // DB: from=newer, to=older (per classifier convention)
    // Signal: from=older, to=newer (per spec AC8 — "from_id is older")
    signals.push({
      kind: 'superseded_by',
      from_id: row.to_memory_id,
      to_id: row.from_memory_id,
      rationale: row.rationale,
      confidence: Number(row.confidence),
    });
  }

  return signals;
}
