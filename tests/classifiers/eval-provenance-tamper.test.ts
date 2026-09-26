import { describe, it, expect, vi } from 'vitest';

// Isolated in its own file: node:fs is mocked at module scope (hoisted), so a
// tampered-content-at-the-pinned-path scenario can be simulated without ever
// touching the real committed fixture on disk.
vi.mock('node:fs', () => ({
  realpathSync: (p: string) => p, // identity — the "attacker" path and the fixture path collapse
  readFileSync: () => Buffer.from('this is not the fixture the hash was pinned against'),
}));

describe('determineCorpusSource — tampered content at the pinned path (fix #3)', () => {
  it('throws rather than silently granting or downgrading provenance', async () => {
    const { determineCorpusSource, PUBLIC_FIXTURE_PATH } = await import('../../src/classifiers/eval/provenance.js');
    expect(() => determineCorpusSource(PUBLIC_FIXTURE_PATH)).toThrow(/does not match the pinned/);
  });
});
