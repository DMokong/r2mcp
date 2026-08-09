import type { LogicalModel } from './providers/types.js';

/**
 * Model tier resolution (claw-x1mg).
 *
 * Every LLM call site used to hardcode its logical model (`model: 'haiku'`),
 * which meant changing the model for a scheduled job required a source edit,
 * a version bump, a publish, and a re-vendor. Worse, each site repeated the
 * literal twice — once as a telemetry attribute and once in the actual
 * request — so a partial edit would silently make traces disagree with what
 * really ran.
 *
 * This module centralises the choice: call sites ask for a *purpose*, and the
 * tier is resolved from env at CALL TIME. Operators retune models without a
 * republish; the defaults below are what ships.
 *
 * Standing rule (Dustin, 2026-08-09): always the latest generation of sonnet
 * or opus; never haiku. The concrete model id for each logical tier lives in
 * each provider's MODEL_IDS map — this module only picks the tier.
 *
 * Resolution order (first hit wins):
 *   1. the purpose-specific env var (e.g. R2MCP_COMPILE_WIKI_MODEL)
 *   2. the global env var R2MCP_MODEL_TIER
 *   3. the built-in default for that purpose
 *
 * Resolved at call time rather than import time for the same reason
 * `currentScope()` is: CLI drivers and launchd subprocesses set env after this
 * module has already been imported.
 */

export type ModelPurpose =
  | 'compile-wiki'
  | 'classify-edges-stage1'
  | 'classify-edges-stage2'
  | 'extract-entities';

/**
 * Shipped defaults. `classify-edges-stage2` stays on opus deliberately: edge
 * classification is a cascade where stage 1 is a cheap high-recall filter and
 * stage 2 is the expensive adjudicator that only sees what survived. Stage 1
 * moved off haiku but stays a tier below stage 2 so the cascade still saves
 * anything.
 */
const DEFAULT_TIERS: Record<ModelPurpose, LogicalModel> = {
  'compile-wiki': 'sonnet',
  'classify-edges-stage1': 'sonnet',
  'classify-edges-stage2': 'opus',
  'extract-entities': 'sonnet',
};

const PURPOSE_ENV_VARS: Record<ModelPurpose, string> = {
  'compile-wiki': 'R2MCP_COMPILE_WIKI_MODEL',
  'classify-edges-stage1': 'R2MCP_CLASSIFY_EDGES_STAGE1_MODEL',
  'classify-edges-stage2': 'R2MCP_CLASSIFY_EDGES_STAGE2_MODEL',
  'extract-entities': 'R2MCP_EXTRACT_ENTITIES_MODEL',
};

/** Applies to every purpose that has no purpose-specific override set. */
export const GLOBAL_ENV_VAR = 'R2MCP_MODEL_TIER';

const VALID_TIERS: readonly string[] = ['haiku', 'sonnet', 'opus'];

/**
 * Invalid values warn instead of throwing: these call sites run inside
 * scheduled launchd jobs, and killing the nightly memory pipeline over a typo
 * would be a worse failure than falling back to a working default. The warning
 * goes to stderr, which is where those jobs' logs already point.
 *
 * Deduped by variable name — stage 1 resolves once per candidate pair, so an
 * un-deduped warning would flood the log with thousands of identical lines and
 * bury the thing it was trying to tell you.
 */
const warnedFor = new Set<string>();

function warnOnce(varName: string, raw: string): void {
  if (warnedFor.has(varName)) return;
  warnedFor.add(varName);
  process.stderr.write(
    `[r2mcp:model-tier] ignoring ${varName}="${raw}" — not one of ${VALID_TIERS.join(', ')}. ` +
      `Falling back to the next source in the resolution order.\n`,
  );
}

/** Exported for tests: clears the warn-once dedupe state. */
export function resetModelTierWarnings(): void {
  warnedFor.clear();
}

function readTier(varName: string): LogicalModel | undefined {
  const raw = (process.env[varName] ?? '').trim();
  if (raw === '') return undefined;
  const normalized = raw.toLowerCase();
  if (VALID_TIERS.includes(normalized)) return normalized as LogicalModel;
  warnOnce(varName, raw);
  return undefined;
}

/**
 * Resolve the logical model tier for a given call site. Always returns a valid
 * tier — never throws.
 */
export function resolveModelTier(purpose: ModelPurpose): LogicalModel {
  return readTier(PURPOSE_ENV_VARS[purpose]) ?? readTier(GLOBAL_ENV_VAR) ?? DEFAULT_TIERS[purpose];
}

/** Exported for docs/diagnostics: the env var that targets one purpose. */
export function envVarForPurpose(purpose: ModelPurpose): string {
  return PURPOSE_ENV_VARS[purpose];
}
