import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { ClaudeCodeProvider, parseClaudeJson, probeClaudeCode } from '../../src/providers/claude-code.js';

/**
 * Build a minimal mock of the child_process API surface that the adapter uses.
 * The mock emits 'data' on stdout, then 'exit' with the supplied code.
 */
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

describe('parseClaudeJson', () => {
  it('extracts result string from a top-level result envelope', () => {
    const env = parseClaudeJson('{"result":"hello world","cost_usd":0}');
    expect(env.text).toBe('hello world');
  });

  it('extracts text from a messages-array envelope', () => {
    const stdout = JSON.stringify({
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
      ],
    });
    expect(parseClaudeJson(stdout).text).toBe('a');
  });

  it('throws when the envelope has no readable text', () => {
    expect(() => parseClaudeJson('{"unrelated":1}')).toThrow(/no readable response/);
  });

  it('throws on non-JSON output', () => {
    expect(() => parseClaudeJson('not json')).toThrow(/not JSON/);
  });
});

describe('ClaudeCodeProvider', () => {
  it('reports its name and concurrencyLimit=2 (D.R6)', () => {
    const p = new ClaudeCodeProvider();
    expect(p.name).toBe('claude-code');
    expect(p.concurrencyLimit).toBe(2);
  });

  it('complete() returns cost_usd === 0 exactly (D.AC5 strict equality)', async () => {
    const spawnFn = vi.fn(() =>
      fakeSpawn('{"result":"YES — both same topic"}', 0),
    ) as unknown as typeof import('node:child_process').spawn;
    const p = new ClaudeCodeProvider({ spawnFn });
    const result = await p.complete({ model: 'haiku', prompt: 'hi' });
    expect(result.response).toBe('YES — both same topic');
    expect(result.cost_usd).toBe(0); // strict equality, not ≈ 0
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('rejects when the subprocess exits non-zero', async () => {
    const spawnFn = vi.fn(() =>
      fakeSpawn('', 1, 'auth error'),
    ) as unknown as typeof import('node:child_process').spawn;
    const p = new ClaudeCodeProvider({ spawnFn });
    await expect(p.complete({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/exited 1/);
  });

  it('passes --model with the mapped logical name', async () => {
    let capturedArgs: string[] | undefined;
    const spawnFn = vi.fn((bin: string, args: string[]) => {
      capturedArgs = args;
      return fakeSpawn('{"result":"ok"}', 0);
    }) as unknown as typeof import('node:child_process').spawn;
    const p = new ClaudeCodeProvider({ spawnFn });
    await p.complete({ model: 'opus', prompt: 'classify this' });
    expect(capturedArgs).toContain('--model');
    const idx = capturedArgs?.indexOf('--model') ?? -1;
    expect(capturedArgs?.[idx + 1]).toBe('claude-opus-4-7');
  });
});

describe('probeClaudeCode', () => {
  it('returns true when the binary returns a parseable JSON envelope', async () => {
    const spawnFn = vi.fn(() =>
      fakeSpawn('{"result":"ok"}', 0),
    ) as unknown as typeof import('node:child_process').spawn;
    expect(await probeClaudeCode({ spawnFn })).toBe(true);
  });

  it('returns false when the binary cannot be launched', async () => {
    const spawnFn = vi.fn(() => {
      throw new Error('ENOENT');
    }) as unknown as typeof import('node:child_process').spawn;
    expect(await probeClaudeCode({ spawnFn })).toBe(false);
  });

  it('returns false when the binary exits non-zero', async () => {
    const spawnFn = vi.fn(() =>
      fakeSpawn('', 1, 'not logged in'),
    ) as unknown as typeof import('node:child_process').spawn;
    expect(await probeClaudeCode({ spawnFn })).toBe(false);
  });
});

describe('spawn-failure remediation (claw-8cjf.7)', () => {
  function fakeSpawnEnoent() {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: (signal?: string) => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    setImmediate(() => {
      child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
    });
    return child;
  }

  it('ENOENT spawn failure names R2MCP_CLAUDE_BIN in the error', async () => {
    const spawnFn = vi.fn(() =>
      fakeSpawnEnoent(),
    ) as unknown as typeof import('node:child_process').spawn;
    const p = new ClaudeCodeProvider({ spawnFn });
    await expect(p.complete({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/R2MCP_CLAUDE_BIN/);
  });

  it('non-ENOENT spawn errors pass through unwrapped', async () => {
    const spawnFn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: (signal?: string) => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      setImmediate(() => {
        child.emit('error', Object.assign(new Error('spawn claude EACCES'), { code: 'EACCES' }));
      });
      return child;
    }) as unknown as typeof import('node:child_process').spawn;
    const p = new ClaudeCodeProvider({ spawnFn });
    await expect(p.complete({ model: 'haiku', prompt: 'hi' })).rejects.toThrow(/EACCES/);
  });
});
