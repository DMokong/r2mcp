/**
 * MCP tool handler for `extract_entities()` — SPEC-046 Task 8.
 *
 * Per the SPEC-044/045 invariant that the MCP server itself makes no LLM
 * calls, this handler spawns the standalone extract-entities driver as a
 * subprocess. The actual provider calls happen in that subprocess.
 *
 * The subprocess command is resolved via resolveCliCommand so the tool
 * works for both dev (tsx + .ts) and prod (node + dist/.js) consumers.
 *
 * Pattern mirrors src/tools/classify.ts intentionally — same dependency
 * injection seams (spawnFn, cwd, runTimeoutMs), same settled-flag timeout
 * shape, same JSON parse strategy.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { resolveCliCommand } from './spawn-cli.js';
import type { RunSummary } from '../entities/types.js';

export interface ExtractEntitiesInput {
  /** Filter candidate memories to those updated in the last N days. */
  since_days?: number;
  /** Per-run cost cap in USD. Default: $1.00 (R2MCP_ENTITY_MAX_USD env). */
  max_cost_usd?: number;
  /** Force a specific provider for this run. */
  provider?: 'claude-code' | 'anthropic' | 'openrouter';
  /** Resume a prior run_id; memories already terminal in that run are skipped. */
  resume?: string;
  /** Backfill mode — process all memories regardless of recency. */
  full?: boolean;
  /** Top-N existing entities to include in extraction context. */
  context_top_n?: number;
}

export interface ExtractEntitiesToolDeps {
  /** Override the spawn function (tests inject a mock). */
  spawnFn?: typeof spawn;
  /** Working directory for the subprocess. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Maximum subprocess runtime. Default 30 minutes. */
  runTimeoutMs?: number;
}

export async function extractEntitiesTool(
  input: ExtractEntitiesInput,
  deps: ExtractEntitiesToolDeps = {},
): Promise<RunSummary> {
  validateInput(input);

  const { bin, args: cliArgs } = resolveCliCommand('extract-entities');
  const flags = buildArgs(input);
  const cwd = deps.cwd ?? process.cwd();
  const spawnFn = deps.spawnFn ?? spawn;
  const timeoutMs = deps.runTimeoutMs ?? 30 * 60_000;

  const stdout = await runSubprocess(spawnFn, cwd, [bin, ...cliArgs, ...flags], timeoutMs);
  return parseSummary(stdout);
}

function validateInput(input: ExtractEntitiesInput): void {
  if (input.full && input.since_days !== undefined) {
    throw new Error('extract_entities: --full and --since-days are mutually exclusive');
  }
}

function buildArgs(input: ExtractEntitiesInput): string[] {
  const flags: string[] = [];
  if (typeof input.since_days === 'number') flags.push(`--since-days=${input.since_days}`);
  if (typeof input.max_cost_usd === 'number') flags.push(`--max-cost=${input.max_cost_usd}`);
  if (input.provider) flags.push(`--provider=${input.provider}`);
  if (input.resume) flags.push(`--resume=${input.resume}`);
  if (input.full) flags.push('--full');
  if (typeof input.context_top_n === 'number') flags.push(`--context-top-n=${input.context_top_n}`);
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
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      settle(() => rejectP(new Error(`extract-entities timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer | string) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer | string) => { stderr += d.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      settle(() => rejectP(err));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return settle(() => rejectP(new Error(`extract-entities exited ${code}: ${stderr.slice(-500)}`)));
      }
      settle(() => resolveP(stdout));
    });
  });
}

function parseSummary(stdout: string): RunSummary {
  // The CLI prints the JSON summary as its final stdout output. Walk back
  // from the last '}' matching braces to find the start. Same pattern as
  // classify.ts / compile.ts — robust against earlier JSON-shaped output.
  const trimmed = stdout.trimEnd();
  const lastBrace = trimmed.lastIndexOf('}');
  if (lastBrace === -1) {
    throw new Error(`extract-entities produced no parseable summary; output was:\n${stdout.slice(-500)}`);
  }
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;
  for (let i = lastBrace; i >= 0; i--) {
    const c = trimmed[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === '\\' && inString) { escapeNext = true; continue; }
    if (c === '"' && !escapeNext) { inString = !inString; continue; }
    if (inString) continue;
    if (c === '}') depth++;
    else if (c === '{') {
      depth--;
      if (depth === 0) { start = i; break; }
    }
  }
  if (start === -1) {
    throw new Error(`extract-entities produced no parseable summary; output was:\n${stdout.slice(-500)}`);
  }
  const json = trimmed.slice(start, lastBrace + 1);
  return JSON.parse(json) as RunSummary;
}
