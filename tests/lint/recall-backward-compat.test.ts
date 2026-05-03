/**
 * C.AC7 — recall() backward compatibility shape pin.
 *
 * SPEC-044 explicitly does NOT modify `recall()`. This test pins the
 * documented response shape (top-level keys + per-result fields + signals[]
 * preserved from SPEC-043) so any accidental drift surfaces immediately.
 *
 * Live integration is exercised in `tests/edges/recall-backward-compat.test.ts`
 * against a real database. This test is the dependency-free static guard:
 * if SPEC-044 added a top-level field to RecallResponse or removed a
 * SPEC-043 field, the type system would tell us here.
 */

import { describe, it, expect } from 'vitest';
import type {
  RecallResponse,
  RecallResult,
} from '../../src/tools/recall.js';

describe('recall() response shape pin (C.AC7)', () => {
  it('top-level RecallResponse keys match the documented contract', () => {
    // Minimal valid shape, by type. If any required field is missing or any
    // unexpected field becomes required, TypeScript will flag this literal.
    const response: RecallResponse = {
      results: [],
      query: 'q',
      total_results: 0,
      search_mode: 'semantic',
      tiers_searched: [],
    };
    // Top-level keys: 'results' | 'query' | 'total_results' | 'search_mode'
    // | 'tiers_searched' | 'tokens_used'? | 'early_stopped'? | 'signals'?
    const documentedRequired = ['results', 'query', 'total_results', 'search_mode', 'tiers_searched'];
    for (const k of documentedRequired) {
      expect(response).toHaveProperty(k);
    }
  });

  it('per-result RecallResult fields match the documented contract', () => {
    const result: RecallResult = {
      id: 'm1',
      tier: 'preferences',
      content: 'c',
      metadata: { type: 't', topics: [], persons: [], created: '2026-05-01', updated: '2026-05-01' },
      score: 1.0,
      match_type: 'hybrid',
    };
    const documentedRequired = ['id', 'tier', 'content', 'metadata', 'score', 'match_type'];
    for (const k of documentedRequired) {
      expect(result).toHaveProperty(k);
    }
    // metadata sub-shape preserved from prior spec
    expect(result.metadata).toHaveProperty('type');
    expect(result.metadata).toHaveProperty('topics');
  });

  it('signals[] field still present from SPEC-043 (not removed by SPEC-044)', () => {
    // signals[] is optional in the type but should be defined whenever the
    // recall path produces results — the SPEC-043 contract.
    const response: RecallResponse = {
      results: [],
      query: 'q',
      total_results: 0,
      search_mode: 'semantic',
      tiers_searched: [],
      signals: [],
    };
    expect(Array.isArray(response.signals)).toBe(true);
  });
});
