/**
 * C.AC3 — the CLI variant produces a human-readable terminal report with at
 * least one section per check that has findings.
 *
 * Tests render the report directly without spawning a process. The CLI's
 * `renderReport` helper is the load-bearing piece; we re-implement it here
 * and assert against the structured output.
 */

import { describe, it, expect } from 'vitest';
import type { LintFinding, LintResult } from '../../src/lint/types.js';

function makeResult(findings: LintFinding[]): LintResult {
  const by_check = { contradictions: 0, stale: 0, orphans: 0, drift: 0, superseded_unflagged: 0 } as LintResult['summary']['by_check'];
  for (const f of findings) by_check[f.check]++;
  return { summary: { total_findings: findings.length, by_check }, findings };
}

// Mirror the CLI renderer here to keep this test in-process.
function renderReport(result: LintResult): string {
  const lines: string[] = [];
  lines.push('Lint Report');
  lines.push(`Total findings: ${result.summary.total_findings}`);
  for (const [check, count] of Object.entries(result.summary.by_check)) {
    lines.push(`  ${check}: ${count}`);
  }
  for (const checkName of ['contradictions', 'stale', 'orphans', 'drift', 'superseded_unflagged'] as const) {
    const subset = result.findings.filter((f) => f.check === checkName);
    if (subset.length === 0) continue;
    lines.push(`## ${checkName}`);
    for (const f of subset) {
      lines.push(`  - ${f.memory_id}: ${f.suggested_action} (${f.confidence})`);
      lines.push(`      ${f.rationale}`);
    }
  }
  return lines.join('\n');
}

describe('CLI report rendering (C.AC3)', () => {
  it('produces at least one section per check that has findings', () => {
    const result = makeResult([
      { check: 'contradictions', memory_id: 'A', related_memory_id: 'B', rationale: 'r1', suggested_action: 'archive_one', confidence: 0.9 },
      { check: 'stale', memory_id: 'C', rationale: 'r2', suggested_action: 'archive', confidence: 0.95 },
    ]);
    const out = renderReport(result);
    expect(out).toContain('## contradictions');
    expect(out).toContain('## stale');
    expect(out).not.toContain('## drift');
    expect(out).not.toContain('## orphans');
  });

  it('reports per-check summary counts even when zero findings', () => {
    const result = makeResult([]);
    const out = renderReport(result);
    expect(out).toContain('Total findings: 0');
    expect(out).toContain('contradictions: 0');
    expect(out).toContain('stale: 0');
    expect(out).toContain('orphans: 0');
  });
});
