import { spawn, type ChildProcess } from 'node:child_process';
import type {
  CompleteRequest,
  CompleteResponse,
  LLMProvider,
  LogicalModel,
  ProviderName,
} from './types.js';

/**
 * Claude Code headless adapter.
 *
 * Spawns `claude -p <prompt> --output-format=json` and reads the JSON envelope
 * from stdout. Auth is OAuth-based (Max plan); `cost_usd` is exactly 0 for
 * every call (Max-covered, D.AC5 strict equality).
 *
 * Probe: `probeClaudeCode()` runs a minimal prompt with a 5s timeout to
 * detect whether the binary is on PATH and the user is logged in.
 */

// Map logical models to the model identifiers Claude Code's CLI accepts.
// claw-x1mg: keep these on the LATEST generation of each tier — a stale id
// here is invisible until a job fails at runtime. Validated against the
// installed CLI on 2026-08-09.
const MODEL_IDS: Record<LogicalModel, string> = {
  haiku: 'claude-haiku-4-5',
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-5',
};

const DEFAULT_PROBE_TIMEOUT_MS = 5_000;
const DEFAULT_RUN_TIMEOUT_MS = 120_000;

export interface ClaudeCodeOptions {
  /** Override the binary name (tests use this to point at a stub). */
  binary?: string;
  /** Override the spawn function (tests use this to inject a mock child process). */
  spawnFn?: typeof spawn;
  /** Per-call timeout in milliseconds. Default 120s. */
  runTimeoutMs?: number;
}

export class ClaudeCodeProvider implements LLMProvider {
  readonly name: ProviderName = 'claude-code';
  // Subprocess overhead — keep this conservative. D.R6.
  readonly concurrencyLimit = 2;

  private readonly binary: string;
  private readonly spawnFn: typeof spawn;
  private readonly runTimeoutMs: number;

  constructor(opts: ClaudeCodeOptions = {}) {
    // Resolution precedence: explicit opts.binary → R2MCP_CLAUDE_BIN env →
    // bare 'claude'. The env var lets packaged consumers point at an
    // absolute install path (e.g., ~/.local/bin/claude) when the spawning
    // process inherits a sanitized PATH (launchd jobs, systemd services).
    this.binary = opts.binary ?? process.env.R2MCP_CLAUDE_BIN ?? 'claude';
    this.spawnFn = opts.spawnFn ?? spawn;
    this.runTimeoutMs = opts.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const startedAt = Date.now();
    const args = [
      '-p',
      this.composePrompt(req),
      '--output-format=json',
      '--model',
      MODEL_IDS[req.model],
    ];
    const stdout = await runClaude(this.spawnFn, this.binary, args, this.runTimeoutMs);
    const parsed = parseClaudeJson(stdout);
    return {
      response: parsed.text,
      cost_usd: 0, // Max-covered (D.AC5 strict equality)
      latency_ms: Date.now() - startedAt,
      raw: parsed.raw,
    };
  }

  private composePrompt(req: CompleteRequest): string {
    if (!req.system) return req.prompt;
    // Claude Code headless takes a single prompt string. Inline the system
    // section so the same prompt structure works across providers.
    return `[SYSTEM]\n${req.system}\n[/SYSTEM]\n\n${req.prompt}`;
  }
}

/**
 * Probe whether Claude Code is logged in. Fast (~5s timeout). Used by
 * `selectProvider()` for auto-fallback (D.AC1).
 */
export async function probeClaudeCode(
  opts: {
    binary?: string;
    spawnFn?: typeof spawn;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const binary = opts.binary ?? process.env.R2MCP_CLAUDE_BIN ?? 'claude';
  const spawnFn = opts.spawnFn ?? spawn;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  try {
    const out = await runClaude(spawnFn, binary, ['-p', 'ok', '--output-format=json'], timeoutMs);
    const parsed = parseClaudeJson(out);
    return typeof parsed.text === 'string';
  } catch {
    return false;
  }
}

/**
 * claw-8cjf.7: an ENOENT here means the claude CLI isn't on this process's
 * PATH (common under launchd / MCP hosts with sanitized PATH). Name the
 * escape hatch instead of surfacing a bare `spawn claude ENOENT`.
 */
function wrapSpawnError(err: Error, binary: string): Error {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return err;
  return new Error(
    `could not spawn '${binary}' (ENOENT) — the claude CLI is not on this process's PATH. ` +
      `Set R2MCP_CLAUDE_BIN to the absolute path of the claude binary ` +
      `(e.g. ~/.local/bin/claude) in your environment or .mcp.json "env" block.`,
    { cause: err },
  );
}

function runClaude(
  spawnFn: typeof spawn,
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnFn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(wrapSpawnError(err instanceof Error ? err : new Error(String(err)), binary));
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer | string) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer | string) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(wrapSpawnError(err, binary));
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`claude timed out after ${timeoutMs}ms`));
      if (code !== 0) {
        return reject(
          new Error(`claude exited ${code} (signal=${signal}): ${stderr.slice(0, 500)}`),
        );
      }
      resolve(stdout);
    });
  });
}

interface ClaudeJsonEnvelope {
  text: string;
  raw: unknown;
}

export function parseClaudeJson(stdout: string): ClaudeJsonEnvelope {
  // Claude Code's --output-format=json envelope wraps the assistant response.
  // Shape varies slightly across versions; the canonical fields are
  // { result: "...", ... } or { messages: [...], ... }. We accept either.
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Claude Code output was not JSON: ${stdout.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude Code JSON envelope is not an object');
  }
  const obj = parsed as Record<string, unknown>;
  // Preferred: top-level `result` field
  if (typeof obj.result === 'string') {
    return { text: obj.result, raw: parsed };
  }
  // Fallback: messages array, take the last assistant message text
  if (Array.isArray(obj.messages)) {
    const msgs = obj.messages as Array<Record<string, unknown>>;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== 'assistant') continue;
      if (typeof m.content === 'string') return { text: m.content, raw: parsed };
      if (Array.isArray(m.content)) {
        const text = m.content
          .filter((b: unknown): b is { type: 'text'; text: string } => {
            return !!b && typeof b === 'object' && (b as { type?: unknown }).type === 'text';
          })
          .map((b) => b.text)
          .join('');
        if (text) return { text, raw: parsed };
      }
    }
  }
  throw new Error(`Claude Code JSON envelope had no readable response: ${stdout.slice(0, 200)}`);
}
