import { describe, it, expect, vi } from 'vitest';
import {
  stage2OpusClassify,
  parseStage2Response,
  shouldSkipForRejection,
} from '../../src/edges/stage2-opus.js';
import type { EdgeAnthropicClient } from '../../src/edges/anthropic-client.js';

describe('shouldSkipForRejection (AC10)', () => {
  it('skips when either memory is type=rejection', () => {
    expect(shouldSkipForRejection({ type: 'rejection' }, { type: 'context' })).toBe(true);
    expect(shouldSkipForRejection({ type: 'context' }, { type: 'rejection' })).toBe(true);
  });
  it('skips when both are rejection (per-memory rule)', () => {
    expect(shouldSkipForRejection({ type: 'rejection' }, { type: 'rejection' })).toBe(true);
  });
  it('does not skip plain context pairs', () => {
    expect(shouldSkipForRejection({ type: 'context' }, { type: 'context' })).toBe(false);
  });
});

describe('parseStage2Response', () => {
  it('parses a valid JSON object', () => {
    const text = '{"relation": "contradicts", "confidence": 0.84, "rationale": "B deprecates A"}';
    expect(parseStage2Response(text)).toEqual({
      relation: 'contradicts', confidence: 0.84, rationale: 'B deprecates A',
    });
  });
  it('extracts JSON from markdown code fence', () => {
    const text = '```json\n{"relation": "supports", "confidence": 0.7, "rationale": "ok"}\n```';
    expect(parseStage2Response(text).relation).toBe('supports');
  });
  it('parses a NONE verdict', () => {
    const text = '{"relation": "none", "confidence": 0, "rationale": "no relation found"}';
    expect(parseStage2Response(text).relation).toBe('none');
  });
  it('throws on invalid JSON', () => {
    expect(() => parseStage2Response('not json')).toThrow();
  });
  it('throws on bogus relation', () => {
    expect(() => parseStage2Response('{"relation": "bogus", "confidence": 0.5, "rationale": "x"}')).toThrow();
  });
});

describe('stage2OpusClassify (R4)', () => {
  it('returns the parsed relation when Opus answers cleanly', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        text: '{"relation":"contradicts","confidence":0.85,"rationale":"explicit deprecation"}',
        input_tokens: 800, output_tokens: 60, cost_usd: 0.0165,
      }),
    } as unknown as EdgeAnthropicClient;
    const result = await stage2OpusClassify(mockClient, {
      from: { id: 'a', content: 'use library X', type: 'context' },
      to:   { id: 'b', content: 'do not use X — deprecated', type: 'context' },
    });
    expect(result.kind).toBe('classified');
    if (result.kind !== 'classified') return;
    expect(result.relation).toBe('contradicts');
    expect(result.confidence).toBe(0.85);
    expect(result.cost_usd).toBeCloseTo(0.0165, 6);
  });

  it('returns rejection_skip without calling the API for rejection memories (AC10)', async () => {
    const mockClient = { complete: vi.fn() } as unknown as EdgeAnthropicClient;
    const result = await stage2OpusClassify(mockClient, {
      from: { id: 'r1', content: 'do not add fallback handlers', type: 'rejection' },
      to:   { id: 'p1', content: 'we use try/catch with re-raise', type: 'context' },
    });
    expect(result.kind).toBe('rejection_skip');
    expect(mockClient.complete).not.toHaveBeenCalled();
  });

  it('returns none when Opus says no relation', async () => {
    const mockClient = {
      complete: vi.fn().mockResolvedValue({
        text: '{"relation":"none","confidence":0,"rationale":"distinct"}',
        input_tokens: 800, output_tokens: 30, cost_usd: 0.014,
      }),
    } as unknown as EdgeAnthropicClient;
    const result = await stage2OpusClassify(mockClient, {
      from: { id: 'a', content: 'morning brief', type: 'context' },
      to:   { id: 'b', content: 'email triage', type: 'context' },
    });
    expect(result.kind).toBe('classified');
    if (result.kind !== 'classified') return;
    expect(result.relation).toBe('none');
  });
});
