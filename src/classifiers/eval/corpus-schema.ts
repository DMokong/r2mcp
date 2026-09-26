/**
 * Shared corpus record schema + strict validation (trk-7mx.1 review round 2,
 * fix #1/#2).
 *
 * Two file shapes exist:
 *   - the builder's own DB-sampled corpus.jsonl (pair_id/source/relation/
 *     confidence/stage1_pass — build-classifier-corpus.ts)
 *   - the committed public fixture (from/to/expected_relation, hand-labelled)
 * Casting one as the other without validating is exactly what silently
 * produced zero relation/ECE/temperature samples for the whole fixture
 * (round-2 finding #1, BLOCKER) — every record must be normalized through
 * one of the two functions below, both of which throw on a schema mismatch
 * rather than letting a malformed row through as `undefined` fields.
 */

import { pairHash } from '../../edges/state.js';
import type { RelationLabel } from '../eval-metrics.js';

export interface RawMemory {
  id: string;
  content: string;
  type: string;
}

export interface CorpusRecord {
  pair_id: string;
  from: RawMemory;
  to: RawMemory;
  source: 'memory_edge' | 'stage1_rejected' | 'fixture';
  /** null = unknown (needs a human label); 'none' = confirmed no relation. */
  relation: RelationLabel | null;
  confidence: number | null;
  /** Ground truth for Stage-1 recall. null = unknown. */
  stage1_pass: boolean | null;
}

const VALID_RELATIONS: ReadonlySet<string> = new Set([
  'supports',
  'contradicts',
  'supersedes',
  'evolved_into',
  'depends_on',
  'related_to',
  'none',
]);

export function isRawMemory(value: unknown): value is RawMemory {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.content === 'string' && typeof v.type === 'string';
}

export function isRelationLabel(value: unknown): value is RelationLabel {
  return typeof value === 'string' && VALID_RELATIONS.has(value);
}

/** Normalizes one line of the committed public fixture (from/to/expected_relation). Throws on schema mismatch. */
export function normalizeFixtureRecord(raw: unknown, lineNo: number): CorpusRecord {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`fixture line ${lineNo}: expected an object`);
  }
  const r = raw as Record<string, unknown>;
  if (!isRawMemory(r.from)) throw new Error(`fixture line ${lineNo}: invalid or missing "from"`);
  if (!isRawMemory(r.to)) throw new Error(`fixture line ${lineNo}: invalid or missing "to"`);
  if (!isRelationLabel(r.expected_relation)) {
    throw new Error(`fixture line ${lineNo}: invalid "expected_relation" ${JSON.stringify(r.expected_relation)}`);
  }
  const relation = r.expected_relation;
  return {
    pair_id: pairHash(r.from.id, r.to.id),
    from: r.from,
    to: r.to,
    source: 'fixture',
    relation,
    confidence: null,
    stage1_pass: relation !== 'none',
  };
}

/** Normalizes one line of the builder's DB-sampled corpus.jsonl. Throws on schema mismatch. */
export function normalizeDbRecord(raw: unknown, lineNo: number): CorpusRecord {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`corpus line ${lineNo}: expected an object`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.pair_id !== 'string' || r.pair_id.length === 0) {
    throw new Error(`corpus line ${lineNo}: invalid or missing "pair_id"`);
  }
  if (!isRawMemory(r.from)) throw new Error(`corpus line ${lineNo}: invalid or missing "from"`);
  if (!isRawMemory(r.to)) throw new Error(`corpus line ${lineNo}: invalid or missing "to"`);
  if (r.source !== 'memory_edge' && r.source !== 'stage1_rejected') {
    throw new Error(`corpus line ${lineNo}: invalid "source" ${JSON.stringify(r.source)}`);
  }
  if (r.relation !== null && r.relation !== undefined && !isRelationLabel(r.relation)) {
    throw new Error(`corpus line ${lineNo}: invalid "relation" ${JSON.stringify(r.relation)}`);
  }
  if (r.confidence !== null && r.confidence !== undefined && typeof r.confidence !== 'number') {
    throw new Error(`corpus line ${lineNo}: invalid "confidence" ${JSON.stringify(r.confidence)}`);
  }
  if (r.stage1_pass !== null && r.stage1_pass !== undefined && typeof r.stage1_pass !== 'boolean') {
    throw new Error(`corpus line ${lineNo}: invalid "stage1_pass" ${JSON.stringify(r.stage1_pass)}`);
  }
  return {
    pair_id: r.pair_id,
    from: r.from,
    to: r.to,
    source: r.source,
    relation: (r.relation as RelationLabel | undefined) ?? null,
    confidence: (r.confidence as number | undefined) ?? null,
    stage1_pass: (r.stage1_pass as boolean | undefined) ?? null,
  };
}

/**
 * Parses a spot-check-shaped JSONL string (pair_id + human_label) into a
 * pair_id -> label map, for scoring against independent human ground truth
 * (fix #2). A null/absent human_label means "not yet labelled" and is
 * skipped, not coerced into a guess. Throws on a malformed row.
 */
export function parseHumanLabels(raw: string): Map<string, RelationLabel> {
  const map = new Map<string, RelationLabel>();
  const lines = raw.split('\n').filter((l) => l.trim());
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new Error(`labels line ${lineNo}: not valid JSON`, { cause: err });
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`labels line ${lineNo}: expected an object`);
    }
    const r = parsed as Record<string, unknown>;
    if (typeof r.pair_id !== 'string' || r.pair_id.length === 0) {
      throw new Error(`labels line ${lineNo}: invalid or missing "pair_id"`);
    }
    if (r.human_label === null || r.human_label === undefined) return; // not yet labelled
    if (!isRelationLabel(r.human_label)) {
      throw new Error(`labels line ${lineNo}: invalid "human_label" ${JSON.stringify(r.human_label)}`);
    }
    map.set(r.pair_id, r.human_label);
  });
  return map;
}
