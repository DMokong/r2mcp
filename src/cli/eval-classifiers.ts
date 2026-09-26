#!/usr/bin/env tsx
/**
 * Classifier shadow-eval runner (trk-7mx.1).
 *
 * Scores one or more backends against a shared corpus:
 *   - 'llm-path'  — the existing Stage 1 (Haiku/Sonnet) + Stage 2 (Opus) LLM
 *                   path, via the real LLMProvider selection logic.
 *   - any registered ClassifierProvider ('fake', 'openjev', 'typesafe', 'llm-enum').
 *
 * Ground truth (review round 2, fix #2 — the DB's own memory_edges/Stage-1
 * rejections are the pipeline's own past output, not independent labels):
 *   - the public fixture's expected_relation is hand-labelled — independent.
 *   - a DB-sampled corpus scored with --labels=PATH uses ONLY those human
 *     spot-check labels as ground truth (unlabelled pairs are excluded, not
 *     guessed).
 *   - a DB-sampled corpus with no --labels still runs, but is reported as
 *     "agreement with the current pipeline", explicitly NOT accuracy.
 *
 * Every backend is scored on three separate views (fix #5): Stage 1 alone,
 * a Stage-2 fixed cohort (every relation-labelled pair, independent of what
 * Stage 1 decided), and the end-to-end cascade (a Stage-1 reject counts as a
 * 'none' prediction). Stage-1 and Stage-2 calibration/temperature are
 * reported separately (fix #6).
 *
 * Usage:
 *   npm run eval:classifiers -- [--corpus=PATH] [--backends=llm-path,fake]
 *                               [--limit=N] [--labels=PATH]
 *   Corpus provenance is never a flag (fix #3): only the committed public
 *   fixture, verified by real path AND a pinned content hash, is 'public-fixture'.
 *   Everything else is 'db-sample'.
 *
 * EGRESS: a DB-sampled corpus is refused for any remote 'typesafe' backend —
 * see src/classifiers/eval/egress-guard.ts. This is a hard rule, not advisory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from '../env.js';
import { selectProvider, ProviderUnavailableError } from '../providers/index.js';
import { stage1HaikuFilter } from '../edges/stage1-haiku.js';
import { stage2OpusClassify, STAGE2_RELATIONS } from '../edges/stage2-opus.js';
import type { ClassifierProvider } from '../classifiers/types.js';
import { classifyStage1AsNoul, classifyStage2AsChoice, type PairContent } from '../classifiers/eval/adapters.js';
import { createFakeClassifierProvider } from '../classifiers/eval/fake-provider.js';
import { LLMEnumClassifier, OpenJevClassifier, TypeSafeClassifier } from '../classifiers/index.js';
import { assertEgressAllowed, type CorpusSource } from '../classifiers/eval/egress-guard.js';
import { determineCorpusSource } from '../classifiers/eval/provenance.js';
import { assertSafeDataPath } from '../classifiers/eval/safe-write.js';
import {
  normalizeDbRecord,
  normalizeFixtureRecord,
  parseHumanLabels,
  type CorpusRecord,
} from '../classifiers/eval/corpus-schema.js';
import {
  emptyAccumulator,
  judgeRecord,
  pushJudgments,
  stage2IsNeeded,
  type JudgmentAccumulator,
} from '../classifiers/eval/judgments.js';
import {
  sweepStage1Thresholds,
  relationConfusionMatrix,
  expectedCalibrationError,
  fitTemperature,
  latencyPercentiles,
  costPer1kUsd,
  type RelationLabel,
} from '../classifiers/eval-metrics.js';

/** ClassifierProvider backends the runner can compare against the llm-path. */
const CLASSIFIER_REGISTRY: Record<string, (source: CorpusSource) => Promise<ClassifierProvider>> = {
  fake: async () => createFakeClassifierProvider(),
  openjev: async () => new OpenJevClassifier(),
  // Bound to the corpus provenance: construction throws for anything but a public source.
  typesafe: async (source) => new TypeSafeClassifier({ scope: source }),
  'llm-enum': async () => new LLMEnumClassifier(await selectProvider()),
};

type GroundTruthMode = 'fixture' | 'labels' | 'pipeline';

interface CliArgs {
  corpusPath: string;
  backends: string[];
  limit: number;
  labelsPath?: string;
}

function flagValue(argv: string[], name: string): string | undefined {
  return argv.find((a) => a.startsWith(`${name}=`))?.split('=').slice(1).join('=');
}

function parseArgs(argv: string[]): CliArgs {
  const corpusPath = flagValue(argv, '--corpus') ?? 'data/classifier-eval/corpus.jsonl';
  const backends = (flagValue(argv, '--backends') ?? 'llm-path,fake').split(',').map((b) => b.trim());
  const limit = Number(flagValue(argv, '--limit') ?? '10');
  const labelsPath = flagValue(argv, '--labels');
  return { corpusPath, backends, limit, labelsPath };
}

function loadCorpus(path: string, corpusSource: CorpusSource): CorpusRecord[] {
  if (!existsSync(path)) {
    throw new Error(`Corpus not found: ${path}. Run 'npm run eval:corpus' first.`);
  }
  const lines = readFileSync(path, 'utf-8')
    .split('\n')
    .filter((l) => l.trim());
  return lines.map((line, i) => {
    const raw = JSON.parse(line);
    return corpusSource === 'public-fixture' ? normalizeFixtureRecord(raw, i + 1) : normalizeDbRecord(raw, i + 1);
  });
}

function resolveGroundTruth(
  rec: CorpusRecord,
  mode: GroundTruthMode,
  labels: Map<string, RelationLabel> | null,
): { relation: RelationLabel | null; stage1Pass: boolean | null } {
  if (mode === 'pipeline') {
    // Circular: the pipeline's own past output. Kept, but the report must head this as
    // "agreement", never "accuracy" (fix #2).
    return { relation: rec.relation, stage1Pass: rec.stage1_pass };
  }
  const relation = mode === 'fixture' ? rec.relation : (labels?.get(rec.pair_id) ?? null);
  return { relation, stage1Pass: relation === null ? null : relation !== 'none' };
}

function groundTruthMode(corpusSource: CorpusSource, labelsPath: string | undefined): GroundTruthMode {
  if (corpusSource === 'public-fixture') return 'fixture';
  return labelsPath ? 'labels' : 'pipeline';
}

function groundTruthNote(mode: GroundTruthMode): string {
  if (mode === 'fixture') return 'Ground truth: hand-labelled public fixture (independent).';
  if (mode === 'labels') {
    return 'Ground truth: human spot-check labels (--labels), independent. Pairs without a human label are excluded.';
  }
  return (
    'WARNING: no --labels provided — these numbers are AGREEMENT WITH THE CURRENT PIPELINE ' +
    "(its own past Stage-1/Stage-2 output), NOT accuracy. Pass --labels=PATH with hand-labelled " +
    'ground truth (e.g. a completed spot-check.jsonl) for real accuracy.'
  );
}

interface BackendJudgments extends JudgmentAccumulator {
  groundTruthMode: GroundTruthMode;
  latenciesMs: number[];
  totalCostUsd: number;
  judgmentCount: number;
}

function emptyJudgments(mode: GroundTruthMode): BackendJudgments {
  return { ...emptyAccumulator(), groundTruthMode: mode, latenciesMs: [], totalCostUsd: 0, judgmentCount: 0 };
}

async function runLlmPath(records: CorpusRecord[], mode: GroundTruthMode, labels: Map<string, RelationLabel> | null): Promise<BackendJudgments> {
  const provider = await selectProvider();
  const out = emptyJudgments(mode);

  for (const rec of records) {
    const gt = resolveGroundTruth(rec, mode, labels);
    const pair = { from: rec.from, to: rec.to };

    // Time every call externally (fix #7) — stage1HaikuFilter/stage2OpusClassify
    // don't surface the provider's own latency_ms in their return type.
    const s1Start = Date.now();
    const s1 = await stage1HaikuFilter(provider, pair);
    out.latenciesMs.push(Date.now() - s1Start);
    out.totalCostUsd += s1.cost_usd;
    out.judgmentCount++;

    let stage2: { relation: RelationLabel; confidence: number } | undefined;
    if (stage2IsNeeded(s1.pass ? 1 : 0, gt.relation)) {
      const s2Start = Date.now();
      const s2 = await stage2OpusClassify(provider, pair);
      out.latenciesMs.push(Date.now() - s2Start);
      out.totalCostUsd += s2.cost_usd;
      out.judgmentCount++;
      // The raw LLM path returns only a top-1 confidence, no full distribution —
      // stage2Temperature is only populated when one is available.
      stage2 = { relation: s2.relation, confidence: s2.confidence };
    }

    pushJudgments(
      out,
      judgeRecord({
        pairId: rec.pair_id,
        groundTruthRelation: gt.relation,
        groundTruthStage1Pass: gt.stage1Pass,
        stage1Probability: s1.pass ? 1 : 0,
        stage2,
      }),
    );
  }
  return out;
}

async function runClassifierBackend(
  provider: ClassifierProvider,
  records: CorpusRecord[],
  mode: GroundTruthMode,
  labels: Map<string, RelationLabel> | null,
): Promise<BackendJudgments> {
  const out = emptyJudgments(mode);

  for (const rec of records) {
    const gt = resolveGroundTruth(rec, mode, labels);
    const pair: PairContent = { from: rec.from, to: rec.to };

    const s1 = await classifyStage1AsNoul(provider, pair);
    out.totalCostUsd += s1.cost_usd;
    out.judgmentCount++;
    out.latenciesMs.push(s1.latency_ms);

    let stage2: { relation: RelationLabel; confidence: number; probabilities: Record<string, number> } | undefined;
    if (stage2IsNeeded(s1.probability, gt.relation)) {
      const s2 = await classifyStage2AsChoice(provider, pair);
      out.totalCostUsd += s2.cost_usd;
      out.judgmentCount++;
      out.latenciesMs.push(s2.latency_ms);
      stage2 = { relation: s2.relation, confidence: s2.confidence, probabilities: s2.probabilities };
    }

    pushJudgments(
      out,
      judgeRecord({
        pairId: rec.pair_id,
        groundTruthRelation: gt.relation,
        groundTruthStage1Pass: gt.stage1Pass,
        stage1Probability: s1.probability,
        stage2,
      }),
    );
  }
  return out;
}

function summarize(j: BackendJudgments) {
  const thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  return {
    ground_truth_mode: j.groundTruthMode,
    ground_truth_note: groundTruthNote(j.groundTruthMode),
    stage1: {
      threshold_sweep: sweepStage1Thresholds(j.stage1, thresholds),
      calibration: expectedCalibrationError(j.stage1Calibration, 10),
    },
    stage2_fixed_cohort: {
      confusion: relationConfusionMatrix(j.stage2, STAGE2_RELATIONS),
      calibration: expectedCalibrationError(j.stage2Calibration, 10),
      temperature_fit: j.stage2Temperature.length > 0 ? fitTemperature(j.stage2Temperature) : null,
    },
    cascade: {
      confusion: relationConfusionMatrix(j.cascade, STAGE2_RELATIONS),
    },
    latency: latencyPercentiles(j.latenciesMs),
    cost_per_1k_usd: costPer1kUsd(j.totalCostUsd, j.judgmentCount),
    total_cost_usd: j.totalCostUsd,
    judgment_count: j.judgmentCount,
  };
}

function toMarkdown(timestamp: string, corpusPath: string, results: Record<string, ReturnType<typeof summarize>>): string {
  const lines: string[] = [`# Classifier eval — ${timestamp}`, '', `Corpus: \`${corpusPath}\``, ''];
  for (const [backend, s] of Object.entries(results)) {
    lines.push(`## ${backend}`, '', `> ${s.ground_truth_note}`, '');
    lines.push(`- Judgments: ${s.judgment_count}, total cost: $${s.total_cost_usd.toFixed(4)}, cost/1k: $${s.cost_per_1k_usd.toFixed(2)}`);
    lines.push(`- Latency p50/p95: ${s.latency.p50.toFixed(0)}ms / ${s.latency.p95.toFixed(0)}ms`);

    lines.push('', '### Stage 1 (structural pre-filter)', '');
    lines.push(`- Calibration ECE (10 bins): ${s.stage1.calibration.ece.toFixed(4)}`);
    lines.push('', '| threshold | recall | precision | tp | fp | fn | tn |', '|---|---|---|---|---|---|---|');
    for (const t of s.stage1.threshold_sweep) {
      lines.push(`| ${t.threshold} | ${t.recall.toFixed(3)} | ${t.precision.toFixed(3)} | ${t.tp} | ${t.fp} | ${t.fn} | ${t.tn} |`);
    }

    lines.push('', '### Stage 2 — fixed cohort (every relation-labelled pair, independent of Stage 1)', '');
    lines.push(`- Calibration ECE (10 bins): ${s.stage2_fixed_cohort.calibration.ece.toFixed(4)}`);
    if (s.stage2_fixed_cohort.temperature_fit) {
      const t = s.stage2_fixed_cohort.temperature_fit;
      lines.push(`- Temperature fit: T=${t.temperature.toFixed(2)} (NLL ${t.nllBefore.toFixed(3)} → ${t.nllAfter.toFixed(3)})`);
    }
    lines.push('', '| label | support | precision | recall |', '|---|---|---|---|');
    for (const c of s.stage2_fixed_cohort.confusion.perClass) {
      lines.push(`| ${c.label} | ${c.support} | ${c.precision.toFixed(3)} | ${c.recall.toFixed(3)} |`);
    }

    lines.push('', '### End-to-end cascade (Stage-1 reject counts as a "none" prediction)', '');
    lines.push('| label | support | precision | recall |', '|---|---|---|---|');
    for (const c of s.cascade.confusion.perClass) {
      lines.push(`| ${c.label} | ${c.support} | ${c.precision.toFixed(3)} | ${c.recall.toFixed(3)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  loadEnvFile(process.env.R2MCP_ENV_FILE ?? '.env');
  const args = parseArgs(process.argv.slice(2));
  const corpusSource = determineCorpusSource(args.corpusPath);
  const mode = groundTruthMode(corpusSource, args.labelsPath);
  const labels = args.labelsPath ? parseHumanLabels(readFileSync(args.labelsPath, 'utf-8')) : null;

  const allRecords = loadCorpus(args.corpusPath, corpusSource);
  const records = allRecords.slice(0, args.limit);

  const results: Record<string, ReturnType<typeof summarize>> = {};

  for (const backend of args.backends) {
    if (backend === 'llm-path') {
      const judgments = await runLlmPath(records, mode, labels);
      results[backend] = summarize(judgments);
      continue;
    }

    const factory = CLASSIFIER_REGISTRY[backend];
    if (!factory) {
      throw new Error(
        `Unknown backend "${backend}". Available: llm-path, ${Object.keys(CLASSIFIER_REGISTRY).join(', ')}.`,
      );
    }
    const provider = await factory(corpusSource);
    assertEgressAllowed(provider, corpusSource);
    const judgments = await runClassifierBackend(provider, records, mode, labels);
    results[backend] = summarize(judgments);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = assertSafeDataPath(join('data', 'classifier-eval', 'results', timestamp));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ timestamp, corpus: args.corpusPath, limit: args.limit, ground_truth_mode: mode, results }, null, 2), 'utf-8');
  writeFileSync(join(outDir, 'summary.md'), toMarkdown(timestamp, args.corpusPath, results), 'utf-8');

  process.stdout.write(
    JSON.stringify({ evaluated_pairs: records.length, backends: args.backends, ground_truth_mode: mode, out_dir: outDir }, null, 2) + '\n',
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
