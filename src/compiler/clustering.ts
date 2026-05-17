/**
 * Deterministic memory grouping — used by both tier and topic compile to
 * keep section structure stable across runs (B.R5 / B.AC3).
 *
 * Clustering is computed from input only — the LLM never sees an
 * unsorted/unstable list, so its outputs cite the same memory IDs and
 * surface the same headers run-to-run.
 */

import type { MemoryForCompile } from './types.js';

export interface MemoryCluster {
  topic: string; // header label, deterministic
  topic_slug: string; // for IDs / anchors
  memories: MemoryForCompile[];
}

/**
 * Group memories by their first-listed topic, then sort:
 *   - clusters by topic name (alphabetical)
 *   - memories within each cluster by `id` (alphabetical, stable)
 *
 * Memories with no topics are grouped under "uncategorized".
 */
export function clusterByTopic(memories: MemoryForCompile[]): MemoryCluster[] {
  const buckets = new Map<string, MemoryForCompile[]>();
  for (const m of memories) {
    const topic = pickPrimaryTopic(m);
    const bucket = buckets.get(topic) ?? [];
    bucket.push(m);
    buckets.set(topic, bucket);
  }
  const clusters: MemoryCluster[] = [];
  for (const [topic, mems] of buckets) {
    clusters.push({
      topic,
      topic_slug: topicToSlug(topic),
      memories: [...mems].sort((a, b) => a.id.localeCompare(b.id)),
    });
  }
  return clusters.sort((a, b) => a.topic.localeCompare(b.topic));
}

/**
 * For topic-mode compile: filter to memories tagged with `topic`, sort by
 * `created_at` ascending (so Timeline section flows naturally), tiebreak by id.
 */
export function memoriesForTopic(memories: MemoryForCompile[], topic: string): MemoryForCompile[] {
  return memories
    .filter((m) => m.topics.includes(topic))
    .sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
      return a.id.localeCompare(b.id);
    });
}

function pickPrimaryTopic(m: MemoryForCompile): string {
  if (!m.topics || m.topics.length === 0) return 'uncategorized';
  // Pick the lexicographically smallest topic so the bucket is stable
  // even if topic order in the array changes.
  return [...m.topics].sort()[0];
}

export function topicToSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function topicTitle(topic: string): string {
  return topic
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
