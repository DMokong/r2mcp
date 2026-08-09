import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveModelTier,
  resetModelTierWarnings,
  envVarForPurpose,
  GLOBAL_ENV_VAR,
  type ModelPurpose,
} from '../src/model-tier.js';

// claw-x1mg: model tiers used to be hardcoded at each call site, so retuning a
// scheduled job's model meant a source edit + publish + re-vendor. These tests
// pin the resolution order, the shipped defaults, and the fail-open behaviour.

const PURPOSES: ModelPurpose[] = [
  'compile-wiki',
  'classify-edges-stage1',
  'classify-edges-stage2',
  'extract-entities',
];

const MANAGED_VARS = [GLOBAL_ENV_VAR, ...PURPOSES.map(envVarForPurpose)];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const v of MANAGED_VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  resetModelTierWarnings();
});

afterEach(() => {
  for (const v of MANAGED_VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
  vi.restoreAllMocks();
});

describe('resolveModelTier — shipped defaults', () => {
  it('never defaults any purpose to haiku (standing rule, 2026-08-09)', () => {
    for (const purpose of PURPOSES) {
      expect(resolveModelTier(purpose)).not.toBe('haiku');
    }
  });

  it('defaults the batch/summarization purposes to sonnet', () => {
    expect(resolveModelTier('compile-wiki')).toBe('sonnet');
    expect(resolveModelTier('extract-entities')).toBe('sonnet');
    expect(resolveModelTier('classify-edges-stage1')).toBe('sonnet');
  });

  it('keeps edge classification a genuine cascade — stage 2 outranks stage 1', () => {
    // If both stages resolve to the same tier the cheap-filter → expensive-
    // adjudicator design stops saving anything, which is the whole point of
    // running two stages instead of one.
    expect(resolveModelTier('classify-edges-stage2')).toBe('opus');
    expect(resolveModelTier('classify-edges-stage1')).toBe('sonnet');
  });
});

describe('resolveModelTier — resolution order', () => {
  it('honours the global override for every purpose', () => {
    process.env[GLOBAL_ENV_VAR] = 'opus';
    for (const purpose of PURPOSES) {
      expect(resolveModelTier(purpose)).toBe('opus');
    }
  });

  it('lets a purpose-specific override beat the global one', () => {
    process.env[GLOBAL_ENV_VAR] = 'opus';
    process.env[envVarForPurpose('compile-wiki')] = 'sonnet';
    expect(resolveModelTier('compile-wiki')).toBe('sonnet');
    // ...without leaking into the purposes that didn't set one.
    expect(resolveModelTier('extract-entities')).toBe('opus');
  });

  it('allows explicitly opting back in to haiku', () => {
    // The rule is "never default to haiku", not "haiku is unreachable" — an
    // operator running a huge backfill may still want it.
    process.env[envVarForPurpose('classify-edges-stage1')] = 'haiku';
    expect(resolveModelTier('classify-edges-stage1')).toBe('haiku');
  });

  it('reads at call time, not import time (subprocess env arrives late)', () => {
    expect(resolveModelTier('compile-wiki')).toBe('sonnet');
    process.env[GLOBAL_ENV_VAR] = 'opus';
    expect(resolveModelTier('compile-wiki')).toBe('opus');
  });
});

describe('resolveModelTier — input hygiene', () => {
  it('trims whitespace and is case-insensitive', () => {
    process.env[GLOBAL_ENV_VAR] = '  OPUS  ';
    expect(resolveModelTier('compile-wiki')).toBe('opus');
  });

  it('treats an empty/whitespace-only value as unset', () => {
    process.env[GLOBAL_ENV_VAR] = '   ';
    expect(resolveModelTier('compile-wiki')).toBe('sonnet');
  });
});

describe('resolveModelTier — invalid values fail open, loudly', () => {
  it('falls back to the default rather than throwing', () => {
    // These run inside scheduled launchd jobs; throwing on a typo would take
    // down the nightly memory pipeline, which is worse than using the default.
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env[GLOBAL_ENV_VAR] = 'claude-sonnet-5'; // a model id, not a tier
    expect(resolveModelTier('compile-wiki')).toBe('sonnet');
  });

  it('falls through an invalid purpose override to the valid global one', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env[envVarForPurpose('compile-wiki')] = 'nope';
    process.env[GLOBAL_ENV_VAR] = 'opus';
    expect(resolveModelTier('compile-wiki')).toBe('opus');
  });

  it('names the offending variable and value in the warning', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env[GLOBAL_ENV_VAR] = 'sonnnet';
    resolveModelTier('compile-wiki');
    const written = spy.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toContain(GLOBAL_ENV_VAR);
    expect(written).toContain('sonnnet');
  });

  it('warns once per variable, not once per call', () => {
    // Stage 1 resolves once per candidate pair. An un-deduped warning would
    // emit thousands of identical lines and bury what it was reporting.
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env[GLOBAL_ENV_VAR] = 'bogus';
    for (let i = 0; i < 500; i++) resolveModelTier('classify-edges-stage1');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not warn when the value is valid', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env[GLOBAL_ENV_VAR] = 'opus';
    resolveModelTier('compile-wiki');
    expect(spy).not.toHaveBeenCalled();
  });
});
