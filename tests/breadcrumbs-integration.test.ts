import { describe, it, expect } from 'vitest';
import { asMcpResponse } from '../src/mcp-response.js';
import type { ToolName } from '../src/breadcrumbs.js';

const allTools: ToolName[] = [
  'remember', 'recall', 'search', 'stats', 'meditate', 'reject',
  'compile', 'lint', 'classify', 'dump_edges_sidecar', 'extract_entities',
];

// Minimal-shape result fixtures per tool. These don't need real DB roundtrips
// — they exercise the wrapping layer with realistic but synthetic data.
const fixtureFor: Record<ToolName, { result: object; args: object }> = {
  remember:        { result: { operation: 'NOOP', message: 'noop' }, args: { content: 'x' } },
  recall:          { result: { results: [], total_results: 0, search_mode: 'semantic', tiers_searched: [], query: '' }, args: {} },
  search:          { result: { results: [] }, args: {} },
  stats:           { result: { total_memories: 0 }, args: {} },
  meditate:        { result: { summary: 'nothing to do' }, args: {} },
  reject:          { result: { rejected: true }, args: {} },
  compile:         { result: { topic: 'x', tokens: 0 }, args: {} },
  lint:            { result: { findings: [], total_findings: 0 }, args: {} },
  classify:        { result: { classified: 0 }, args: {} },
  dump_edges_sidecar: { result: { edges_dumped: 0 }, args: {} },
  extract_entities: { result: { entities_created: 0, entities_updated: 0, new_entities: [] }, args: {} },
};

describe('breadcrumb integration (AC1, AC4)', () => {
  for (const tool of allTools) {
    it(`AC1: ${tool} response contains a next_tools array`, () => {
      const { result, args } = fixtureFor[tool];
      const r = asMcpResponse(tool, result, args);
      const inner = JSON.parse(r.content[0].text);
      expect(inner.next_tools).toBeDefined();
      expect(Array.isArray(inner.next_tools)).toBe(true);
      // Every breadcrumb has the required shape.
      for (const b of inner.next_tools) {
        expect(typeof b.name).toBe('string');
        expect(typeof b.usage).toBe('string');
        expect(typeof b.why).toBe('string');
      }
    });

    it(`AC4: ${tool} with no triggering signal returns next_tools: []`, () => {
      const { result, args } = fixtureFor[tool];
      const r = asMcpResponse(tool, result, args);
      const inner = JSON.parse(r.content[0].text);
      expect(inner.next_tools).toEqual([]);
    });
  }
});
