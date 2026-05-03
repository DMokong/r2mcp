/**
 * Compile orchestrator — composes tier and topic synthesis, writes files,
 * cleans stale outputs, and produces the run summary.
 *
 * `runCompile()` is dependency-injected so tests can run it without a DB:
 * pass in the memory list and a mocked LLMProvider, get back the summary
 * plus an in-memory file map for assertions.
 */

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { compileTier } from './tier.js';
import { compileTopic } from './topic.js';
import { topicToSlug } from './clustering.js';
import { emitFrontmatter } from './frontmatter.js';
import {
  computeStaleFiles,
  deleteStaleFiles,
  manifestPath,
  readManifest,
  writeManifest,
} from './manifest.js';
import type {
  CompileFrontmatter,
  CompileManifest,
  CompileSummary,
  MemoryForCompile,
  Tier,
} from './types.js';
import type { LLMProvider } from '../providers/types.js';

const TIERS: ReadonlyArray<Tier> = ['preferences', 'project-context', 'conversations'];

export interface RunCompileOptions {
  /** Compile a single tier. Mutually exclusive with `all` and `topic`. */
  tier?: Tier;
  /** Compile all three tiers. */
  all?: boolean;
  /** Compile a single topic page. Mutually exclusive with `tier` and `all`. */
  topic?: string;
  /** When true, emit preview to stdout and write no files. */
  dryRun?: boolean;
  /** Maximum total cost across all sections in the run. */
  maxCostUsd: number;
  runId: string;
  startedAt: string;
  /** git rev-parse HEAD of the host repo, or null. */
  sourceGitSha: string | null;
  /** Compiled output directory. Default: `<projectRoot>/memory/compiled/`. */
  compiledDir: string;
}

export interface RunCompileDeps {
  /**
   * Returns the memories visible to compile. CLI implementations pass a DB
   * query; tests inject synthetic data.
   */
  loadMemories: () => Promise<MemoryForCompile[]>;
  provider: LLMProvider;
  /**
   * Test seam — replaces `writeFile`/`rm` calls with in-memory recording.
   * Default: real filesystem.
   */
  fs?: CompileFs;
  /** Test seam for stdout (dry-run preview). Default: process.stdout.write. */
  stdout?: (chunk: string) => void;
}

export interface CompileFs {
  ensureDir: (path: string) => Promise<void>;
  writeFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  readManifest: (compiledDir: string) => Promise<CompileManifest | null>;
  writeManifest: (compiledDir: string, manifest: CompileManifest) => Promise<string>;
  exists: (path: string) => boolean;
}

const realFs: CompileFs = {
  ensureDir: (p) => mkdir(p, { recursive: true }).then(() => undefined),
  writeFile: (p, c) => writeFile(p, c, 'utf-8'),
  deleteFile: (p) => existsSync(p) ? rm(p, { force: true }) : Promise.resolve(),
  readManifest,
  writeManifest,
  exists: existsSync,
};

export async function runCompile(opts: RunCompileOptions, deps: RunCompileDeps): Promise<CompileSummary> {
  const fs = deps.fs ?? realFs;
  const stdout = deps.stdout ?? ((s) => process.stdout.write(s));
  validateOptions(opts);

  const memories = await deps.loadMemories();
  const costMeter = { totalCostUsd: 0, hitCap: false };

  const filesWritten: string[] = [];
  const filesDeleted: string[] = [];

  const newManifest: CompileManifest = {
    run_id: opts.runId,
    generated_at: opts.startedAt,
    tiers: [],
    topics: [],
  };
  const tiersInScope: Tier[] = [];
  const topicsInScope: string[] = [];

  // ---- Tier compile ----
  const tiersToBuild: Tier[] = opts.all ? [...TIERS] : opts.tier ? [opts.tier] : [];
  for (const tier of tiersToBuild) {
    if (costMeter.hitCap) break;
    tiersInScope.push(tier);
    const tierMemories = memories.filter((m) => m.tier === tier && m.type !== 'archived');
    const result = await compileTier({
      tier,
      memories: tierMemories,
      provider: deps.provider,
      runId: opts.runId,
      maxCostUsd: opts.maxCostUsd,
      costMeter,
    });
    const fm: CompileFrontmatter = {
      generated_at: opts.startedAt,
      compile_run_id: opts.runId,
      source_count: result.source_memory_ids.length,
      source_memory_ids: result.source_memory_ids,
      provider: deps.provider.name,
      source_git_sha: opts.sourceGitSha,
      tier,
    };
    const fileContent = emitFrontmatter(fm) + '\n' + result.body;
    const relPath = `${tier}.md`;
    const absPath = resolve(opts.compiledDir, relPath);
    if (opts.dryRun) {
      stdout(`\n--- DRY RUN: ${relPath} ---\n`);
      stdout(fileContent);
    } else {
      await fs.ensureDir(opts.compiledDir);
      await fs.writeFile(absPath, fileContent);
      filesWritten.push(absPath);
    }
    newManifest.tiers.push({ tier, path: relPath, source_memory_ids: result.source_memory_ids });
  }

  // ---- Topic compile ----
  if (opts.topic) {
    topicsInScope.push(opts.topic);
    const slug = topicToSlug(opts.topic);
    const result = await compileTopic({
      topic: opts.topic,
      memories: memories.filter((m) => m.type !== 'archived'),
      provider: deps.provider,
      runId: opts.runId,
      maxCostUsd: opts.maxCostUsd,
      costMeter,
    });
    const fm: CompileFrontmatter = {
      generated_at: opts.startedAt,
      compile_run_id: opts.runId,
      source_count: result.source_memory_ids.length,
      source_memory_ids: result.source_memory_ids,
      provider: deps.provider.name,
      source_git_sha: opts.sourceGitSha,
      topic: opts.topic,
    };
    const fileContent = emitFrontmatter(fm) + '\n' + result.body;
    const relPath = join('topics', `${slug}.md`);
    const absPath = resolve(opts.compiledDir, relPath);
    if (opts.dryRun) {
      stdout(`\n--- DRY RUN: ${relPath} ---\n`);
      stdout(fileContent);
    } else {
      await fs.ensureDir(dirname(absPath));
      await fs.writeFile(absPath, fileContent);
      filesWritten.push(absPath);
    }
    newManifest.topics.push({ topic: opts.topic, path: relPath, source_memory_ids: result.source_memory_ids });
  }

  // ---- Manifest + stale cleanup ----
  let manifestAbs = manifestPath(opts.compiledDir);
  if (!opts.dryRun && filesWritten.length > 0) {
    // Merge with prior manifest entries that we DIDN'T touch this run, so a
    // tier-only invocation doesn't drop unrelated topic entries.
    const prev = await fs.readManifest(opts.compiledDir);
    const merged = mergeManifest(prev, newManifest, { tiersTouched: tiersInScope, topicsTouched: topicsInScope });
    const stale = computeStaleFiles(prev, merged, {
      tiers: tiersInScope,
      topics: topicsInScope,
      allTopics: false,
    });
    for (const rel of stale) {
      const abs = resolve(opts.compiledDir, rel);
      await fs.deleteFile(abs);
      filesDeleted.push(abs);
    }
    manifestAbs = await fs.writeManifest(opts.compiledDir, merged);
  }

  return {
    run_id: opts.runId,
    started_at: opts.startedAt,
    ended_at: new Date().toISOString(),
    files_written: filesWritten.map((p) => relative(opts.compiledDir, p)),
    files_deleted: filesDeleted.map((p) => relative(opts.compiledDir, p)),
    total_cost_usd: costMeter.totalCostUsd,
    hit_cost_cap: costMeter.hitCap,
    provider: deps.provider.name,
    source_git_sha: opts.sourceGitSha,
    manifest_path: manifestAbs,
    dry_run: !!opts.dryRun,
  };
}

function validateOptions(opts: RunCompileOptions): void {
  const modes = [opts.tier, opts.all, opts.topic].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error('compile() requires exactly one of: tier, all, topic');
  }
}

/**
 * Combine a fresh per-tier/per-topic manifest with the prior run's manifest,
 * keeping prior entries that weren't in this run's scope. Per-tier or per-
 * topic compiles don't wipe untouched entries (B.R8 nuance).
 */
function mergeManifest(
  prev: CompileManifest | null,
  next: CompileManifest,
  scope: { tiersTouched: Tier[]; topicsTouched: string[] },
): CompileManifest {
  if (!prev) return next;
  const merged: CompileManifest = {
    run_id: next.run_id,
    generated_at: next.generated_at,
    tiers: [...next.tiers],
    topics: [...next.topics],
  };
  // Keep prior tier entries we didn't touch
  for (const t of prev.tiers) {
    if (!scope.tiersTouched.includes(t.tier)) merged.tiers.push(t);
  }
  // Keep prior topic entries we didn't touch
  for (const t of prev.topics) {
    if (!scope.topicsTouched.includes(t.topic)) merged.topics.push(t);
  }
  return merged;
}
