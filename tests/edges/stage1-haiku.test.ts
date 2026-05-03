import { describe, it, expect, vi } from 'vitest';
import { stage1HaikuFilter, parseStage1Response } from '../../src/edges/stage1-haiku.js';
import type { EdgeAnthropicClient } from '../../src/edges/anthropic-client.js';

describe('parseStage1Response', () => {
  it('parses YES + comment', () => {
    expect(parseStage1Response('YES — they conflict on library choice')).toEqual({ pass: true, comment: 'they conflict on library choice' });
  });
  it('parses NO + comment', () => {
    expect(parseStage1Response('NO — unrelated topics')).toEqual({ pass: false, comment: 'unrelated topics' });
  });
  it('case-insensitive verdict', () => {
    expect(parseStage1Response('yes')).toEqual({ pass: true, comment: '' });
  });
  it('throws on unparseable response', () => {
    expect(() => parseStage1Response('maybe?')).toThrow();
  });
});

describe('stage1HaikuFilter', () => {
  it('returns pass=true when Haiku says YES', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        text: 'YES — both discuss library X',
        input_tokens: 200,
        output_tokens: 30,
        cost_usd: 0.00028,
      }),
    } as unknown as EdgeAnthropicClient;
    const result = await stage1HaikuFilter(mockClient, {
      from: { id: 'a', content: 'use library X' },
      to:   { id: 'b', content: 'do not use library X' },
    });
    expect(result.pass).toBe(true);
    expect(result.cost_usd).toBeCloseTo(0.00028, 6);
    expect(mockClient.complete).toHaveBeenCalledWith(
      'haiku',
      expect.stringContaining('relation'),
      expect.stringContaining('use library X'),
      expect.any(Number),
    );
  });

  it('returns pass=false when Haiku says NO', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        text: 'NO — distinct subsystems', input_tokens: 200, output_tokens: 20, cost_usd: 0.00024,
      }),
    } as unknown as EdgeAnthropicClient;
    const result = await stage1HaikuFilter(mockClient, {
      from: { id: 'a', content: 'morning brief' },
      to:   { id: 'b', content: 'email triage' },
    });
    expect(result.pass).toBe(false);
  });
});
