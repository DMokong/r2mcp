/**
 * MCP tool handler for `lint()`.
 *
 * Lint is SQL-only — no LLM calls (C.R5) — so unlike `compile()` it runs
 * directly in the MCP server process against the existing pgvector pool.
 * No subprocess delegation needed.
 */

import { getPool } from '../db.js';
import { runLint } from '../lint/run.js';
import type { LintInput, LintResult } from '../lint/types.js';

export type { LintInput, LintResult } from '../lint/types.js';

export async function lint(input: LintInput): Promise<LintResult> {
  const pool = getPool();
  return runLint(input, pool);
}
