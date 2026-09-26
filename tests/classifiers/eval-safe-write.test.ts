import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeDataPath, canonicalize, CANONICAL_DATA_DIR, REPO_ROOT } from '../../src/classifiers/eval/safe-write.js';

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

describe('canonicalize (fix #8)', () => {
  it('resolves a not-yet-existing path under an existing directory', () => {
    const canonical = canonicalize(join(CANONICAL_DATA_DIR, 'classifier-eval', 'does-not-exist-yet.jsonl'));
    expect(canonical).toBe(join(CANONICAL_DATA_DIR, 'classifier-eval', 'does-not-exist-yet.jsonl'));
  });

  it('resolves a symlinked ancestor directory to its real location', () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'safe-write-outside-'));
    cleanup.push(outsideDir);
    const linkDir = join(CANONICAL_DATA_DIR, `escape-link-${process.pid}`);
    symlinkSync(outsideDir, linkDir);
    cleanup.push(linkDir);
    try {
      const canonical = canonicalize(join(linkDir, 'file.jsonl'));
      // realpath resolves the symlinked ancestor, so the canonical destination is
      // OUTSIDE data/ even though the lexical path looked like it was inside it.
      // (outsideDir itself may contain a symlinked component on macOS, e.g. /tmp -> /private/tmp,
      // so compare against ITS realpath too rather than the raw mkdtempSync string.)
      expect(canonical.startsWith(realpathSync(outsideDir))).toBe(true);
    } finally {
      rmSync(linkDir, { force: true });
    }
  });
});

describe('assertSafeDataPath (fix #8)', () => {
  it('allows a path genuinely under the repo canonical data/ dir', () => {
    mkdirSync(join(CANONICAL_DATA_DIR, 'classifier-eval'), { recursive: true });
    const canonical = assertSafeDataPath(join(CANONICAL_DATA_DIR, 'classifier-eval', 'safe-write-test.jsonl'));
    expect(canonical.startsWith(`${CANONICAL_DATA_DIR}/`)).toBe(true);
  });

  it('rejects a destination outside data/, even when lexically it looks contained ("data/../../etc/passwd")', () => {
    expect(() => assertSafeDataPath(join(CANONICAL_DATA_DIR, '..', 'escaped.jsonl'))).toThrow(/not under the repo's canonical data/);
  });

  it('rejects a symlinked ancestor directory that resolves outside data/, even though check-ignore would pass on data/ itself', () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'safe-write-outside-'));
    cleanup.push(outsideDir);
    const linkDir = join(CANONICAL_DATA_DIR, `escape-link-${process.pid}-2`);
    symlinkSync(outsideDir, linkDir);
    try {
      expect(() => assertSafeDataPath(join(linkDir, 'file.jsonl'))).toThrow(/not under the repo's canonical data/);
    } finally {
      rmSync(linkDir, { force: true });
    }
  });

  it("resolves under the real repo's data/ directory, not some arbitrary root", () => {
    expect(CANONICAL_DATA_DIR).toBe(join(REPO_ROOT, 'data'));
    expect(existsSync(REPO_ROOT)).toBe(true);
  });
});
