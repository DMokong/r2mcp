#!/usr/bin/env node
/**
 * Stage-1 shadow report (trk-7mx).
 *
 *   npm run edges:shadow-report -- [--log=PATH] [--since=YYYY-MM-DD] [--json]
 *
 * Reads data/edges-shadow.jsonl (R2MCP_EDGE_DATA_DIR) — ids and scores only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ShadowRecord } from '../edges/stage1-shadow.js';
import { summarizeShadow } from '../edges/shadow-report.js';

function flag(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}

const log = resolve(
  flag('--log') ?? resolve(process.env.R2MCP_EDGE_DATA_DIR ?? 'data', 'edges-shadow.jsonl'),
);
if (!existsSync(log)) {
  process.stderr.write(
    `No shadow log at ${log} — is R2MCP_EDGE_STAGE1_SHADOW set for the nightly run?\n`,
  );
  process.exit(1);
}
const since = flag('--since');
const records = readFileSync(log, 'utf-8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as ShadowRecord)
  .filter((r) => !since || r.ts >= since);
const s = summarizeShadow(records);

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(s, null, 2) + '\n');
} else {
  const lines = [
    `Stage-1 shadow report — ${log}${since ? ` (since ${since})` : ''}`,
    `records ${s.records} · scored ${s.scored} · errors ${s.errors} · skipped ${JSON.stringify(s.skipped)}`,
    `classifier cost $${s.cost_usd.toFixed(4)} · p50 latency ${s.latency_p50_ms ?? 'n/a'}ms`,
    '',
    'threshold | agree | classifier-only pass | LLM-only pass',
    ...s.by_threshold.map(
      (t) => `${t.threshold} | ${t.agree} | ${t.classifier_only_pass} | ${t.llm_only_pass}`,
    ),
    '',
    `Candidate missed edges (LLM said NO, classifier p>=0.5): ${s.candidate_missed_edges.length}`,
    ...s.candidate_missed_edges
      .slice(0, 20)
      .map((c) => `  p=${c.p.toFixed(2)}  ${c.from_id} ↔ ${c.to_id}`),
  ];
  process.stdout.write(lines.join('\n') + '\n');
}
