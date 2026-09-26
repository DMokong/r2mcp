import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { determineCorpusSource, PUBLIC_FIXTURE_PATH } from '../../src/classifiers/eval/provenance.js';

const tmpDirs: string[] = [];
function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'provenance-test-'));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('determineCorpusSource (fix #3)', () => {
  it('treats the real, unmodified public fixture as public-fixture', () => {
    expect(determineCorpusSource(PUBLIC_FIXTURE_PATH)).toBe('public-fixture');
  });

  it('treats an unrelated file as db-sample, even with a similar name', () => {
    const dir = tmpDir();
    const decoy = join(dir, 'edge-corpus.jsonl');
    writeFileSync(decoy, '{"from":{},"to":{},"expected_relation":"supports"}\n', 'utf-8');
    expect(determineCorpusSource(decoy)).toBe('db-sample');
  });

  it('treats a DB-sampled corpus path as db-sample', () => {
    const dir = tmpDir();
    const dbCorpus = join(dir, 'corpus.jsonl');
    writeFileSync(dbCorpus, '{}\n', 'utf-8');
    expect(determineCorpusSource(dbCorpus)).toBe('db-sample');
  });

  it('treats a nonexistent path as db-sample rather than throwing', () => {
    expect(determineCorpusSource('/nonexistent/path/does-not-exist.jsonl')).toBe('db-sample');
  });

  it('follows a symlink to the real fixture through to public-fixture (path identity survives realpath)', () => {
    const dir = tmpDir();
    const link = join(dir, 'linked-fixture.jsonl');
    symlinkSync(PUBLIC_FIXTURE_PATH, link);
    expect(determineCorpusSource(link)).toBe('public-fixture');
  });

  it('treats a symlink pointing at a DIFFERENT file as db-sample, not public-fixture', () => {
    const dir = tmpDir();
    const decoyTarget = join(dir, 'decoy.jsonl');
    writeFileSync(decoyTarget, '{"private": "memory text"}\n', 'utf-8');
    const link = join(dir, 'looks-public.jsonl');
    symlinkSync(decoyTarget, link);
    expect(determineCorpusSource(link)).toBe('db-sample');
  });
});
