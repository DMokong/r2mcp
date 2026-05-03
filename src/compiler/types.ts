/**
 * Shared types for the wiki compile step (SPEC-044 Section B).
 */

import type { LLMProvider } from '../providers/types.js';

export type Tier = 'preferences' | 'project-context' | 'conversations';

/** A memory row as the compiler sees it — only the fields synthesis needs. */
export interface MemoryForCompile {
  id: string;
  tier: Tier;
  type: string;
  content: string;
  topics: string[];
  people: string[];
  created_at: string;
  /** Optional inbound supersedes/contradicts edges for prose framing (B.R9). */
  edges?: EdgeForCompile[];
}

export interface EdgeForCompile {
  from_memory_id: string;
  to_memory_id: string;
  relation: 'supports' | 'contradicts' | 'supersedes' | 'evolved_into' | 'depends_on' | 'related_to';
  rationale: string;
  confidence: number;
}

export interface CompileFrontmatter {
  generated_at: string;
  compile_run_id: string;
  source_count: number;
  source_memory_ids: string[];
  provider: string;
  source_git_sha: string | null;
  tier?: Tier;
  topic?: string;
}

export interface CompileTierInput {
  tier: Tier;
  memories: MemoryForCompile[];
  provider: LLMProvider;
  runId: string;
  /** If exceeded mid-run, the compile exits gracefully with hit_cost_cap=true. */
  maxCostUsd: number;
  /** Counter shared with the orchestrator so cap is enforced across tiers. */
  costMeter: { totalCostUsd: number; hitCap: boolean };
}

export interface CompileTopicInput {
  topic: string;
  memories: MemoryForCompile[];
  provider: LLMProvider;
  runId: string;
  maxCostUsd: number;
  costMeter: { totalCostUsd: number; hitCap: boolean };
}

export interface CompileSectionResult {
  /** Full markdown body (frontmatter prepended by caller). */
  body: string;
  /** Memory IDs that contributed to this section (for frontmatter, B.R3). */
  source_memory_ids: string[];
  /** Set of `## H2` and `### H3` headers (B.R5/B.AC3 stability check). */
  headers: string[];
  /** Cost spent producing this section. */
  cost_usd: number;
  /** True when the run hit `maxCostUsd` mid-synthesis. */
  partial: boolean;
}

export interface CompileSummary {
  run_id: string;
  started_at: string;
  ended_at: string;
  files_written: string[];
  files_deleted: string[];
  total_cost_usd: number;
  hit_cost_cap: boolean;
  provider: string;
  source_git_sha: string | null;
  /** Path to the manifest written this run. */
  manifest_path: string;
  /** True for dry-run; preview emitted to stdout. */
  dry_run: boolean;
}

export interface CompileManifest {
  run_id: string;
  generated_at: string;
  /** Per-tier files written this run, with their `source_memory_ids`. */
  tiers: Array<{ tier: Tier; path: string; source_memory_ids: string[] }>;
  /** Per-topic files written this run. */
  topics: Array<{ topic: string; path: string; source_memory_ids: string[] }>;
}
