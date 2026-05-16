import { describe, it, expect } from 'vitest';
import { parseExtractionResponse } from '../../src/entities/prompt.js';

describe('SPEC-046 R7 strict parser (AC3c)', () => {
  it('parses valid response', () => {
    const result = parseExtractionResponse(JSON.stringify({
      matched: [{ canonical_name: 'Speculator', confidence: 0.95 }],
      new_entities: [{ type: 'tool', canonical_name: 'pgvector', aliases: ['pg'], confidence: 0.88 }],
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matched).toHaveLength(1);
    expect(result.value.new_entities[0].aliases).toEqual(['pg']);
  });
  it('accepts empty matched and empty new_entities', () => {
    const r = parseExtractionResponse(JSON.stringify({ matched: [], new_entities: [] }));
    expect(r.ok).toBe(true);
  });
  it('defaults missing aliases to []', () => {
    const r = parseExtractionResponse(JSON.stringify({
      matched: [], new_entities: [{ type: 'project', canonical_name: 'X', confidence: 0.9 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.new_entities[0].aliases).toEqual([]);
  });
  it('clamps confidence outside [0,1] and logs a warning', () => {
    const r = parseExtractionResponse(JSON.stringify({
      matched: [{ canonical_name: 'A', confidence: 1.7 }],
      new_entities: [{ type: 'person', canonical_name: 'B', confidence: -0.2 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.matched[0].confidence).toBe(1.0);
    expect(r.value.new_entities[0].confidence).toBe(0.0);
    expect(r.warnings.some(w => w.includes('clamped'))).toBe(true);
  });
  it('rejects malformed JSON', () => {
    const r = parseExtractionResponse('{ not json');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/json/i);
  });
  it('rejects missing required keys', () => {
    expect(parseExtractionResponse(JSON.stringify({ matched: [] })).ok).toBe(false);
    expect(parseExtractionResponse(JSON.stringify({ new_entities: [] })).ok).toBe(false);
  });
  it('skips new_entities with type outside the four-type set, keeps the rest', () => {
    const r = parseExtractionResponse(JSON.stringify({
      matched: [],
      new_entities: [
        { type: 'event', canonical_name: 'BadType', confidence: 0.9 },
        { type: 'project', canonical_name: 'Good', confidence: 0.9 },
      ],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.new_entities).toHaveLength(1);
    expect(r.value.new_entities[0].canonical_name).toBe('Good');
    expect(r.warnings.some(w => w.includes('event'))).toBe(true);
  });
});

describe('SPEC-046 R7 buildExtractionPrompt', () => {
  it('includes top-N entity context block', async () => {
    const { buildExtractionPrompt } = await import('../../src/entities/prompt.js');
    const prompt = buildExtractionPrompt({
      memory_content: 'A note about Speculator and pgvector.',
      known_entities: [
        { type: 'project', canonical_name: 'Speculator', aliases: ['spec'] },
        { type: 'tool', canonical_name: 'pgvector', aliases: [] },
      ],
    });
    expect(prompt).toContain('Speculator');
    expect(prompt).toContain('pgvector');
    expect(prompt).toMatch(/project|person|tool|decision/);
    expect(prompt).toContain('matched');
    expect(prompt).toContain('new_entities');
  });
});
