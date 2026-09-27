/**
 * Summarises the Stage-1 shadow log (trk-7mx). The question the trial answers:
 * on real nightly traffic, how often would the classifier pass a pair the LLM
 * filter rejected (candidate missed edges) — and vice versa?
 */
import type { ShadowRecord } from './stage1-shadow.js';

export interface ShadowSummary {
  records: number;
  scored: number;
  skipped: Record<string, number>;
  errors: number;
  cost_usd: number;
  latency_p50_ms: number | null;
  by_threshold: Array<{
    threshold: number;
    agree: number;
    classifier_only_pass: number;
    llm_only_pass: number;
  }>;
  /** Pairs the LLM rejected but the classifier passed at 0.5, strongest first — spot-check these. */
  candidate_missed_edges: Array<{ from_id: string; to_id: string; p: number; ts: string }>;
}

export function summarizeShadow(
  records: readonly ShadowRecord[],
  thresholds: readonly number[] = [0.3, 0.5, 0.7],
): ShadowSummary {
  const scored = records.filter((r) => typeof r.p === 'number');
  const skipped: Record<string, number> = {};
  for (const r of records) {
    if (r.skipped) {
      const kind = r.skipped.split(':')[0];
      skipped[kind] = (skipped[kind] ?? 0) + 1;
    }
  }
  const lat = scored.map((r) => r.latency_ms ?? 0).sort((a, b) => a - b);
  return {
    records: records.length,
    scored: scored.length,
    skipped,
    errors: records.filter((r) => r.error).length,
    cost_usd: scored.reduce((s, r) => s + (r.cost_usd ?? 0), 0),
    latency_p50_ms: lat.length ? lat[Math.floor((lat.length - 1) / 2)] : null,
    by_threshold: thresholds.map((t) => {
      let agree = 0;
      let classifierOnly = 0;
      let llmOnly = 0;
      for (const r of scored) {
        const c = (r.p as number) >= t;
        if (c === r.primary_pass) agree++;
        else if (c) classifierOnly++;
        else llmOnly++;
      }
      return { threshold: t, agree, classifier_only_pass: classifierOnly, llm_only_pass: llmOnly };
    }),
    candidate_missed_edges: scored
      .filter((r) => !r.primary_pass && (r.p as number) >= 0.5)
      .sort((a, b) => (b.p as number) - (a.p as number))
      .map((r) => ({ from_id: r.from_id, to_id: r.to_id, p: r.p as number, ts: r.ts })),
  };
}
