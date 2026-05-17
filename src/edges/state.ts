import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface StageRecord {
  run_id: string;
  pair_hash: string;
  stage: 'haiku_pass' | 'haiku_skip' | 'opus_complete' | 'cap_reached' | 'rejection_skip';
  timestamp: string;
  cost_usd?: number;
  edge_id?: string;
}

const TERMINAL_STAGES: ReadonlySet<StageRecord['stage']> = new Set([
  'opus_complete',
  'haiku_skip',
  'cap_reached',
  'rejection_skip',
]);

export function pairHash(idA: string, idB: string): string {
  const [first, second] = [idA, idB].sort();
  return createHash('sha256').update(`${first}|${second}`).digest('hex').slice(0, 16);
}

export class StateStore {
  constructor(
    private readonly path: string,
    private readonly lastRunPath?: string,
  ) {}

  async append(record: StageRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(record) + '\n', 'utf-8');
  }

  async markActiveRun(runId: string): Promise<void> {
    if (!this.lastRunPath) return;
    await mkdir(dirname(this.lastRunPath), { recursive: true });
    await writeFile(this.lastRunPath, runId, 'utf-8');
  }

  /**
   * Read all terminal stage records for a run_id, returning the set of pair_hashes
   * that should NOT be re-classified on resume. Tolerates a truncated final line
   * (jsonl partial write from a hard kill).
   */
  async terminalPairs(runId: string): Promise<Set<string>> {
    if (!existsSync(this.path)) return new Set();
    const raw = await readFile(this.path, 'utf-8');
    const lines = raw.split('\n');
    const terminals = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      // The final element of split is '' when the file ends in '\n' (good).
      // If the file does NOT end in '\n', the final element is a partial line —
      // skip it because it was truncated mid-write.
      if (i === lines.length - 1 && !raw.endsWith('\n')) continue;
      try {
        const rec = JSON.parse(line) as StageRecord;
        if (rec.run_id !== runId) continue;
        if (TERMINAL_STAGES.has(rec.stage)) {
          terminals.add(rec.pair_hash);
        }
      } catch {
        // Defensive: skip malformed line rather than crash on resume
        continue;
      }
    }
    return terminals;
  }
}

export interface RunSummary {
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
  /** Active LLM provider (D.R3, surfaces in run summary). */
  provider?: string;
}

export class RunSummaryWriter {
  constructor(private readonly dir: string) {}

  async write(summary: RunSummary): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, `${summary.run_id}.json`);
    await writeFile(path, JSON.stringify(summary, null, 2), 'utf-8');
    return path;
  }
}
