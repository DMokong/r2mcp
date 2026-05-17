/**
 * MCP tool handler for `classify()` — wraps the SPEC-043 edge classifier.
 *
 * Per the SPEC-044 invariant that the MCP server itself makes no LLM
 * calls, this handler spawns the standalone classify-edges driver as a
 * subprocess. The actual provider calls happen in that subprocess.
 *
 * The subprocess command is resolved via resolveCliCommand so the tool
 * works for both dev (tsx + .ts) and prod (node + dist/.js) consumers.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { resolveCliCommand } from './spawn-cli.js';

export interface ClassifyToolInput {
  /** Filter candidate pairs to memories updated in the last N days. */
  since_days?: number;
  /** Per-run cost cap in USD. Default: $1.00 (R2MCP_EDGE_MAX_USD env). */
  max_cost_usd?: number;
  /** Estimate-only mode — no edges written, no LLM calls beyond Stage 1 sampling. */
  dry_run?: boolean;
  /** Resume a prior run_id; pairs already terminal in that run are not re-classified. */
  resume_run_id?: string;
  /** Force a specific provider for this run. */
  provider?: 'claude-code' | 'anthropic' | 'openrouter';
}

export interface ClassifySummary {
  run_id: string;
  started_at: string;
  ended_at: string;
  candidate_pairs: number;
  stage1_total: number;
  stage1_pass: number;
  stage1_skip: number;
  stage2_total: number;
  stage2_classified: number;
  edges_written: number;
  total_cost_usd: number;
  hit_cost_cap: boolean;
  error?: string;
}

export interface ClassifyToolDeps {
  spawnFn?: typeof spawn;
  cwd?: string;
  runTimeoutMs?: number;
}

export async function classify(
  input: ClassifyToolInput,
  deps: ClassifyToolDeps = {},
): Promise<ClassifySummary> {
  const { bin, args: cliArgs } = resolveCliCommand('classify-edges');
  const flags = buildArgs(input);
  const cwd = deps.cwd ?? process.cwd();
  const spawnFn = deps.spawnFn ?? spawn;
  const timeoutMs = deps.runTimeoutMs ?? 30 * 60_000;

  const stdout = await runSubprocess(spawnFn, cwd, [bin, ...cliArgs, ...flags], timeoutMs);
  return parseSummary(stdout);
}

function buildArgs(input: ClassifyToolInput): string[] {
  const flags: string[] = [];
  if (typeof input.since_days === 'number') flags.push(`--since=${input.since_days}d`);
  if (typeof input.max_cost_usd === 'number') flags.push(`--max-cost=${input.max_cost_usd}`);
  if (input.dry_run) flags.push('--dry-run');
  if (input.resume_run_id) flags.push(`--resume=${input.resume_run_id}`);
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
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      settle(() => rejectP(new Error(`classify-edges timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer | string) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer | string) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      settle(() => rejectP(err));
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return settle(() =>
          rejectP(new Error(`classify-edges exited ${code}: ${stderr.slice(-500)}`)),
        );
      }
      settle(() => resolveP(stdout));
    });
  });
}

function parseSummary(stdout: string): ClassifySummary {
  // The CLI prints the JSON summary as its final stdout output. Walk back
  // from the last '}' matching braces to find the start. Same pattern as
  // compile.ts — robust against earlier JSON-shaped output.
  const trimmed = stdout.trimEnd();
  const lastBrace = trimmed.lastIndexOf('}');
  if (lastBrace === -1) {
    throw new Error(
      `classify-edges produced no parseable summary; output was:\n${stdout.slice(-500)}`,
    );
  }
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
      `classify-edges produced no parseable summary; output was:\n${stdout.slice(-500)}`,
    );
  }
  const json = trimmed.slice(start, lastBrace + 1);
  return JSON.parse(json) as ClassifySummary;
}
