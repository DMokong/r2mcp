/**
 * Symlink-safe containment check for classifier-eval output paths (trk-7mx.1
 * review round 2, fix #8). A lexical/string path check can be defeated by a
 * symlinked ancestor directory; canonicalize first, then require the
 * canonical destination sit under the repo's canonical data/ dir, THEN run
 * git check-ignore — in that order, since check-ignore on an
 * un-canonicalized path proves nothing about where the write actually lands.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
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

/**
 * Refuses if `path` already exists AND is a symlink (round 3, finding 8/E).
 * A no-op if `path` doesn't exist — nothing planted there yet to refuse.
 */
function assertNotSymlink(path: string, label: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to write: ${label} (${path}) is a symlink, not a plain ${label}.`);
  }
}

/**
 * Writes `content` to `targetPath` under data/, combining every write-path
 * guard the harness has needed:
 *   - assertSafeDataPath (round 2, fix #8): canonicalize, contain under the
 *     repo's data/ dir, git check-ignore.
 *   - round 3, finding 8/E (partial): lstat the destination file itself and
 *     its immediate parent directory BEFORE writing, on the caller's
 *     original (pre-canonicalize) path, and refuse if either is already a
 *     symlink — a symlink planted at the exact destination isn't "resolved
 *     through" like a merely-in-the-way ancestor (e.g. macOS's /tmp), it's
 *     refused outright. Then use an exclusive ('wx') create for a file that
 *     doesn't exist yet, so nothing can be silently overwritten through a
 *     symlink that appears in the gap between this check and the write.
 *     Explicitly OUT of scope: a hostile process racing to swap the path
 *     mid-write. The threat model here is accidental leakage, not a local
 *     attacker — see the round-3 brief.
 */
export function writeFileSafely(targetPath: string, content: string): string {
  const original = resolve(targetPath);
  assertNotSymlink(dirname(original), 'destination directory');
  assertNotSymlink(original, 'destination file');

  const canonical = assertSafeDataPath(targetPath);
  mkdirSync(dirname(canonical), { recursive: true });
  const exists = existsSync(canonical);
  writeFileSync(canonical, content, { encoding: 'utf-8', flag: exists ? 'w' : 'wx' });
  return canonical;
}
