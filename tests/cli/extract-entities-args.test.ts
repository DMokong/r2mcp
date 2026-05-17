// SPEC-046 R6 / AC8 — CLI argv-parse mutual-exclusion test.
//
// The extract-entities CLI must reject `--full` and `--since-days=N` together
// at argument parse time, with a non-zero exit and a stderr message that names
// BOTH flags. parseArgs() is exported and throws UsageError so we can assert
// the exit-code contract without spawning a subprocess.
//
// Gate-2b eval-quality recommended this test specifically:
//   "A test that calls the driver with {full: true, since_days: 7} and
//    asserts a non-zero exit + a descriptive error message is missing."

import { describe, it, expect } from 'vitest';
import { parseArgs, UsageError } from '../../scripts/extract-entities.js';

describe('SPEC-046 R6/AC8 extract-entities CLI argv parser', () => {
  it('throws UsageError(exitCode=2) for --full together with --since-days', () => {
    let caught: unknown;
    try {
      parseArgs(['--full', '--since-days=7']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UsageError);
    const err = caught as UsageError;
    // Non-zero exit code preserved from the previous process.exit(2) behavior
    expect(err.exitCode).toBe(2);
    // Message names BOTH conflicting flags
    expect(err.message).toMatch(/--full/);
    expect(err.message).toMatch(/--since-days/);
    expect(err.message).toMatch(/mutually exclusive/i);
  });

  it('throws UsageError(exitCode=2) regardless of flag order', () => {
    expect(() => parseArgs(['--since-days=3', '--full'])).toThrow(UsageError);
    expect(() => parseArgs(['--full', '--since-days=0'])).toThrow(UsageError);
  });

  it('accepts --full alone', () => {
    const args = parseArgs(['--full']);
    expect(args.full).toBe(true);
    expect(args.sinceDays).toBeUndefined();
  });

  it('accepts --since-days alone', () => {
    const args = parseArgs(['--since-days=7']);
    expect(args.full).toBe(false);
    expect(args.sinceDays).toBe(7);
  });

  it('rejects an unknown --provider value with a clear message', () => {
    let caught: unknown;
    try {
      parseArgs(['--provider=gpt']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UsageError);
    expect((caught as Error).message).toMatch(/claude-code\|anthropic\|openrouter/);
    expect((caught as Error).message).toMatch(/gpt/);
  });
});
