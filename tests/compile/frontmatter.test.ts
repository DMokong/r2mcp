import { describe, it, expect } from 'vitest';
import {
  emitFrontmatter,
  extractHeaders,
  levenshteinRatio,
  parseFrontmatter,
  stripForBodyComparison,
} from '../../src/compiler/frontmatter.js';
import type { CompileFrontmatter } from '../../src/compiler/types.js';

const sampleFrontmatter: CompileFrontmatter = {
  generated_at: '2026-05-04T18:00:00Z',
  compile_run_id: 'run-abc-123',
  source_count: 2,
  source_memory_ids: ['m-1', 'm-2'],
  provider: 'claude-code',
  source_git_sha: 'fddfe45',
  tier: 'preferences',
};

describe('emitFrontmatter / parseFrontmatter', () => {
  it('round-trips all fields', () => {
    const text = emitFrontmatter(sampleFrontmatter) + '\n## Body\n\nBody content.';
    const { frontmatter, body } = parseFrontmatter(text);
    expect(frontmatter.generated_at).toBe(sampleFrontmatter.generated_at);
    expect(frontmatter.compile_run_id).toBe(sampleFrontmatter.compile_run_id);
    expect(frontmatter.source_count).toBe(2);
    expect(frontmatter.source_memory_ids).toEqual(['m-1', 'm-2']);
    expect(frontmatter.provider).toBe('claude-code');
    expect(frontmatter.source_git_sha).toBe('fddfe45');
    expect(frontmatter.tier).toBe('preferences');
    expect(body).toBe('\n## Body\n\nBody content.');
  });

  it('serializes null source_git_sha as `null` (B.R3)', () => {
    const out = emitFrontmatter({ ...sampleFrontmatter, source_git_sha: null });
    expect(out).toContain('source_git_sha: null');
    const { frontmatter } = parseFrontmatter(out + '\n');
    expect(frontmatter.source_git_sha).toBeNull();
  });

  it('serializes topic-mode frontmatter', () => {
    const fm: CompileFrontmatter = { ...sampleFrontmatter, tier: undefined, topic: 'wiki-mode' };
    const out = emitFrontmatter(fm);
    expect(out).toContain('topic: "wiki-mode"');
    expect(out).not.toContain('tier:');
  });

  it('rejects text that does not start with frontmatter', () => {
    expect(() => parseFrontmatter('## Header\n\nbody')).toThrow(/does not start/);
  });

  it('rejects unclosed frontmatter blocks', () => {
    expect(() => parseFrontmatter('---\nkey: value\n')).toThrow(/not closed/);
  });
});

describe('extractHeaders', () => {
  it('returns the set of ## and ### headers', () => {
    const body = '## Top\n\nintro\n\n### Sub\n\ntext\n\n### Another Sub\n\nmore text';
    expect(extractHeaders(body)).toEqual(['## Top', '### Sub', '### Another Sub']);
  });

  it('ignores #### and deeper headers', () => {
    const body = '## A\n\n#### Skip\n\n### Keep';
    expect(extractHeaders(body)).toEqual(['## A', '### Keep']);
  });
});

describe('levenshteinRatio (B.R5 / B.AC3)', () => {
  it('returns 1.0 for identical strings', () => {
    expect(levenshteinRatio('hello world', 'hello world')).toBe(1.0);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(levenshteinRatio('', '')).toBe(1.0);
  });

  it('returns ≥ 0.95 for nearly identical prose (~5% variance)', () => {
    const a = 'The classifier respects the per-provider concurrency cap and dispatches up to 10 pairs concurrently.';
    const b = 'The classifier respects the per-provider concurrency cap and dispatches up to ten pairs concurrently.';
    expect(levenshteinRatio(a, b)).toBeGreaterThanOrEqual(0.95);
  });

  it('returns < 0.5 for totally different strings', () => {
    expect(levenshteinRatio('cat', 'elephantine')).toBeLessThan(0.5);
  });
});

describe('stripForBodyComparison', () => {
  it('strips frontmatter, headers, and citation tags', () => {
    const text = `---
key: value
---

## Section

Hello <m:abc-123> world.

### Sub

More [m:def-456] text.`;
    const stripped = stripForBodyComparison(text);
    expect(stripped).toBe('Hello world. More text.');
  });

  it('still works when no frontmatter is present', () => {
    expect(stripForBodyComparison('## Top\nplain body')).toBe('plain body');
  });
});
