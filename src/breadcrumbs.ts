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
  | {
      tool:
        | 'search'
        | 'stats'
        | 'meditate'
        | 'reject'
        | 'compile'
        | 'classify'
        | 'dump_edges_sidecar';
      response: unknown;
      args: unknown;
    };

// Minimal structural shapes the mappers need. We do NOT re-export the full tool
// schemas — only the fields the breadcrumb logic inspects.

/**
 * Minimal structural shape of a single recall result. Mirrors
 * `RecallResult` in src/tools/recall.ts — the only fields the breadcrumb
 * logic reads. The per-result `signals` field claimed by earlier drafts
 * of this file does NOT exist on the real response; signals are top-level.
 */
export interface RecallResultItem {
  id: string;
  content: string;
}

/**
 * Recall response signal — flat shape from src/edges/types.ts `RecallSignal`.
 * `from_id` is the memory in the recall results whose edge produced the
 * signal; `to_id` is the partner on the other end.
 */
export interface RecallSignal {
  kind: 'contradicts' | 'superseded_by';
  from_id: string;
  to_id: string;
}

export interface RecallResponse {
  results: RecallResultItem[];
  search_mode: string;
  tiers_searched: string[];
  /** Top-level signals array per SPEC-044; elided when empty (claw-ohhj.3). */
  signals?: RecallSignal[];
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

/**
 * Mirrors `RememberResult` in src/tools/remember.ts. The remember handler
 * sets `id` (no `memory_id`); the breadcrumb mapper reads `id` only.
 */
export interface RememberResponse {
  operation: string;
  id?: string;
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
    super(
      `Invalid breadcrumb: field "${field}" must be a non-empty string; got ${JSON.stringify(value)}`,
    );
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

// Per-tool mappers.
function mapRecall(ctx: Extract<BreadcrumbContext, { tool: 'recall' }>): Breadcrumb[] {
  // Production shape (SPEC-044): RecallResponse.signals is a TOP-LEVEL flat
  // array of {kind, from_id, to_id, ...}. The earlier nested per-result
  // `r.signals.contradictions[]` shape claimed by this mapper never existed
  // on the real response — see claw-sup7.
  const seen = new Set<string>();
  const breadcrumbs: Breadcrumb[] = [];
  for (const s of ctx.response.signals ?? []) {
    if (s.kind !== 'contradicts') continue;
    if (seen.has(s.from_id)) continue;
    seen.add(s.from_id);
    breadcrumbs.push({
      name: 'lint',
      usage: `lint --check=contradictions --memory-id=${s.from_id}`,
      why: 'recall flagged a contradiction on this memory; lint diagnoses it',
    });
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
    if (b[1] !== a[1]) return b[1] - a[1]; // descending count
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; // alpha tiebreak
  });
  return ordered.map(([topic]) => ({
    name: 'compile',
    usage: `compile --topic=${topic}`,
    why: 'Contradictions on this topic; recompile the wiki view',
  }));
}
const QUERY_SNIPPET_MAX = 80;

function mapRemember(ctx: Extract<BreadcrumbContext, { tool: 'remember' }>): Breadcrumb[] {
  // Production shape: RememberResult exposes `id` only (no `memory_id`).
  // The breadcrumb fires for ADD/UPDATE/REJECTION (which set id) and skips
  // NOOP / unresolved ARCHIVE (which leave id undefined). claw-sup7.
  if (!ctx.response.id) return [];
  const content = (ctx.args as RememberArgs).content ?? '';
  if (!content.trim()) return [];

  const snippet = content.slice(0, QUERY_SNIPPET_MAX).replace(/\s+/g, ' ').trim();
  const tier = (ctx.args as RememberArgs).tier;
  const usage = tier
    ? `recall --query=${JSON.stringify(snippet)} --tier=${tier}`
    : `recall --query=${JSON.stringify(snippet)}`;
  return [
    {
      name: 'recall',
      usage,
      why: 'Verify the memory was indexed correctly',
    },
  ];
}
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
    return a.canonical_name < b.canonical_name ? -1 : a.canonical_name > b.canonical_name ? 1 : 0;
  });
  const top = ranked[0];
  return [
    {
      name: 'recall',
      usage: `recall --entity=${top.canonical_name}`,
      why: 'Confirm the newly extracted entity links to expected memories',
    },
  ];
}

function dispatchMapper(ctx: BreadcrumbContext): Breadcrumb[] {
  switch (ctx.tool) {
    case 'recall':
      return mapRecall(ctx);
    case 'lint':
      return mapLint(ctx);
    case 'remember':
      return mapRemember(ctx);
    case 'extract_entities':
      return mapExtractEntities(ctx);
    // No-signal tools always return empty for Phase 5 — see R4.
    default:
      return [];
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
