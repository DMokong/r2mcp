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

describe('recall() response shape pin (C.AC7, claw-ohhj.3 compact wire shape)', () => {
  it('top-level RecallResponse keys match the documented contract', () => {
    // Minimal valid shape, by type. If any required field is missing or any
    // unexpected field becomes required, TypeScript will flag this literal.
    // claw-ohhj.3: `query` echo and `total_results` are gone from the wire
    // shape; `early_stopped` appears only when true; `signals` only when
    // non-empty.
    const response: RecallResponse = {
      results: [],
      search_mode: 'semantic',
      tiers_searched: [],
    };
    const documentedRequired = ['results', 'search_mode', 'tiers_searched'];
    for (const k of documentedRequired) {
      expect(response).toHaveProperty(k);
    }
    expect(response).not.toHaveProperty('query');
    expect(response).not.toHaveProperty('total_results');
  });

  it('per-result RecallResult fields match the documented contract', () => {
    // claw-ohhj.3: single `updated` timestamp; `persons` optional (elided
    // when empty); score arrives rounded to 3 decimals.
    const result: RecallResult = {
      id: 'm1',
      tier: 'preferences',
      content: 'c',
      metadata: { type: 't', topics: [], updated: '2026-05-01' },
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
    expect(result.metadata).not.toHaveProperty('created');
  });

  it('signals[] survives from SPEC-043 when edges exist (elided only when empty)', () => {
    const response: RecallResponse = {
      results: [],
      search_mode: 'semantic',
      tiers_searched: [],
      signals: [{ kind: 'contradicts', from_id: 'a', to_id: 'b' }],
    };
    expect(Array.isArray(response.signals)).toBe(true);
  });
});
