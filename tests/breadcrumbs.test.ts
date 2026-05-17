import { describe, it, expect } from 'vitest';
import type { Breadcrumb, BreadcrumbContext, ToolName } from '../src/breadcrumbs.js';
import { assertBreadcrumb, withBreadcrumbs, MAX_BREADCRUMBS } from '../src/breadcrumbs.js';

describe('breadcrumb types', () => {
  it('ToolName covers all 11 r2mcp MCP tools', () => {
    const allTools: ToolName[] = [
      'remember', 'recall', 'search', 'stats', 'meditate', 'reject',
      'compile', 'lint', 'classify', 'dump_edges_sidecar', 'extract_entities',
    ];
    // Compile-time check — if a tool is missing from ToolName, this assignment fails to typecheck.
    expect(allTools).toHaveLength(11);
  });

  it('Breadcrumb requires non-empty name, usage, and why', () => {
    // Compile-time: omitting a field is an error. Runtime check via assertBreadcrumb later.
    const b: Breadcrumb = { name: 'lint', usage: 'lint --check=contradictions --memory-id=abc', why: 'test' };
    expect(b.name).toBe('lint');
    expect(b.usage).toContain('lint');
    expect(b.why).toBeTruthy();
  });

  it('BreadcrumbContext is a discriminated union keyed on tool name', () => {
    const ctx: BreadcrumbContext = {
      tool: 'recall',
      response: { results: [], total_results: 0, search_mode: 'semantic', tiers_searched: [], query: '' },
      args: {},
    };
    expect(ctx.tool).toBe('recall');
  });
});

describe('assertBreadcrumb (AC5)', () => {
  it('passes for a valid breadcrumb', () => {
    expect(() => assertBreadcrumb({ name: 'lint', usage: 'lint --memory-id=abc', why: 'check this' })).not.toThrow();
  });

  it('throws for empty name', () => {
    expect(() => assertBreadcrumb({ name: '', usage: 'lint x', why: 'why' })).toThrow(/name/);
  });

  it('throws for missing usage', () => {
    expect(() => assertBreadcrumb({ name: 'lint', usage: '', why: 'why' })).toThrow(/usage/);
  });

  it('throws for missing why', () => {
    expect(() => assertBreadcrumb({ name: 'lint', usage: 'lint x', why: '' })).toThrow(/why/);
  });

  it('throws for non-string fields', () => {
    // @ts-expect-error — deliberately wrong type at runtime
    expect(() => assertBreadcrumb({ name: 42, usage: 'x', why: 'y' })).toThrow();
  });
});

describe('withBreadcrumbs (R1, R5, R6)', () => {
  it('R1: returns response augmented with next_tools array', () => {
    const result = withBreadcrumbs({ foo: 'bar' }, {
      tool: 'stats',
      response: {},
      args: {},
    });
    expect(result).toEqual({ foo: 'bar', next_tools: [] });
  });

  it('R1: does not mutate the input response', () => {
    const original = { foo: 'bar' };
    const result = withBreadcrumbs(original, { tool: 'stats', response: {}, args: {} });
    expect(original).toEqual({ foo: 'bar' });
    expect(result).not.toBe(original);
  });

  it('R1: never returns a response without next_tools', () => {
    const result = withBreadcrumbs({}, { tool: 'meditate', response: {}, args: {} });
    expect(result.next_tools).toBeDefined();
    expect(Array.isArray(result.next_tools)).toBe(true);
  });

  it('R5: deterministic — same input produces identical output across calls', () => {
    const ctx: BreadcrumbContext = {
      tool: 'recall',
      response: {
        results: [{
          id: 'mem1',
          content: 'x',
          signals: { contradictions: [{ memory_id: 'mem1', reason: 'r' }] },
        }],
        total_results: 1, search_mode: 'semantic', tiers_searched: ['hot'], query: 'x',
      },
      args: {},
    };
    const a = withBreadcrumbs({}, ctx);
    const b = withBreadcrumbs({}, ctx);
    expect(a).toEqual(b);
  });

  it.skip('R6: caps at MAX_BREADCRUMBS (3) — enabled after Task 5 implements mapLint', () => {
    // Six contradictions across six topics → expect only 3 breadcrumbs.
    const findings = Array.from({ length: 6 }, (_, i) => ({
      check: 'contradictions', memory_id: `m${i}`, topic: `topic-${i}`,
    }));
    const result = withBreadcrumbs({}, {
      tool: 'lint',
      response: { findings, total_findings: 6 },
      args: { check: 'contradictions' },
    });
    expect(result.next_tools).toHaveLength(3);
    expect(MAX_BREADCRUMBS).toBe(3);
  });
});
