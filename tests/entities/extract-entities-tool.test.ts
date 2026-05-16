/**
 * SPEC-046 Task 8 — MCP tool wrapper test.
 *
 * Three required cases:
 *   1. Success path parses the RunSummary JSON printed to stdout.
 *   2. Non-zero exit propagates as an MCP error (stderr surfaced).
 *   3. Timeout SIGKILLs the child process and rejects.
 *
 * Mirrors tests/tools/classify.test.ts — uses dependency injection via
 * `spawnFn` rather than vi.mock('node:child_process'), matching the
 * canonical r2mcp subprocess-tool test pattern (avoids module-level mock
 * state, no useFakeTimers needed).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { extractEntitiesTool } from '../../src/tools/extract-entities.js';
import type { RunSummary } from '../../src/entities/types.js';

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

function mockRunSummary(): RunSummary {
  return {
    run_id: 'r-1',
    started_at: '2026-05-16T04:00:00Z',
    ended_at: '2026-05-16T04:02:00Z',
    memories_seen: 5,
    memories_extracted: 5,
    entities_created: 2,
    entities_updated: 0,
    links_created: 6,
    total_cost_usd: 0.07,
    hit_cost_cap: false,
    parse_failures: 0,
  };
}

describe('extract_entities MCP tool — subprocess delegation', () => {
  it('spawns the driver via resolveCliCommand and returns parsed RunSummary', async () => {
    let capturedArgs: string[] | undefined;
    const summary = mockRunSummary();
    const spawnFn = vi.fn((bin: string, args: string[]) => {
      capturedArgs = [bin, ...args];
      return fakeSpawn(JSON.stringify(summary, null, 2) + '\n', 0);
    }) as unknown as typeof import('node:child_process').spawn;

    const result = await extractEntitiesTool(
      { since_days: 7, max_cost_usd: 0.5, provider: 'claude-code' },
      { spawnFn },
    );

    expect(result.run_id).toBe('r-1');
    expect(result.entities_created).toBe(2);
    expect(result.links_created).toBe(6);
    expect(['tsx', 'node']).toContain(capturedArgs?.[0]);
    expect(capturedArgs?.[1]).toMatch(/\/scripts\/extract-entities\.(ts|js)$/);
    expect(capturedArgs).toContain('--since-days=7');
    expect(capturedArgs).toContain('--max-cost=0.5');
    expect(capturedArgs).toContain('--provider=claude-code');
  });

  it('propagates non-zero exit as an MCP error with stderr tail', async () => {
    const spawnFn = vi.fn(() =>
      fakeSpawn('partial output', 2, 'fatal: provider unavailable'),
    ) as unknown as typeof import('node:child_process').spawn;

    await expect(extractEntitiesTool({}, { spawnFn })).rejects.toThrow(/exited 2/);
  });

  it('SIGKILLs the child and rejects on timeout', async () => {
    const killSpy = vi.fn();
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter; stderr: EventEmitter; kill: (signal?: string) => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = killSpy;
      // Never emit 'exit' — let the runTimeoutMs timer fire.
      return child;
    }) as unknown as typeof import('node:child_process').spawn;

    const promise = extractEntitiesTool({}, { spawnFn, runTimeoutMs: 10 });
    await expect(promise).rejects.toThrow(/timed out/);
    expect(killSpy).toHaveBeenCalledWith('SIGKILL');
  });
});
