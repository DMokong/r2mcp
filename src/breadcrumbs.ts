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

export class InvalidBreadcrumbError extends Error {
  constructor(field: string, value: unknown) {
    super(`Invalid breadcrumb: field "${field}" must be a non-empty string; got ${JSON.stringify(value)}`);
    this.name = 'InvalidBreadcrumbError';
  }
}

export function assertBreadcrumb(b: unknown): asserts b is Breadcrumb {
  if (!b || typeof b !== 'object') {
    throw new InvalidBreadcrumbError('breadcrumb', b);
  }
  const obj = b as Record<string, unknown>;
  for (const field of ['name', 'usage', 'why'] as const) {
    const v = obj[field];
    if (typeof v !== 'string' || v.length === 0) {
      throw new InvalidBreadcrumbError(field, v);
    }
  }
}

export const MAX_BREADCRUMBS = 3;

// Per-tool mappers — defined in Tasks 4–7. Stubs for now so the dispatcher compiles.
function mapRecall(ctx: Extract<BreadcrumbContext, { tool: 'recall' }>): Breadcrumb[] {
  const seen = new Set<string>();
  const breadcrumbs: Breadcrumb[] = [];
  for (const r of ctx.response.results) {
    const cs = r.signals?.contradictions ?? [];
    for (const c of cs) {
      if (seen.has(c.memory_id)) continue;
      seen.add(c.memory_id);
      breadcrumbs.push({
        name: 'lint',
        usage: `lint --check=contradictions --memory-id=${c.memory_id}`,
        why: 'recall flagged a contradiction on this memory; lint diagnoses it',
      });
    }
  }
  return breadcrumbs;
}
function mapLint(ctx: Extract<BreadcrumbContext, { tool: 'lint' }>): Breadcrumb[] {
  // R6 truncation ranking: by descending contradiction count per topic; alphabetical for ties.
  const counts = new Map<string, number>();
  for (const f of ctx.response.findings) {
    if (f.check !== 'contradictions') continue;
    if (!f.topic) continue;
    counts.set(f.topic, (counts.get(f.topic) ?? 0) + 1);
  }
  const ordered = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];  // descending count
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;  // alpha tiebreak
  });
  return ordered.map(([topic]) => ({
    name: 'compile',
    usage: `compile --topic=${topic}`,
    why: 'Contradictions on this topic; recompile the wiki view',
  }));
}
function mapRemember(_ctx: Extract<BreadcrumbContext, { tool: 'remember' }>): Breadcrumb[] { return []; }
function mapExtractEntities(
  ctx: Extract<BreadcrumbContext, { tool: 'extract_entities' }>,
): Breadcrumb[] {
  // R4 trigger: entities_created > 0
  if ((ctx.response.entities_created ?? 0) <= 0) return [];
  const entities = ctx.response.new_entities ?? [];
  if (entities.length === 0) return [];

  // Open Question 3 resolution: pick by highest confidence; alphabetical tiebreak.
  const ranked = [...entities].sort((a, b) => {
    const ca = a.confidence ?? 0;
    const cb = b.confidence ?? 0;
    if (cb !== ca) return cb - ca;
    return a.canonical_name < b.canonical_name ? -1
         : a.canonical_name > b.canonical_name ? 1 : 0;
  });
  const top = ranked[0];
  return [{
    name: 'recall',
    usage: `recall --entity=${top.canonical_name}`,
    why: 'Confirm the newly extracted entity links to expected memories',
  }];
}

function dispatchMapper(ctx: BreadcrumbContext): Breadcrumb[] {
  switch (ctx.tool) {
    case 'recall': return mapRecall(ctx);
    case 'lint': return mapLint(ctx);
    case 'remember': return mapRemember(ctx);
    case 'extract_entities': return mapExtractEntities(ctx);
    // No-signal tools always return empty for Phase 5 — see R4.
    default: return [];
  }
}

export function withBreadcrumbs<T extends object>(
  response: T,
  context: BreadcrumbContext,
): T & { next_tools: Breadcrumb[] } {
  const candidates = dispatchMapper(context);
  // Validate each candidate before truncation — bad breadcrumbs throw at construction.
  for (const b of candidates) assertBreadcrumb(b);
  const next_tools = candidates.slice(0, MAX_BREADCRUMBS);
  return { ...response, next_tools };
}
