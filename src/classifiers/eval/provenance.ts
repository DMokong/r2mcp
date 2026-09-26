/**
 * Corpus provenance (trk-7mx.1 review round 2, fix #3): path string equality
 * is not proof a corpus is the public fixture — a locally replaced file at
 * the same path would be silently trusted. Provenance requires the resolved
 * path's REAL path (symlinks resolved) to be the fixture's real path, AND
 * its content to match a sha256 pinned in code. Anything else is db-sample.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { CorpusSource } from './egress-guard.js';

/** src/classifiers/eval/ -> repo root -> tests/fixtures/. */
export const PUBLIC_FIXTURE_PATH = fileURLToPath(
  new URL('../../../tests/fixtures/edge-corpus.jsonl', import.meta.url),
);

/**
 * sha256 of tests/fixtures/edge-corpus.jsonl's exact bytes. This pin — not
 * the path — is what makes the fixture "public". Recompute and update it
 * whenever the fixture's content intentionally changes (e.g. new
 * hand-labelled pairs): `shasum -a 256 tests/fixtures/edge-corpus.jsonl`.
 */
export const PUBLIC_FIXTURE_SHA256 = '0fc1f9a2ada58b5c9ed496ec217695b333c1d2299c46712ef39d4ad144c97513';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Resolves corpus provenance. Only the exact, unmodified public fixture (by
 * real path AND content hash) is 'public-fixture' — every other corpus,
 * including a tampered file sitting at the fixture's own path or a symlink
 * pointing elsewhere, is 'db-sample'.
 */
export function determineCorpusSource(corpusPath: string): CorpusSource {
  let real: string;
  try {
    real = realpathSync(corpusPath);
  } catch {
    return 'db-sample'; // doesn't exist (yet) — loadCorpus will fail with a clear error
  }

  let fixtureReal: string;
  try {
    fixtureReal = realpathSync(PUBLIC_FIXTURE_PATH);
  } catch {
    return 'db-sample';
  }

  if (real !== fixtureReal) return 'db-sample';

  if (sha256(real) !== PUBLIC_FIXTURE_SHA256) {
    throw new Error(
      `${corpusPath} resolves to the public fixture's path but its content does not match the pinned ` +
        `PUBLIC_FIXTURE_SHA256 in src/classifiers/eval/provenance.ts. If you intentionally edited ` +
        `tests/fixtures/edge-corpus.jsonl, recompute the hash and update the pin.`,
    );
  }

  return 'public-fixture';
}
