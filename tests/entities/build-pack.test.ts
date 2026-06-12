import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * SPEC-046 AC10 packaging-readiness gate.
 *
 * Verifies the npm package manifest includes `dist/cli/extract-entities.js`
 * (alongside the SPEC-045 trio: classify-edges, compile-wiki, dump-edges-json).
 *
 * Implementation note: uses `npm pack --dry-run --json` and parses the file list,
 * rather than grepping stderr text. This is more robust across npm versions
 * (which have shifted log formatting in the human-readable `npm notice` lines)
 * and faster to assert against than a regex over the full stderr blob.
 *
 * `npm pack --dry-run` can take ~5-15s on a cold cache because it stages the
 * full file list. We use a generous per-test timeout to avoid CI flakes on
 * slower runners.
 */
describe('SPEC-046 AC10 build product ships extract-entities.js', () => {
  it(
    'npm pack --dry-run manifest includes dist/cli/extract-entities.js',
    () => {
      const cwd = resolve(__dirname, '..', '..');
      const stdout = execSync('npm pack --dry-run --json 2>/dev/null', {
        cwd,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout) as Array<{
        files: Array<{ path: string }>;
      }>;
      expect(parsed).toHaveLength(1);
      const paths = parsed[0]!.files.map((f) => f.path);

      // Primary AC10 assertion: extract-entities.js ships
      expect(paths).toContain('dist/cli/extract-entities.js');

      // Companion check: the SPEC-045 trio still ships (regression guard)
      expect(paths).toContain('dist/cli/classify-edges.js');
      expect(paths).toContain('dist/cli/compile-wiki.js');
      expect(paths).toContain('dist/cli/dump-edges-json.js');
    },
    30_000,
  );
});
