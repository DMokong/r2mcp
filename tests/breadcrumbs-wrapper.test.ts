import { describe, it, expect } from 'vitest';
import { asMcpResponse } from '../src/mcp-response.js';

describe('asMcpResponse (R2)', () => {
  it('wraps a tool result into MCP content payload and adds next_tools', () => {
    const r = asMcpResponse('stats', { total_memories: 100 }, {});
    expect(r.content).toHaveLength(1);
    expect(r.content[0].type).toBe('text');
    const inner = JSON.parse(r.content[0].text);
    expect(inner.total_memories).toBe(100);
    expect(inner.next_tools).toEqual([]);  // stats has no R4 mapping
  });

  it('produces a contradiction breadcrumb when recall returns a contradicted memory', () => {
    const r = asMcpResponse('recall', {
      results: [{ id: 'm1', content: 'x', signals: { contradictions: [{ memory_id: 'm1', reason: 'r' }] } }],
      total_results: 1, search_mode: 'semantic', tiers_searched: ['hot'], query: 'q',
    }, {});
    const inner = JSON.parse(r.content[0].text);
    expect(inner.next_tools).toHaveLength(1);
    expect(inner.next_tools[0].name).toBe('lint');
  });
});
