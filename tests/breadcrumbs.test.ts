import { describe, it, expect } from 'vitest';
import type { Breadcrumb, BreadcrumbContext, ToolName } from '../src/breadcrumbs.js';
import { assertBreadcrumb } from '../src/breadcrumbs.js';

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
