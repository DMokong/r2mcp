import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, closeSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { RunSummary, StateRecord } from './types.js';

export interface EntityStateInit { runId: string; dataDir: string; resumeFrom?: string; }

const RAW_TRUNC = 2048;
const STATE_FILE = 'entity-state.jsonl';
const RUNS_DIR   = 'entity-state.runs';

export class EntityState {
  readonly runId: string;
  private readonly dataDir: string;
  private readonly stateFile: string;
  private readonly terminalMemoryIds = new Set<string>();

  constructor({ runId, dataDir, resumeFrom }: EntityStateInit) {
    this.runId = runId;
    this.dataDir = dataDir;
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    this.stateFile = join(dataDir, STATE_FILE);
    if (!existsSync(this.stateFile)) closeSync(openSync(this.stateFile, 'a'));
    if (resumeFrom) this.loadTerminalSet(resumeFrom);
  }

  private loadTerminalSet(resumeRunId: string): void {
    const content = readFileSync(this.stateFile, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let rec: StateRecord;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.run_id !== resumeRunId) continue;
      if (rec.status === 'extracted' || rec.status === 'cap_reached' || rec.status === 'skipped') {
        this.terminalMemoryIds.add(rec.memory_id);
      }
      // parse_failed is intentionally non-terminal — re-run will retry
    }
  }

  isMemoryTerminal(memoryId: string): boolean { return this.terminalMemoryIds.has(memoryId); }

  recordTerminal(memoryId: string, status: 'extracted' | 'cap_reached' | 'skipped'): void {
    this.terminalMemoryIds.add(memoryId);
    this.appendRecord({ run_id: this.runId, memory_id: memoryId, status, timestamp: new Date().toISOString() });
  }

  recordParseFailed(memoryId: string, raw: string): void {
    this.appendRecord({
      run_id: this.runId, memory_id: memoryId, status: 'parse_failed',
      timestamp: new Date().toISOString(),
      raw: raw.length > RAW_TRUNC ? raw.slice(0, RAW_TRUNC) : raw,
    });
  }

  private appendRecord(rec: StateRecord): void { appendFileSync(this.stateFile, JSON.stringify(rec) + '\n'); }

  close(): void { /* explicit no-op; appendFileSync flushes per call */ }

  writeRunSummary(summary: RunSummary): void {
    const runsDir = join(this.dataDir, RUNS_DIR);
    if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, `${summary.run_id}.json`), JSON.stringify(summary, null, 2));
  }
}
