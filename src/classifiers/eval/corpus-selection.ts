/**
 * Which records actually get evaluated, and how many of them have a known
 * ground truth (trk-7mx.1 review round 3, findings A/1 and B/9).
 */

import { stratifiedLimit } from './sampling.js';
import type { CorpusRecord } from './corpus-schema.js';
import type { RelationLabel } from '../eval-metrics.js';

export const MIN_LABELED_COVERAGE = 30;

/**
 * Finding A/1: a plain prefix slice of --limit records skewed toward
 * whichever relation sorted first in the file — a default-sized fixture run
 * never saw a 'none' pair. With no limit, evaluate the whole corpus. With a
 * limit, stratify by `keyFn` (the resolved ground truth label) first so
 * every relation — and 'none' — gets a fair share.
 */
export function selectRecords(
  records: ReadonlyArray<CorpusRecord>,
  limit: number | undefined,
  keyFn: (record: CorpusRecord) => string,
): CorpusRecord[] {
  if (limit === undefined) return [...records];
  return stratifiedLimit(records, limit, keyFn);
}

/**
 * Finding B/9: labels mode used to silently accept zero matching labels and
 * report zero-valued "independent" metrics as if they meant something. This
 * intersects the labels with the corpus BEFORE any provider call: throws if
 * any labelled pair_id isn't in the corpus at all (a mismatched file), and
 * throws if the intersection is empty (nothing to score). Returns only the
 * corpus records that have a human label.
 */
export function intersectLabelsWithCorpus(
  records: ReadonlyArray<CorpusRecord>,
  labels: ReadonlyMap<string, RelationLabel>,
): CorpusRecord[] {
  const corpusPairIds = new Set(records.map((r) => r.pair_id));
  const unknown = [...labels.keys()].filter((id) => !corpusPairIds.has(id));
  if (unknown.length > 0) {
    const shown = unknown.slice(0, 5).join(', ');
    throw new Error(
      `--labels contains ${unknown.length} pair_id(s) not present in the corpus: ${shown}` +
        `${unknown.length > 5 ? ', ...' : ''}. Check the labels file matches this corpus.`,
    );
  }

  const matched = records.filter((r) => labels.has(r.pair_id));
  if (matched.length === 0) {
    throw new Error(
      '--labels matched zero pairs in the corpus. Nothing to score — check the corpus/labels pair_ids line up.',
    );
  }

  return matched;
}

/** Finding B/9: warn (not fail) when the labelled sample is small enough that metrics will be noisy. */
export function coverageWarning(labeledCount: number): string | null {
  if (labeledCount >= MIN_LABELED_COVERAGE) return null;
  return `WARNING: only ${labeledCount} labelled pair(s) (< ${MIN_LABELED_COVERAGE}) — metrics may be noisy.`;
}
