/**
 * MCP tool handler test — verifies the `compile()` MCP tool spawns the
 * `compile-wiki` subprocess and parses its JSON summary back to the caller.
 *
 * The constraint-of-record (SPEC-044): the MCP server makes no LLM calls.
 * All provider calls happen in the subprocess. This test mocks the spawn
 * step so we can assert on the args composed by the handler and the parse
 * logic for the subprocess summary.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { compile } from '../../src/tools/compile.js';

function fakeSpawn(stdoutBytes: string, exitCode: number, stderrBytes = '') {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter; stderr: EventEmitter; kill: (signal?: string) => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  setImmediate(() => {
    if (stdoutBytes) child.stdout.emit('data', Buffer.from(stdoutBytes));
    if (stderrBytes) child.stderr.emit('data', Buffer.from(stderrBytes));
    child.emit('exit', exitCode, null);
  });
  return child;
}

function mockSummary() {
  return {
    run_id: 'run-1', started_at: '', ended_at: '',
    files_written: ['preferences.md'], files_deleted: [],
    total_cost_usd: 0.005, hit_cost_cap: false,
    provider: 'claude-code', source_git_sha: 'abc',
    manifest_path: '/tmp/manifest.json', dry_run: false,
  };
}

describe('compile() MCP tool — subprocess delegation', () => {
  it('rejects inputs with zero or multiple modes', async () => {
    await expect(compile({}, {})).rejects.toThrow(/exactly one of/);
    await expect(compile({ tier: 'preferences', all: true }, {})).rejects.toThrow(/exactly one of/);
  });

  it('passes --tier flag to subprocess and parses summary JSON', async () => {
    let capturedArgs: string[] | undefined;
    const summary = mockSummary();
    const spawnFn = vi.fn((bin: string, args: string[]) => {
      capturedArgs = [bin, ...args];
      return fakeSpawn(JSON.stringify(summary, null, 2) + '\n', 0);
    }) as unknown as typeof import('node:child_process').spawn;
    const result = await compile({ tier: 'preferences' }, { spawnFn });
    expect(result.run_id).toBe('run-1');
    expect(result.provider).toBe('claude-code');
    expect(['tsx', 'node']).toContain(capturedArgs?.[0]);
    expect(capturedArgs?.[1]).toMatch(/\/cli\/compile-wiki\.(ts|js)$/);
    expect(capturedArgs).toContain('--tier=preferences');
  });

  it('passes --all + --dry-run flags', async () => {
    let capturedArgs: string[] | undefined;
    const spawnFn = vi.fn((bin: string, args: string[]) => {
      capturedArgs = [bin, ...args];
      return fakeSpawn(JSON.stringify(mockSummary()), 0);
    }) as unknown as typeof import('node:child_process').spawn;
    await compile({ all: true, dry_run: true }, { spawnFn });
    expect(capturedArgs).toContain('--all');
    expect(capturedArgs).toContain('--dry-run');
  });

  it('passes --topic, --max-cost, and --provider flags', async () => {
    let capturedArgs: string[] | undefined;
    const spawnFn = vi.fn((bin: string, args: string[]) => {
      capturedArgs = [bin, ...args];
      return fakeSpawn(JSON.stringify(mockSummary()), 0);
    }) as unknown as typeof import('node:child_process').spawn;
    await compile(
      { topic: 'wiki-mode', max_cost_usd: 0.5, provider: 'anthropic' },
      { spawnFn },
    );
    expect(capturedArgs).toContain('--topic=wiki-mode');
    expect(capturedArgs).toContain('--max-cost=0.5');
    expect(capturedArgs).toContain('--provider=anthropic');
  });

  it('rejects when the subprocess exits non-zero', async () => {
    const spawnFn = vi.fn(() => fakeSpawn('', 1, 'fatal: no provider')) as unknown as typeof import('node:child_process').spawn;
    await expect(compile({ tier: 'preferences' }, { spawnFn })).rejects.toThrow(/exited 1/);
  });

  it('rejects when the subprocess produces no parseable JSON', async () => {
    const spawnFn = vi.fn(() => fakeSpawn('not json output', 0)) as unknown as typeof import('node:child_process').spawn;
    await expect(compile({ tier: 'preferences' }, { spawnFn })).rejects.toThrow(/no parseable summary/);
  });

  it('parses the trailing summary even when prior JSON-shaped output preceded it', async () => {
    // The compile-wiki CLI may emit dry-run preview content that looks JSON-ish
    // before its final summary. The parser must skip those and pick only the
    // last balanced top-level JSON object.
    const dryRunNoise = '{"some_other": "shape", "with": {"nested": "json"}}';
    const trailingSummary = JSON.stringify(mockSummary(), null, 2);
    const stdout = `${dryRunNoise}\n--- DRY RUN: ... ---\nsome random text\n${trailingSummary}\n`;
    const spawnFn = vi.fn(() => fakeSpawn(stdout, 0)) as unknown as typeof import('node:child_process').spawn;
    const result = await compile({ tier: 'preferences' }, { spawnFn });
    expect(result.run_id).toBe('run-1');
  });
});
