/**
 * Stage-1 shadow trial (trk-7mx, option 3). Alongside the real Stage-1 LLM
 * filter, a classifier backend scores the same pair and the result is logged
 * — never acted on. After a few weeks the log answers whether the classifier
 * would find the edges the LLM filter misses, on real nightly traffic rather
 * than a 50-pair sample.
 *
 * Privacy: hosted Jev is a third party, so a pair is skipped before any
 * request when either memory is health- or finance-related by topic, section
 * or text. The text check is a deliberately broad backstop for untagged
 * memories — a false skip only costs one shadow sample. The log holds memory
 * ids and scores, never content.
 */

import { appendFileSync } from 'node:fs';
import { classifyStage1AsNoul } from '../classifiers/eval/adapters.js';
import type { ClassifierProvider } from '../classifiers/types.js';
import type { Stage1Result } from './stage1-haiku.js';

export interface ShadowMemory {
  id: string;
  content: string;
  topics: readonly string[] | null;
  section: string | null;
}

const SENSITIVE_TOPICS = new Set([
  'health',
  'cc-health',
  'medication',
  'medical',
  'symptoms',
  'wellbeing',
  'finance',
  'cc-finance',
  'money',
  'spending',
  'budget',
  'banking',
  'tax',
  'salary',
  'insurance',
]);

const SENSITIVE_SECTION = /health|medical|finance|money|life context/i;

const SENSITIVE_TEXT =
  /\b(symptoms?|medications?|medicine|prescri\w*|diagnos\w*|doctors?|GP|blood (test|sugar|pressure)|fasting|metformin|illness|sick|injur\w*|allerg\w*|salary|payslip|bank account|mortgage|loans?|credit card|tax return|superannuation|net worth|savings)\b/i;

/** Why a memory must not be sent to a remote classifier, or null if it may. */
export function sensitiveReason(
  m: ShadowMemory,
  extraTopics: readonly string[] = [],
): string | null {
  const blocked = new Set([...SENSITIVE_TOPICS, ...extraTopics.map((t) => t.toLowerCase())]);
  const topic = (m.topics ?? []).find((t) => blocked.has(t.toLowerCase()));
  if (topic) return `topic:${topic}`;
  if (m.section && SENSITIVE_SECTION.test(m.section)) return `section:${m.section}`;
  const text = m.content.match(SENSITIVE_TEXT);
  if (text) return `text:${text[0].toLowerCase()}`;
  return null;
}

export interface ShadowRecord {
  ts: string;
  scope: string;
  from_id: string;
  to_id: string;
  primary_pass: boolean;
  backend: string;
  skipped?: string;
  p?: number;
  model?: string;
  latency_ms?: number;
  cost_usd?: number;
  error?: string;
}

export interface ShadowDeps {
  classifier: ClassifierProvider;
  scope: string;
  logPath: string;
  extraTopics?: readonly string[];
  now?: () => Date;
  append?: (path: string, line: string) => void;
}

/**
 * Score one pair in the shadow and append the record. Never throws: the
 * shadow must not be able to fail or slow down the real run's decisions.
 */
export async function shadowStage1(
  deps: ShadowDeps,
  from: ShadowMemory,
  to: ShadowMemory,
  primary: Stage1Result,
): Promise<ShadowRecord> {
  const record: ShadowRecord = {
    ts: (deps.now ?? (() => new Date()))().toISOString(),
    scope: deps.scope,
    from_id: from.id,
    to_id: to.id,
    primary_pass: primary.pass,
    backend: deps.classifier.name,
  };
  const reason =
    deps.classifier.egress === 'remote'
      ? (sensitiveReason(from, deps.extraTopics) ?? sensitiveReason(to, deps.extraTopics))
      : null;
  if (reason) {
    record.skipped = reason;
  } else {
    try {
      const r = await classifyStage1AsNoul(deps.classifier, {
        from: { id: from.id, content: from.content, type: '' },
        to: { id: to.id, content: to.content, type: '' },
      });
      record.p = r.probability;
      record.latency_ms = r.latency_ms;
      record.cost_usd = r.cost_usd;
    } catch (err) {
      record.error = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    }
  }
  try {
    (deps.append ?? appendFileSync)(deps.logPath, JSON.stringify(record) + '\n');
  } catch {
    // Logging is best-effort; a full disk must not fail the edge run.
  }
  return record;
}
