import { describe, it, expect } from 'vitest';
import {
  computeStaleFiles,
} from '../../src/compiler/manifest.js';
import type { CompileManifest } from '../../src/compiler/types.js';

const baseManifest: CompileManifest = {
  run_id: 'r1',
  generated_at: '2026-05-04T00:00:00Z',
  tiers: [
    { tier: 'preferences', path: 'preferences.md', source_memory_ids: ['m1', 'm2'] },
  ],
  topics: [
    { topic: 'wiki-mode', path: 'topics/wiki-mode.md', source_memory_ids: ['m1'] },
  ],
};

describe('computeStaleFiles (B.AC8)', () => {
  it('returns no stale files on the first run (no prior manifest)', () => {
    const stale = computeStaleFiles(null, baseManifest, { tiers: [], topics: [], allTopics: false });
    expect(stale).toEqual([]);
  });

  it('marks a topic file dropped from the next run as stale', () => {
    const next: CompileManifest = {
      ...baseManifest,
      run_id: 'r2',
      topics: [], // topic dropped
    };
    const stale = computeStaleFiles(baseManifest, next, {
      tiers: [],
      topics: ['wiki-mode'],
      allTopics: false,
    });
    expect(stale).toContain('topics/wiki-mode.md');
  });

  it('does not delete topic files outside the scope of the current run', () => {
    const next: CompileManifest = {
      ...baseManifest,
      run_id: 'r2',
      topics: [],
    };
    // We only touched the 'preferences' tier this run, no topics
    const stale = computeStaleFiles(baseManifest, next, {
      tiers: ['preferences'],
      topics: [],
      allTopics: false,
    });
    expect(stale).not.toContain('topics/wiki-mode.md');
  });

  it('does not delete tier files outside the scope of the current run', () => {
    // Prior run wrote two tiers; this run only updated one
    const prior: CompileManifest = {
      ...baseManifest,
      tiers: [
        { tier: 'preferences', path: 'preferences.md', source_memory_ids: ['m1'] },
        { tier: 'project-context', path: 'project-context.md', source_memory_ids: ['m2'] },
      ],
    };
    const next: CompileManifest = {
      run_id: 'r2',
      generated_at: '2026-05-04T01:00:00Z',
      tiers: [
        { tier: 'preferences', path: 'preferences.md', source_memory_ids: ['m1', 'm3'] },
      ],
      topics: [],
    };
    const stale = computeStaleFiles(prior, next, {
      tiers: ['preferences'],
      topics: [],
      allTopics: false,
    });
    expect(stale).not.toContain('project-context.md');
  });
});
