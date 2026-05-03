/**
 * Lint surfaces structural feedback that `meditate()` could only express
 * implicitly. Five SQL-driven checks against memory_edges + memories — no
 * LLM calls (SPEC-044 C.R5).
 */

export type CheckName =
  | 'contradictions'
  | 'stale'
  | 'orphans'
  | 'drift'
  | 'superseded_unflagged';

/**
 * Suggested actions are a closed vocabulary so callers can route findings
 * without natural-language matching. Each check's findings draw from the
 * subset that fits its domain.
 */
export type SuggestedAction =
  | 'archive_one'           // for contradictions: archive one of the two memories
  | 'add_supersedes_edge'   // for contradictions: convert to supersedes if temporal
  | 'human_review'          // for contradictions or drift: needs human judgment
  | 'archive'               // for stale / orphans: archive the memory
  | 'reclassify'            // for drift: re-run the classifier on this pair
  | 'fix_edge_type';        // for superseded_unflagged: rewrite the edge type

export interface LintFinding {
  check: CheckName;
  memory_id: string;
  /** Optional companion memory when the finding is about a pair (contradictions, drift, superseded_unflagged). */
  related_memory_id?: string;
  rationale: string;
  suggested_action: SuggestedAction;
  /** Confidence score [0..1]. `lint --fix` only acts on findings >= 0.9. */
  confidence: number;
}

export interface LintSummary {
  total_findings: number;
  by_check: Record<CheckName, number>;
}

export interface LintInput {
  check?: CheckName;
  /** Used by stale check (default: 90 days). */
  since_days?: number;
  /** Cap findings per-check (default: 100). */
  limit?: number;
  /** When true, apply fixes for findings with confidence >= 0.9. */
  fix?: boolean;
}

export interface LintResult {
  summary: LintSummary;
  findings: LintFinding[];
  /** Per-finding action records when fix=true. */
  fixes_applied?: Array<{ memory_id: string; action: SuggestedAction }>;
}

export const ALL_CHECKS: ReadonlyArray<CheckName> = [
  'contradictions',
  'stale',
  'orphans',
  'drift',
  'superseded_unflagged',
];

export const FIX_CONFIDENCE_THRESHOLD = 0.9;
