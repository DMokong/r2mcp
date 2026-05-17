/**
 * Compile manifest — written each run. Stale-cleanup logic uses it to delete
 * compiled files that are no longer covered by the latest manifest (B.R8).
 *
 * Per-tier and per-topic invocations only update their own scoped entries.
 * A full `compile({all: true})` rewrites everything in scope.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { CompileManifest, Tier } from './types.js';

const MANIFEST_FILENAME = 'manifest.json';

export function manifestPath(compiledDir: string): string {
  return join(compiledDir, MANIFEST_FILENAME);
}

export async function readManifest(compiledDir: string): Promise<CompileManifest | null> {
  const p = manifestPath(compiledDir);
  if (!existsSync(p)) return null;
  try {
    const raw = await readFile(p, 'utf-8');
    return JSON.parse(raw) as CompileManifest;
  } catch {
    return null;
  }
}

export async function writeManifest(
  compiledDir: string,
  manifest: CompileManifest,
): Promise<string> {
  const p = manifestPath(compiledDir);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(manifest, null, 2), 'utf-8');
  return p;
}

/**
 * Compute the set of files in `prev` that are NOT in `next` and should be
 * deleted (B.AC8). Honors per-tier / per-topic scope: if `next` only updates
 * the `preferences` tier and the `wiki-mode` topic, don't delete entries
 * for other tiers or topics.
 *
 * `scope` lists what was updated this run:
 *   - `tiers`: which tier paths were rewritten
 *   - `topics`: which topic slugs were rewritten
 *   - `allTiers`: true if this was a full compile and ALL tiers should be
 *     considered in scope (so dropped tiers also get cleaned up — but in
 *     practice the three tier names are fixed)
 *   - `allTopics`: true if topic-set was rewritten as a whole; tiers/topics
 *     not in `next` and present in `prev` get deleted
 */
export function computeStaleFiles(
  prev: CompileManifest | null,
  next: CompileManifest,
  scope: { tiers: Tier[]; topics: string[]; allTopics: boolean },
): string[] {
  if (!prev) return [];
  const stale = new Set<string>();
  const nextTierPaths = new Set(next.tiers.map((t) => t.path));
  const nextTopicPaths = new Set(next.topics.map((t) => t.path));

  // Tier files: only candidates within our scope.
  for (const t of prev.tiers) {
    if (!scope.tiers.includes(t.tier)) continue;
    if (!nextTierPaths.has(t.path)) stale.add(t.path);
  }

  // Topic files: if allTopics, every prev topic that's not in next is stale.
  // Otherwise, only the topics named in scope.topics.
  for (const t of prev.topics) {
    if (scope.allTopics) {
      if (!nextTopicPaths.has(t.path)) stale.add(t.path);
    } else if (scope.topics.includes(t.topic)) {
      if (!nextTopicPaths.has(t.path)) stale.add(t.path);
    }
  }
  return [...stale];
}

export async function deleteStaleFiles(compiledDir: string, paths: string[]): Promise<void> {
  for (const rel of paths) {
    const abs = resolve(compiledDir, rel);
    if (existsSync(abs)) {
      await rm(abs, { force: true });
    }
  }
}
