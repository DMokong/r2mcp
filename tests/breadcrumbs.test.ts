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

  it('R6: caps at MAX_BREADCRUMBS (3) — enabled after Task 5 implements mapLint', () => {
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

describe('mapRecall (R4, AC2)', () => {
  it('emits one lint breadcrumb per contradicted memory', () => {
    const ctx: BreadcrumbContext = {
      tool: 'recall',
      response: {
        results: [
          { id: 'm1', content: 'a', signals: { contradictions: [{ memory_id: 'm1', reason: 'x' }] } },
          { id: 'm2', content: 'b' },  // no contradiction
        ],
        total_results: 2, search_mode: 'semantic', tiers_searched: ['hot'], query: 'q',
      },
      args: {},
    };
    const result = withBreadcrumbs({}, ctx);
    expect(result.next_tools).toHaveLength(1);
    expect(result.next_tools[0].name).toBe('lint');
    expect(result.next_tools[0].usage).toContain('--check=contradictions');
    expect(result.next_tools[0].usage).toContain('--memory-id=m1');
    expect(result.next_tools[0].why).toBeTruthy();
  });

  it('emits no breadcrumbs when no signals', () => {
    const result = withBreadcrumbs({}, {
      tool: 'recall',
      response: {
        results: [{ id: 'm1', content: 'a' }],
        total_results: 1, search_mode: 'semantic', tiers_searched: ['hot'], query: 'q',
      },
      args: {},
    });
    expect(result.next_tools).toEqual([]);
  });

  it('dedupes when same memory_id appears in multiple result-level signals', () => {
    const ctx: BreadcrumbContext = {
      tool: 'recall',
      response: {
        results: [
          { id: 'm1', content: 'a', signals: { contradictions: [{ memory_id: 'm1', reason: 'x' }] } },
          { id: 'm1', content: 'a', signals: { contradictions: [{ memory_id: 'm1', reason: 'y' }] } },
        ],
        total_results: 2, search_mode: 'semantic', tiers_searched: ['hot'], query: 'q',
      },
      args: {},
    };
    expect(withBreadcrumbs({}, ctx).next_tools).toHaveLength(1);
  });
});

describe('mapLint (R4, AC3)', () => {
  it('emits one compile breadcrumb per affected topic', () => {
    const result = withBreadcrumbs({}, {
      tool: 'lint',
      response: {
        findings: [
          { check: 'contradictions', memory_id: 'm1', topic: 'auth' },
          { check: 'contradictions', memory_id: 'm2', topic: 'billing' },
        ],
        total_findings: 2,
      },
      args: { check: 'contradictions' },
    });
    expect(result.next_tools).toHaveLength(2);
    const usages = result.next_tools.map((b) => b.usage);
    expect(usages).toContain('compile --topic=auth');
    expect(usages).toContain('compile --topic=billing');
  });

  it('ranks topics by descending contradiction count', () => {
    const findings = [
      // 1 contradiction for topic 'a'
      { check: 'contradictions', memory_id: 'm1', topic: 'a' },
      // 3 contradictions for topic 'b'
      { check: 'contradictions', memory_id: 'm2', topic: 'b' },
      { check: 'contradictions', memory_id: 'm3', topic: 'b' },
      { check: 'contradictions', memory_id: 'm4', topic: 'b' },
      // 2 contradictions for topic 'c'
      { check: 'contradictions', memory_id: 'm5', topic: 'c' },
      { check: 'contradictions', memory_id: 'm6', topic: 'c' },
    ];
    const result = withBreadcrumbs({}, {
      tool: 'lint',
      response: { findings, total_findings: findings.length },
      args: { check: 'contradictions' },
    });
    // Capped at 3; ranking is b (3), c (2), a (1).
    expect(result.next_tools).toHaveLength(3);
    expect(result.next_tools[0].usage).toBe('compile --topic=b');
    expect(result.next_tools[1].usage).toBe('compile --topic=c');
    expect(result.next_tools[2].usage).toBe('compile --topic=a');
  });

  it('ignores findings without topic', () => {
    const result = withBreadcrumbs({}, {
      tool: 'lint',
      response: {
        findings: [
          { check: 'contradictions', memory_id: 'm1' },  // no topic
        ],
        total_findings: 1,
      },
      args: { check: 'contradictions' },
    });
    expect(result.next_tools).toEqual([]);
  });

  it('ignores non-contradiction findings', () => {
    const result = withBreadcrumbs({}, {
      tool: 'lint',
      response: {
        findings: [{ check: 'orphan-edge', memory_id: 'm1', topic: 'auth' }],
        total_findings: 1,
      },
      args: { check: 'orphan-edge' },
    });
    expect(result.next_tools).toEqual([]);
  });
});

describe('mapExtractEntities (R4, Open Question 3 resolution)', () => {
  it('emits no breadcrumbs when entities_created is 0', () => {
    const result = withBreadcrumbs({}, {
      tool: 'extract_entities',
      response: { entities_created: 0, entities_updated: 5, new_entities: [] },
      args: {},
    });
    expect(result.next_tools).toEqual([]);
  });

  it('picks highest-confidence new entity for the recall breadcrumb', () => {
    const result = withBreadcrumbs({}, {
      tool: 'extract_entities',
      response: {
        entities_created: 3, entities_updated: 0,
        new_entities: [
          { canonical_name: 'OB1', type: 'project', confidence: 0.7 },
          { canonical_name: 'Speculator', type: 'project', confidence: 0.95 },
          { canonical_name: 'r2mcp', type: 'project', confidence: 0.8 },
        ],
      },
      args: {},
    });
    expect(result.next_tools).toHaveLength(1);
    expect(result.next_tools[0].name).toBe('recall');
    expect(result.next_tools[0].usage).toBe('recall --entity=Speculator');
    expect(result.next_tools[0].why).toContain('newly extracted entity');
  });

  it('breaks confidence ties alphabetically by canonical_name (ascending)', () => {
    const result = withBreadcrumbs({}, {
      tool: 'extract_entities',
      response: {
        entities_created: 2, entities_updated: 0,
        new_entities: [
          { canonical_name: 'Zeta', type: 'project', confidence: 0.9 },
          { canonical_name: 'Alpha', type: 'project', confidence: 0.9 },
        ],
      },
      args: {},
    });
    expect(result.next_tools[0].usage).toBe('recall --entity=Alpha');
  });

  it('treats missing confidence as 0 for ranking', () => {
    const result = withBreadcrumbs({}, {
      tool: 'extract_entities',
      response: {
        entities_created: 2, entities_updated: 0,
        new_entities: [
          { canonical_name: 'NoConf', type: 'project' },
          { canonical_name: 'HasConf', type: 'project', confidence: 0.1 },
        ],
      },
      args: {},
    });
    expect(result.next_tools[0].usage).toBe('recall --entity=HasConf');
  });

  it('emits no breadcrumb when new_entities is empty despite entities_created > 0', () => {
    // Defensive: should not happen in practice but the response is what we have.
    const result = withBreadcrumbs({}, {
      tool: 'extract_entities',
      response: { entities_created: 3, entities_updated: 0, new_entities: [] },
      args: {},
    });
    expect(result.next_tools).toEqual([]);
  });
});

describe('mapRemember (R4)', () => {
  it('emits one recall breadcrumb when memory_id is present', () => {
    const result = withBreadcrumbs({}, {
      tool: 'remember',
      response: { operation: 'ADD', memory_id: 'mem-abc' },
      args: { tier: 'hot', content: 'Decided to use X over Y because Z' },
    });
    expect(result.next_tools).toHaveLength(1);
    expect(result.next_tools[0].name).toBe('recall');
    expect(result.next_tools[0].usage).toContain('--tier=hot');
    expect(result.next_tools[0].usage).toContain('--query=');
    expect(result.next_tools[0].why).toContain('indexed');
  });

  it('uses id field as fallback when memory_id missing (older shape compat)', () => {
    const result = withBreadcrumbs({}, {
      tool: 'remember',
      response: { operation: 'ADD', id: 'mem-xyz' },
      args: { content: 'short' },
    });
    expect(result.next_tools).toHaveLength(1);
  });

  it('emits no breadcrumb when neither id nor memory_id present (NOOP, ARCHIVE-no-target etc.)', () => {
    const result = withBreadcrumbs({}, {
      tool: 'remember',
      response: { operation: 'NOOP', message: 'no change' },
      args: { content: 'x' },
    });
    expect(result.next_tools).toEqual([]);
  });

  it('truncates the query snippet to a reasonable length', () => {
    const longContent = 'a'.repeat(500);
    const result = withBreadcrumbs({}, {
      tool: 'remember',
      response: { operation: 'ADD', memory_id: 'mem1' },
      args: { tier: 'hot', content: longContent },
    });
    // Query should be capped (e.g., first 80 chars) — keep usage strings runnable.
    expect(result.next_tools[0].usage.length).toBeLessThan(200);
  });

  it('omits --tier when tier arg not provided', () => {
    const result = withBreadcrumbs({}, {
      tool: 'remember',
      response: { operation: 'ADD', memory_id: 'mem1' },
      args: { content: 'x' },
    });
    expect(result.next_tools[0].usage).not.toContain('--tier=');
  });
});
