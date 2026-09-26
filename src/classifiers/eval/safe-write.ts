/**
 * Symlink-safe containment check for classifier-eval output paths (trk-7mx.1
 * review round 2, fix #8). A lexical/string path check can be defeated by a
 * symlinked ancestor directory; canonicalize first, then require the
 * canonical destination sit under the repo's canonical data/ dir, THEN run
 * git check-ignore — in that order, since check-ignore on an
 * un-canonicalized path proves nothing about where the write actually lands.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** src/classifiers/eval/ -> repo root. */
export const REPO_ROOT = realpathSync(fileURLToPath(new URL('../../..', import.meta.url)));
export const CANONICAL_DATA_DIR = join(REPO_ROOT, 'data');

/**
 * Resolves `targetPath` to its real, canonical form even though the file
 * itself may not exist yet: walks up to the nearest EXISTING ancestor
 * directory, realpath's THAT (resolving any symlinked components), then
 * re-appends the not-yet-existing tail literally — which can't itself be a
 * symlink, since it doesn't exist.
 */
export function canonicalize(targetPath: string): string {
  const abs = resolve(targetPath);
  let dir = dirname(abs);
  const tail: string[] = [basename(abs)];
  while (!existsSync(dir)) {
    tail.unshift(basename(dir));
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root — nothing left to climb
    dir = parent;
  }
  const realDir = realpathSync(dir);
  return join(realDir, ...tail);
}

/**
 * Throws unless `targetPath` canonicalizes to somewhere under the repo's
 * canonical data/ directory AND git considers it ignored. Returns the
 * canonical path — callers should write to THIS path, not the original
 * argument, to close the gap between the check and the write.
 */
export function assertSafeDataPath(targetPath: string): string {
  const canonical = canonicalize(targetPath);
  const withSep = CANONICAL_DATA_DIR.endsWith('/') ? CANONICAL_DATA_DIR : `${CANONICAL_DATA_DIR}/`;
  if (canonical !== CANONICAL_DATA_DIR && !canonical.startsWith(withSep)) {
    throw new Error(
      `Refusing to write ${targetPath}: it resolves to ${canonical}, which is not under the repo's ` +
        `canonical data/ directory (${CANONICAL_DATA_DIR}). Classifier eval output must stay under data/.`,
    );
  }

  try {
    execFileSync('git', ['check-ignore', '-q', canonical], { stdio: 'ignore' });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) {
      throw new Error(
        `Refusing to write ${targetPath}: git does not consider ${canonical} ignored. ` +
          `Classifier eval data must never be committed.`,
        { cause: err },
      );
    }
    throw err;
  }

  return canonical;
}
