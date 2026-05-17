import { describe, it, expect } from 'vitest';
import type { Breadcrumb, BreadcrumbContext, ToolName } from '../src/breadcrumbs.js';

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
