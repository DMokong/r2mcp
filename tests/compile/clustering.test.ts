import { describe, it, expect } from 'vitest';
import {
  clusterByTopic,
  memoriesForTopic,
  topicTitle,
  topicToSlug,
} from '../../src/compiler/clustering.js';
import type { MemoryForCompile } from '../../src/compiler/types.js';

function mem(id: string, topics: string[], created_at = '2026-05-01T00:00:00Z'): MemoryForCompile {
  return { id, tier: 'preferences', type: 'preference', content: id, topics, people: [], created_at };
}

describe('clusterByTopic — deterministic grouping (B.R5)', () => {
  it('groups memories under their lexicographically smallest topic', () => {
    const m1 = mem('m1', ['zeta', 'alpha']);
    const m2 = mem('m2', ['alpha', 'beta']);
    const out = clusterByTopic([m1, m2]);
    expect(out).toHaveLength(1);
    expect(out[0].topic).toBe('alpha');
    expect(out[0].memories.map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('produces clusters sorted by topic name', () => {
    const m1 = mem('m1', ['z']);
    const m2 = mem('m2', ['a']);
    const m3 = mem('m3', ['m']);
    const out = clusterByTopic([m1, m2, m3]);
    expect(out.map(c => c.topic)).toEqual(['a', 'm', 'z']);
  });

  it('sorts memories within a cluster by id (stable)', () => {
    const m1 = mem('m-zz', ['t']);
    const m2 = mem('m-aa', ['t']);
    const m3 = mem('m-mm', ['t']);
    const out = clusterByTopic([m1, m2, m3]);
    expect(out[0].memories.map(m => m.id)).toEqual(['m-aa', 'm-mm', 'm-zz']);
  });

  it('groups topicless memories under "uncategorized"', () => {
    const m1 = mem('m1', []);
    const m2 = mem('m2', ['t']);
    const out = clusterByTopic([m1, m2]);
    expect(out.map(c => c.topic)).toContain('uncategorized');
  });

  it('two runs over the same input produce the same cluster set (B.R5 stability)', () => {
    const inputs: MemoryForCompile[] = [
      mem('m1', ['alpha', 'beta']),
      mem('m2', ['gamma']),
      mem('m3', ['alpha']),
    ];
    const a = clusterByTopic(inputs);
    const b = clusterByTopic([...inputs].reverse());
    expect(a.map(c => c.topic)).toEqual(b.map(c => c.topic));
    for (let i = 0; i < a.length; i++) {
      expect(a[i].memories.map(m => m.id)).toEqual(b[i].memories.map(m => m.id));
    }
  });
});

describe('memoriesForTopic', () => {
  it('filters by topic and sorts by created_at then id', () => {
    const m1 = mem('m-c', ['x'], '2026-05-03');
    const m2 = mem('m-a', ['x'], '2026-05-01');
    const m3 = mem('m-b', ['y'], '2026-05-02');
    const out = memoriesForTopic([m1, m2, m3], 'x');
    expect(out.map(m => m.id)).toEqual(['m-a', 'm-c']);
  });
});

describe('topicToSlug / topicTitle', () => {
  it('slugifies and titles consistently', () => {
    expect(topicToSlug('Wiki Mode')).toBe('wiki-mode');
    expect(topicToSlug('AI/ML Stuff')).toBe('ai-ml-stuff');
    expect(topicTitle('wiki-mode')).toBe('Wiki Mode');
    expect(topicTitle('llm_provider abstraction')).toBe('Llm Provider Abstraction');
  });
});
