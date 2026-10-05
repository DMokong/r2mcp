import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertSafeDataPath,
  canonicalize,
  writeFileSafely,
  CANONICAL_DATA_DIR,
  REPO_ROOT,
} from '../../src/classifiers/eval/safe-write.js';

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

describe('writeFileSafely (round 3, finding 8/E)', () => {
  it('creates a new file (exclusive) and writes the given content', () => {
    const target = join(CANONICAL_DATA_DIR, 'classifier-eval', `wfs-new-${process.pid}.jsonl`);
    cleanup.push(target);
    const written = writeFileSafely(target, 'hello\n');
    expect(readFileSync(written, 'utf-8')).toBe('hello\n');
  });

  it('overwrites an existing plain file on a second call (the regenerate-corpus workflow)', () => {
    const target = join(CANONICAL_DATA_DIR, 'classifier-eval', `wfs-overwrite-${process.pid}.jsonl`);
    cleanup.push(target);
    writeFileSafely(target, 'first\n');
    writeFileSafely(target, 'second\n');
    expect(readFileSync(target, 'utf-8')).toBe('second\n');
  });

  it('refuses when the destination file itself is already a symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wfs-outside-'));
    cleanup.push(dir);
    const decoyTarget = join(dir, 'decoy.txt');
    writeFileSync(decoyTarget, 'private\n', 'utf-8');
    const target = join(CANONICAL_DATA_DIR, 'classifier-eval', `wfs-symlinked-file-${process.pid}.jsonl`);
    symlinkSync(decoyTarget, target);
    cleanup.push(target);
    expect(() => writeFileSafely(target, 'new content\n')).toThrow(/is a symlink/);
    // And the decoy target must be untouched — the write never happened.
    expect(readFileSync(decoyTarget, 'utf-8')).toBe('private\n');
  });

  it('refuses when the destination directory itself is already a symlink', () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'wfs-outside-dir-'));
    cleanup.push(outsideDir);
    const linkDir = join(CANONICAL_DATA_DIR, 'classifier-eval', `wfs-symlinked-dir-${process.pid}`);
    symlinkSync(outsideDir, linkDir);
    cleanup.push(linkDir);
    expect(() => writeFileSafely(join(linkDir, 'file.jsonl'), 'x')).toThrow(/is a symlink/);
    expect(existsSync(join(outsideDir, 'file.jsonl'))).toBe(false);
  });
});
