import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ClaudeCodeProvider,
  SLIM_SYSTEM_PROMPT,
  concurrencyFromEnv,
  parseClaudeJson,
  probeClaudeCode,
} from '../../src/providers/claude-code.js';

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
    expect(capturedArgs?.[idx + 1]).toBe('claude-opus-5');
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

describe('slim harness (trk-72v)', () => {
  type Call = { args: string[]; opts: { cwd?: string } };
  const slimCwd = join(tmpdir(), `r2mcp-slim-test-${process.pid}`);

  function capture(stdout = '{"result":"ok"}') {
    const calls: Call[] = [];
    const spawnFn = vi.fn((_bin: string, args: string[], opts: { cwd?: string }) => {
      calls.push({ args, opts });
      return fakeSpawn(stdout, 0);
    }) as unknown as typeof import('node:child_process').spawn;
    return { calls, spawnFn };
  }

  const flagValue = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(slimCwd, { recursive: true, force: true });
  });

  it('runs complete() without the project harness by default', async () => {
    const { calls, spawnFn } = capture();
    const p = new ClaudeCodeProvider({ spawnFn, slimCwd });
    await p.complete({ model: 'sonnet', prompt: 'classify' });

    const { args } = calls[0];
    expect(args.slice(0, 5)).toEqual(['-p', 'classify', '--output-format=json', '--model', 'claude-sonnet-5']);
    expect(flagValue(args, '--setting-sources')).toBe('project');
    expect(flagValue(args, '--tools')).toBe('');
    expect(flagValue(args, '--system-prompt')).toBe(SLIM_SYSTEM_PROMPT);
    for (const flag of ['--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) {
      expect(args).toContain(flag);
    }
    expect(args).not.toContain('--bare'); // --bare never reads OAuth credentials
  });

  it('runs slim calls from an empty directory it creates, outside the caller cwd', async () => {
    const { calls, spawnFn } = capture();
    const p = new ClaudeCodeProvider({ spawnFn, slimCwd });
    await p.complete({ model: 'haiku', prompt: 'hi' });

    expect(calls[0].opts.cwd).toBe(slimCwd);
    expect(existsSync(slimCwd)).toBe(true);
    expect(slimCwd.startsWith(process.cwd())).toBe(false);
  });

  it('keeps the inlined [SYSTEM] section in the prompt', async () => {
    const { calls, spawnFn } = capture();
    const p = new ClaudeCodeProvider({ spawnFn, slimCwd });
    await p.complete({ model: 'haiku', system: 'You are a filter.', prompt: 'A vs B' });
    expect(calls[0].args[1]).toBe('[SYSTEM]\nYou are a filter.\n[/SYSTEM]\n\nA vs B');
  });

  it('slim: false spawns the original argument list with no cwd override', async () => {
    const { calls, spawnFn } = capture();
    const p = new ClaudeCodeProvider({ spawnFn, slim: false, slimCwd });
    await p.complete({ model: 'haiku', prompt: 'hi' });
    expect(calls[0].args).toEqual(['-p', 'hi', '--output-format=json', '--model', 'claude-haiku-4-5']);
    expect(calls[0].opts.cwd).toBeUndefined();
  });

  it('R2MCP_CLAUDE_SLIM=0 turns slim mode off', async () => {
    vi.stubEnv('R2MCP_CLAUDE_SLIM', '0');
    const { calls, spawnFn } = capture();
    await new ClaudeCodeProvider({ spawnFn, slimCwd }).complete({ model: 'haiku', prompt: 'hi' });
    expect(calls[0].args).not.toContain('--setting-sources');
  });

  it('probeClaudeCode is slim too', async () => {
    const { calls, spawnFn } = capture();
    expect(await probeClaudeCode({ spawnFn, slimCwd })).toBe(true);
    expect(calls[0].args.slice(0, 3)).toEqual(['-p', 'ok', '--output-format=json']);
    expect(calls[0].args).toContain('--no-session-persistence');
    expect(calls[0].opts.cwd).toBe(slimCwd);
  });
});

describe('concurrency limit (trk-72v)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to 2 and honours a valid R2MCP_CLAUDE_CONCURRENCY', () => {
    expect(concurrencyFromEnv({})).toBe(2);
    expect(concurrencyFromEnv({ R2MCP_CLAUDE_CONCURRENCY: '4' })).toBe(4);
  });

  it('ignores values that are not an integer in 1..16', () => {
    for (const bad of ['0', '-1', '2.5', 'many', '17', '']) {
      expect(concurrencyFromEnv({ R2MCP_CLAUDE_CONCURRENCY: bad })).toBe(2);
    }
  });

  it('reads the env at construction, and an explicit option wins', () => {
    vi.stubEnv('R2MCP_CLAUDE_CONCURRENCY', '6');
    expect(new ClaudeCodeProvider().concurrencyLimit).toBe(6);
    expect(new ClaudeCodeProvider({ concurrencyLimit: 3 }).concurrencyLimit).toBe(3);
  });
});
