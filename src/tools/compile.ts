/**
 * MCP tool handler for `compile()`.
 *
 * Per the SPEC-044 constraint that the MCP server itself makes no LLM calls,
 * this handler spawns the standalone `compile-wiki` driver as a subprocess
 * and returns the JSON summary it prints to stdout. The actual provider
 * calls happen in that subprocess, not in the server process.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import type { CompileSummary } from '../compiler/types.js';
import { resolveCliCommand } from './spawn-cli.js';

export interface CompileToolInput {
  tier?: 'preferences' | 'project-context' | 'conversations';
  all?: boolean;
  topic?: string;
  dry_run?: boolean;
  /** Override the cost cap for this invocation. */
  max_cost_usd?: number;
  /** Force a specific provider for this run. */
  provider?: 'claude-code' | 'anthropic' | 'openrouter';
}

export interface CompileToolDeps {
  /** Override the spawn function (tests inject a mock). */
  spawnFn?: typeof spawn;
  /** Working directory for the subprocess. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Maximum subprocess runtime. Default 30 minutes. */
  runTimeoutMs?: number;
}

export async function compile(
  input: CompileToolInput,
  deps: CompileToolDeps = {},
): Promise<CompileSummary> {
  validateInput(input);

  const { bin, args: cliArgs } = resolveCliCommand('compile-wiki');
  const flags = buildArgs(input);
  const cwd = deps.cwd ?? process.cwd();
  const spawnFn = deps.spawnFn ?? spawn;
  const timeoutMs = deps.runTimeoutMs ?? 30 * 60_000;

  const stdout = await runSubprocess(spawnFn, cwd, [bin, ...cliArgs, ...flags], timeoutMs);
  return parseSummary(stdout);
}

function validateInput(input: CompileToolInput): void {
  const modes = [input.tier, input.all, input.topic].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error('compile() requires exactly one of: tier, all, topic');
  }
}

function buildArgs(input: CompileToolInput): string[] {
  const flags: string[] = [];
  if (input.tier) flags.push(`--tier=${input.tier}`);
  if (input.all) flags.push('--all');
  if (input.topic) flags.push(`--topic=${input.topic}`);
  if (input.dry_run) flags.push('--dry-run');
  if (typeof input.max_cost_usd === 'number') flags.push(`--max-cost=${input.max_cost_usd}`);
  if (input.provider) flags.push(`--provider=${input.provider}`);
  return flags;
}

function runSubprocess(
  spawnFn: typeof spawn,
  cwd: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolveP, rejectP) => {
    const [bin, ...rest] = args;
    const child: ChildProcess = spawnFn(bin, rest, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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
      rejectP(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (timedOut) return rejectP(new Error(`compile-wiki timed out after ${timeoutMs}ms`));
      if (code !== 0) {
        return rejectP(new Error(`compile-wiki exited ${code}: ${stderr.slice(-500)}`));
      }
      resolveP(stdout);
    });
  });
}

function parseSummary(stdout: string): CompileSummary {
  // The CLI prints the JSON summary as its final stdout output. Walk the
  // string from the end backwards looking for a trailing `}`, then match
  // braces to find the start of the JSON block. This is robust against the
  // subprocess emitting earlier JSON-shaped output (dry-run previews,
  // intermediate logging) — only the FINAL balanced object is parsed.
  const trimmed = stdout.trimEnd();
  const lastBrace = trimmed.lastIndexOf('}');
  if (lastBrace === -1) {
    throw new Error(
      `compile-wiki produced no parseable summary; output was:\n${stdout.slice(-500)}`,
    );
  }
  // Walk back, balancing braces (ignoring those inside strings).
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;
  for (let i = lastBrace; i >= 0; i--) {
    const c = trimmed[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (c === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (c === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '}') depth++;
    else if (c === '{') {
      depth--;
      if (depth === 0) {
        start = i;
        break;
      }
    }
  }
  if (start === -1) {
    throw new Error(
      `compile-wiki produced no parseable summary; output was:\n${stdout.slice(-500)}`,
    );
  }
  const json = trimmed.slice(start, lastBrace + 1);
  return JSON.parse(json) as CompileSummary;
}

/** Resolved path to the compile-wiki CLI script — used in production wiring. */
export function compileCliPath(projectRoot: string): string {
  return resolve(projectRoot, 'scripts/compile-wiki.ts');
}
