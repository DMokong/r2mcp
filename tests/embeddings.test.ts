import { describe, it, expect } from 'vitest';
import { embedText, embedBatch } from '../src/embeddings.js';

describe('embeddings', () => {
  it('embedText returns a 1536-dim vector when API key is set', async () => {
    if (!process.env.OPENROUTER_API_KEY) {
      console.log('Skipping: OPENROUTER_API_KEY not set');
      return;
    }
    const vec = await embedText('always use bun over npm');
    expect(vec).toHaveLength(1536);
    expect(typeof vec![0]).toBe('number');
  });

  it('embedBatch returns multiple vectors', async () => {
    if (!process.env.OPENROUTER_API_KEY) return;
    const vecs = await embedBatch(['hello world', 'goodbye world']);
    expect(vecs).toHaveLength(2);
    expect(vecs![0]).toHaveLength(1536);
    expect(vecs![1]).toHaveLength(1536);
  });

  it('returns null when API key is missing', async () => {
    const origKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const vec = await embedText('test');
    expect(vec).toBeNull();
    if (origKey) process.env.OPENROUTER_API_KEY = origKey;
  });
});
