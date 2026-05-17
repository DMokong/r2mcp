// src/breadcrumbs.ts
// SPEC-047 Phase 5 — Tool-response breadcrumbs (Tao of Mac: "servers plan, models walk").
// Pure, no I/O, no DB, no LLM. All decisions are inspection of (response, context).

/**
 * All r2mcp MCP tools that participate in the breadcrumb contract (R2).
 * Adding a new tool requires adding it here AND a BreadcrumbContext variant below.
 */
export type ToolName =
  | 'remember'
  | 'recall'
  | 'search'
  | 'stats'
  | 'meditate'
  | 'reject'
  | 'compile'
  | 'lint'
  | 'classify'
  | 'dump_edges_sidecar'
  | 'extract_entities';

/**
 * A single next-step recommendation. All three fields are required and must be non-empty.
 */
export interface Breadcrumb {
  name: string;
  usage: string;
  why: string;
}

/**
 * Per-tool context shape — discriminated union. Each variant carries the tool name plus
 * whatever args/response shape the mappers need to inspect for that tool.
 *
 * Tools NOT in the R4 mapping table (search, stats, meditate, reject, compile, classify,
 * dump_edges_sidecar) use `NoSignalContext` — they always return next_tools: [] for Phase 5.
 */
export type BreadcrumbContext =
  | { tool: 'recall'; response: RecallResponse; args: RecallArgs }
  | { tool: 'lint'; response: LintResponse; args: LintArgs }
  | { tool: 'remember'; response: RememberResponse; args: RememberArgs }
  | { tool: 'extract_entities'; response: ExtractEntitiesResponse; args: ExtractEntitiesArgs }
  | { tool: 'search' | 'stats' | 'meditate' | 'reject' | 'compile' | 'classify' | 'dump_edges_sidecar';
      response: unknown; args: unknown };

// Minimal structural shapes the mappers need. We do NOT re-export the full tool
// schemas — only the fields the breadcrumb logic inspects.

export interface RecallResultItem {
  id: string;
  content: string;
  signals?: { contradictions?: Array<{ memory_id: string; reason: string }> };
}

export interface RecallResponse {
  results: RecallResultItem[];
  total_results: number;
  search_mode: string;
  tiers_searched: string[];
  query: string;
  signals?: { contradictions?: Array<{ memory_id: string }> };
}

export interface RecallArgs {
  query?: string;
  entity?: string;
}

export interface LintFinding {
  check: string;
  memory_id: string;
  topic?: string;
  detail?: string;
}

export interface LintResponse {
  findings: LintFinding[];
  total_findings: number;
}

export interface LintArgs {
  check?: string;
}

export interface RememberResponse {
  operation: string;
  id?: string;
  memory_id?: string;
  message?: string;
}

export interface RememberArgs {
  tier?: string;
  content?: string;
}

export interface ExtractedEntitySummary {
  canonical_name: string;
  type: string;
  confidence?: number;
}

export interface ExtractEntitiesResponse {
  entities_created: number;
  entities_updated: number;
  new_entities?: ExtractedEntitySummary[];
  total_cost_usd?: number;
}

export interface ExtractEntitiesArgs {
  since_days?: number;
  full?: boolean;
}
