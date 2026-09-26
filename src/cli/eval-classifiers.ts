#!/usr/bin/env tsx
/**
 * Classifier shadow-eval runner (trk-7mx.1).
 *
 * Scores one or more backends against a shared corpus:
 *   - 'llm-path'  — the existing Stage 1 (Haiku/Sonnet) + Stage 2 (Opus) LLM
 *                   path, via the real LLMProvider selection logic.
 *   - any registered ClassifierProvider (currently only 'fake' — the real
 *     openjev/typesafe/llm-enum backends land in trk-7mx.2 and get registered
 *     here once src/classifiers/index.ts exists).
 *
 * Backends are compared on the same metrics (src/classifiers/eval-metrics.ts)
 * so the numbers are the gate for whether edge Stage 1 ever moves to a
 * classifier.
 *
 * Usage:
 *   npm run eval:classifiers -- [--corpus=PATH] [--backends=llm-path,fake]
 *                               [--limit=N]   (corpus provenance is inferred from the path; only tests/fixtures/edge-corpus.jsonl counts as public)
 *
 * EGRESS: a DB-sampled corpus is refused for any remote 'typesafe' backend —
 * see src/classifiers/eval/egress-guard.ts. This is a hard rule, not advisory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnvFile } from '../env.js';
import { selectProvider, ProviderUnavailableError } from '../providers/index.js';
import { stage1HaikuFilter } from '../edges/stage1-haiku.js';
import { stage2OpusClassify, STAGE2_RELATIONS } from '../edges/stage2-opus.js';
import type { EdgeRelation } from '../edges/types.js';
import type { ClassifierProvider } from '../classifiers/types.js';
import { classifyStage1AsNoul, classifyStage2AsChoice, type PairContent } from '../classifiers/eval/adapters.js';
import { createFakeClassifierProvider } from '../classifiers/eval/fake-provider.js';
import { LLMEnumClassifier, OpenJevClassifier, TypeSafeClassifier } from '../classifiers/index.js';
import { assertEgressAllowed, type CorpusSource } from '../classifiers/eval/egress-guard.js';
import {
  sweepStage1Thresholds,
  relationConfusionMatrix,
  expectedCalibrationError,
  fitTemperature,
  latencyPercentiles,
  costPer1kUsd,
  type Stage1JudgmentSample,
  type RelationJudgmentSample,
  type CalibrationSample,
  type TemperatureFitSample,
} from '../classifiers/eval-metrics.js';

interface CorpusRecord {
  pair_id: string;
  from: { id: string; content: string; type: string };
  to: { id: string; content: string; type: string };
  source: 'memory_edge' | 'stage1_rejected';
  relation: EdgeRelation | null;
  confidence: number | null;
  stage1_pass: boolean | null;
}

/** ClassifierProvider backends the runner can compare against the llm-path. */
const CLASSIFIER_REGISTRY: Record<string, (source: CorpusSource) => Promise<ClassifierProvider>> = {
  fake: async () => createFakeClassifierProvider(),
  openjev: async () => new OpenJevClassifier(),
  // Bound to the corpus provenance: construction throws for a private corpus.
  typesafe: async (source) => new TypeSafeClassifier({ scope: source }),
  'llm-enum': async () => new LLMEnumClassifier(await selectProvider()),
};

/** The only corpus treated as public: the committed, hand-labelled synthetic fixture. */
const PUBLIC_FIXTURE = resolve('tests/fixtures/edge-corpus.jsonl');

interface CliArgs {
  corpusPath: string;
  backends: string[];
  limit: number;
  corpusSource: CorpusSource;
}

function flagValue(argv: string[], name: string): string | undefined {
  return argv.find((a) => a.startsWith(`${name}=`))?.split('=').slice(1).join('=');
}

function parseArgs(argv: string[]): CliArgs {
  const corpusPath = resolve(flagValue(argv, '--corpus') ?? 'data/classifier-eval/corpus.jsonl');
  const backends = (flagValue(argv, '--backends') ?? 'llm-path,fake').split(',').map((b) => b.trim());
  const limit = Number(flagValue(argv, '--limit') ?? '10');
  // Fail closed: provenance comes from the path, never from a flag, so no
  // argument can relabel DB-sampled private text as public.
  const corpusSource: CorpusSource = corpusPath === PUBLIC_FIXTURE ? 'public-fixture' : 'db-sample';
  return { corpusPath, backends, limit, corpusSource };
}

function loadCorpus(path: string): CorpusRecord[] {
  if (!existsSync(path)) {
    throw new Error(`Corpus not found: ${path}. Run 'npm run eval:corpus' first.`);
  }
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as CorpusRecord);
}

interface BackendJudgments {
  stage1: Stage1JudgmentSample[];
  relations: RelationJudgmentSample[];
  calibration: CalibrationSample[];
  temperature: TemperatureFitSample[];
  latenciesMs: number[];
  totalCostUsd: number;
  judgmentCount: number;
}

function emptyJudgments(): BackendJudgments {
  return { stage1: [], relations: [], calibration: [], temperature: [], latenciesMs: [], totalCostUsd: 0, judgmentCount: 0 };
}

async function runLlmPath(records: CorpusRecord[]): Promise<BackendJudgments> {
  const provider = await selectProvider();
  const out = emptyJudgments();

  for (const rec of records) {
    const pair = { from: rec.from, to: rec.to };
    const s1 = await stage1HaikuFilter(provider, pair);
    out.totalCostUsd += s1.cost_usd;
    out.judgmentCount++;
    if (rec.stage1_pass !== null) {
      out.stage1.push({ pairId: rec.pair_id, groundTruthPass: rec.stage1_pass, predictedProbability: s1.pass ? 1 : 0 });
    }
    if (!s1.pass) continue;

    const s2 = await stage2OpusClassify(provider, { from: rec.from, to: rec.to });
    out.totalCostUsd += s2.cost_usd;
    out.judgmentCount++;
    if (rec.relation) {
      out.relations.push({ pairId: rec.pair_id, actual: rec.relation, predicted: s2.relation });
      out.calibration.push({ confidence: s2.confidence, correct: s2.relation === rec.relation });
    }
  }
  return out;
}

async function runClassifierBackend(provider: ClassifierProvider, records: CorpusRecord[]): Promise<BackendJudgments> {
  const out = emptyJudgments();

  for (const rec of records) {
    const pair: PairContent = { from: rec.from, to: rec.to };
    const s1 = await classifyStage1AsNoul(provider, pair);
    out.totalCostUsd += s1.cost_usd;
    out.judgmentCount++;
    out.latenciesMs.push(s1.latency_ms);
    if (rec.stage1_pass !== null) {
      out.stage1.push({ pairId: rec.pair_id, groundTruthPass: rec.stage1_pass, predictedProbability: s1.probability });
    }
    if (!s1.pass) continue;

    const s2 = await classifyStage2AsChoice(provider, pair);
    out.totalCostUsd += s2.cost_usd;
    out.judgmentCount++;
    out.latenciesMs.push(s2.latency_ms);
    if (rec.relation) {
      out.relations.push({ pairId: rec.pair_id, actual: rec.relation, predicted: s2.relation });
      out.calibration.push({ confidence: s2.confidence, correct: s2.relation === rec.relation });
      out.temperature.push({ probabilities: s2.probabilities, trueLabel: rec.relation });
    }
  }
  return out;
}

function summarize(judgments: BackendJudgments) {
  const thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  return {
    stage1_threshold_sweep: sweepStage1Thresholds(judgments.stage1, thresholds),
    relation_confusion: relationConfusionMatrix(judgments.relations, STAGE2_RELATIONS),
    calibration: expectedCalibrationError(judgments.calibration, 10),
    temperature_fit:
      judgments.temperature.length > 0 ? fitTemperature(judgments.temperature) : null,
    latency: latencyPercentiles(judgments.latenciesMs),
    cost_per_1k_usd: costPer1kUsd(judgments.totalCostUsd, judgments.judgmentCount),
    total_cost_usd: judgments.totalCostUsd,
    judgment_count: judgments.judgmentCount,
  };
}

function toMarkdown(timestamp: string, corpusPath: string, results: Record<string, ReturnType<typeof summarize>>): string {
  const lines: string[] = [`# Classifier eval — ${timestamp}`, '', `Corpus: \`${corpusPath}\``, ''];
  for (const [backend, s] of Object.entries(results)) {
    lines.push(`## ${backend}`, '');
    lines.push(`- Judgments: ${s.judgment_count}, total cost: $${s.total_cost_usd.toFixed(4)}, cost/1k: $${s.cost_per_1k_usd.toFixed(2)}`);
    lines.push(`- Latency p50/p95: ${s.latency.p50.toFixed(0)}ms / ${s.latency.p95.toFixed(0)}ms`);
    lines.push(`- Calibration ECE (10 bins): ${s.calibration.ece.toFixed(4)}`);
    if (s.temperature_fit) {
      lines.push(
        `- Temperature fit: T=${s.temperature_fit.temperature.toFixed(2)} (NLL ${s.temperature_fit.nllBefore.toFixed(3)} → ${s.temperature_fit.nllAfter.toFixed(3)})`,
      );
    }
    lines.push('', '### Stage 1 threshold sweep', '', '| threshold | recall | precision | tp | fp | fn | tn |', '|---|---|---|---|---|---|---|');
    for (const t of s.stage1_threshold_sweep) {
      lines.push(`| ${t.threshold} | ${t.recall.toFixed(3)} | ${t.precision.toFixed(3)} | ${t.tp} | ${t.fp} | ${t.fn} | ${t.tn} |`);
    }
    lines.push('', '### Per-relation precision/recall', '', '| label | support | precision | recall |', '|---|---|---|---|');
    for (const c of s.relation_confusion.perClass) {
      lines.push(`| ${c.label} | ${c.support} | ${c.precision.toFixed(3)} | ${c.recall.toFixed(3)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  loadEnvFile(process.env.R2MCP_ENV_FILE ?? '.env');
  const args = parseArgs(process.argv.slice(2));
  const allRecords = loadCorpus(args.corpusPath);
  const records = allRecords.slice(0, args.limit);

  const results: Record<string, ReturnType<typeof summarize>> = {};

  for (const backend of args.backends) {
    if (backend === 'llm-path') {
      const judgments = await runLlmPath(records);
      results[backend] = summarize(judgments);
      continue;
    }

    const factory = CLASSIFIER_REGISTRY[backend];
    if (!factory) {
      throw new Error(
        `Unknown backend "${backend}". Available: llm-path, ${Object.keys(CLASSIFIER_REGISTRY).join(', ')}.`,
      );
    }
    const provider = await factory(args.corpusSource);
    assertEgressAllowed(provider, args.corpusSource);
    const judgments = await runClassifierBackend(provider, records);
    results[backend] = summarize(judgments);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve('data/classifier-eval/results', timestamp);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ timestamp, corpus: args.corpusPath, limit: args.limit, results }, null, 2), 'utf-8');
  writeFileSync(join(outDir, 'summary.md'), toMarkdown(timestamp, args.corpusPath, results), 'utf-8');

  process.stdout.write(
    JSON.stringify({ evaluated_pairs: records.length, backends: args.backends, out_dir: outDir }, null, 2) + '\n',
  );
}

main().catch((err) => {
  if (err instanceof ProviderUnavailableError) {
    process.stderr.write(`${err.message}\n`);
  } else {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exit(1);
});
