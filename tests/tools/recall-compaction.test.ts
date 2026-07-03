/**
 * claw-ohhj.3 — recall response compaction.
 *
 * Recall responses were ~4x their useful content: pretty-printed JSON,
 * full-precision similarity scores, dual timestamps, an echo of the caller's
 * own query, and always-present empty/derivable fields — paid on every recall
 * in every session. This suite specifies the compact shape:
 *
 *   - scores round to 3 decimals
 *   - one timestamp per result (`updated`; equals created when never updated)
 *   - no `query` echo, no `total_results` (derivable from results.length)
 *   - `early_stopped` present only when true; `signals` only when non-empty
 *   - empty `persons` arrays elided from metadata
 *   - asMcpResponse serializes compactly (no pretty-print indentation)
 */

import { describe, it, expect } from 'vitest';
import { compactResult, compactResponse } from '../../src/tools/recall.js';
import { asMcpResponse } from '../../src/mcp-response.js';

const fullResult = {
  id: 'aaaaaaaa-0000-0000-0000-000000000000',
  tier: 'preferences',
  content: 'Drill prefers espresso.',
  metadata: {
    type: 'preference',
    topics: ['coffee'],
    persons: [] as string[],
    created: '2026-07-01T00:00:00.000Z',
    updated: '2026-07-02T00:00:00.000Z',
  },
  score: 0.688162636331642,
  match_type: 'hybrid' as const,
};

describe('compactResult (claw-ohhj.3)', () => {
  it('rounds score to 3 decimals', () => {
    expect(compactResult(fullResult).score).toBe(0.688);
  });

  it('keeps a single timestamp: updated, no created', () => {
    const m = compactResult(fullResult).metadata;
    expect(m.updated).toBe('2026-07-02T00:00:00.000Z');
    expect(m).not.toHaveProperty('created');
  });

  it('elides an empty persons array, keeps a populated one', () => {
    expect(compactResult(fullResult).metadata).not.toHaveProperty('persons');
    const withPersons = {
      ...fullResult,
      metadata: { ...fullResult.metadata, persons: ['dustin'] },
    };
    expect(compactResult(withPersons).metadata.persons).toEqual(['dustin']);
  });

  it('preserves id/tier/content/match_type untouched', () => {
    const c = compactResult(fullResult);
    expect(c.id).toBe(fullResult.id);
    expect(c.tier).toBe('preferences');
    expect(c.content).toBe('Drill prefers espresso.');
    expect(c.match_type).toBe('hybrid');
  });
});

describe('compactResponse (claw-ohhj.3)', () => {
  const base = {
    results: [compactResult(fullResult)],
    search_mode: 'semantic' as const,
    tiers_searched: ['preferences'],
    tokens_used: 42,
  };

  it('has no query echo and no total_results', () => {
    const r = compactResponse({ ...base, query: 'espresso', early_stopped: false, signals: [] });
    expect(r).not.toHaveProperty('query');
    expect(r).not.toHaveProperty('total_results');
  });

  it('drops early_stopped when false, keeps it when true', () => {
    expect(
      compactResponse({ ...base, query: 'q', early_stopped: false, signals: [] }),
    ).not.toHaveProperty('early_stopped');
    expect(
      compactResponse({ ...base, query: 'q', early_stopped: true, signals: [] }).early_stopped,
    ).toBe(true);
  });

  it('drops empty signals, keeps non-empty', () => {
    expect(
      compactResponse({ ...base, query: 'q', early_stopped: false, signals: [] }),
    ).not.toHaveProperty('signals');
    const sig = { kind: 'contradicts' as const, from_id: 'a', to_id: 'b' };
    expect(
      compactResponse({ ...base, query: 'q', early_stopped: false, signals: [sig] }).signals,
    ).toEqual([sig]);
  });

  it('passes through conditional fields (warnings, entity_*) untouched', () => {
    const r = compactResponse({
      ...base,
      query: 'q',
      early_stopped: false,
      signals: [],
      warnings: ['embeddings disabled'],
      entity_resolved: true,
      entity_id: 'e1',
    });
    expect(r.warnings).toEqual(['embeddings disabled']);
    expect(r.entity_resolved).toBe(true);
    expect(r.entity_id).toBe('e1');
  });
});

describe('asMcpResponse compact serialization (claw-ohhj.3)', () => {
  it('serializes without pretty-print indentation', () => {
    const res = asMcpResponse('stats', { total: 2, tiers: { preferences: 1 } }, {});
    const text = res.content[0].text;
    expect(text).not.toContain('\n');
    expect(JSON.parse(text).total).toBe(2);
  });
});
