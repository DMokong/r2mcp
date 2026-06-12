/**
 * Integration test for classify() MCP tool — mocks the spawn step so we
 * can assert on the args composed and the parse logic for the subprocess
 * summary. Mirrors compile-handler.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { classify } from '../../src/tools/classify.js';

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

function mockClassifySummary() {
  return {
    run_id: 'run-classify-1',
    started_at: '2026-05-10T04:00:00Z',
    ended_at: '2026-05-10T04:02:00Z',
    candidate_pairs: 42,
    stage1_total: 42,
    stage1_pass: 12,
    stage1_skip: 30,
    stage2_total: 12,
    stage2_classified: 11,
    edges_written: 9,
    total_cost_usd: 0.0123,
    hit_cost_cap: false,
  };
}

describe('classify() MCP tool — subprocess delegation', () => {
  it('passes since_days, max_cost_usd, provider as CLI flags', async () => {
    let capturedArgs: string[] | undefined;
    const summary = mockClassifySummary();
    const spawnFn = vi.fn((bin: string, args: string[]) => {
      capturedArgs = [bin, ...args];
      return fakeSpawn(JSON.stringify(summary, null, 2) + '\n', 0);
    }) as unknown as typeof import('node:child_process').spawn;

    const result = await classify(
      { since_days: 7, max_cost_usd: 0.5, provider: 'claude-code' },
      { spawnFn },
    );

    expect(result.run_id).toBe('run-classify-1');
    expect(result.edges_written).toBe(9);
    expect(['tsx', 'node']).toContain(capturedArgs?.[0]);
    expect(capturedArgs?.[1]).toMatch(/\/cli\/classify-edges\.(ts|js)$/);
    expect(capturedArgs).toContain('--since=7d');
    expect(capturedArgs).toContain('--max-cost=0.5');
    expect(capturedArgs).toContain('--provider=claude-code');
  });

  it('passes --dry-run + --resume flags', async () => {
    let capturedArgs: string[] | undefined;
    const spawnFn = vi.fn((bin: string, args: string[]) => {
      capturedArgs = [bin, ...args];
      return fakeSpawn(JSON.stringify(mockClassifySummary()) + '\n', 0);
    }) as unknown as typeof import('node:child_process').spawn;

    await classify({ dry_run: true, resume_run_id: 'abc-123' }, { spawnFn });
    expect(capturedArgs).toContain('--dry-run');
    expect(capturedArgs).toContain('--resume=abc-123');
  });

  it('throws with stderr tail on non-zero exit', async () => {
    const spawnFn = vi.fn(() =>
      fakeSpawn('', 1, 'fatal: provider unavailable'),
    ) as unknown as typeof import('node:child_process').spawn;
    await expect(classify({}, { spawnFn })).rejects.toThrow(/exited 1/);
  });

  it('throws with timeout error when subprocess exceeds runTimeoutMs', async () => {
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter; stderr: EventEmitter; kill: (signal?: string) => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      // Never emit 'exit' — let timeout fire
      return child;
    }) as unknown as typeof import('node:child_process').spawn;

    const promise = classify({}, { spawnFn, runTimeoutMs: 10 });
    await expect(promise).rejects.toThrow(/timed out/);
  });
});
