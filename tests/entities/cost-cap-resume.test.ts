import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EntityState } from '../../src/entities/state.js';

describe('SPEC-046 R5 EntityState (cost cap + resume)', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'entity-state-'));
    return () => rmSync(dataDir, { recursive: true, force: true });
  });

  it('writes one JSONL line per recordTerminal call', () => {
    const s = new EntityState({ runId: 'run-1', dataDir });
    s.recordTerminal('mem-a', 'extracted');
    s.recordTerminal('mem-b', 'extracted');
    const lines = readFileSync(join(dataDir, 'entity-state.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).memory_id).toBe('mem-a');
  });

  it('isMemoryTerminal returns true for previously recorded memories in the supplied run_id (AC5)', () => {
    const a = new EntityState({ runId: 'run-A', dataDir });
    a.recordTerminal('mem-a', 'extracted');
    a.recordTerminal('mem-b', 'cap_reached');
    a.close();

    const b = new EntityState({ runId: 'run-B', dataDir, resumeFrom: 'run-A' });
    expect(b.isMemoryTerminal('mem-a')).toBe(true);
    expect(b.isMemoryTerminal('mem-b')).toBe(true);
    expect(b.isMemoryTerminal('mem-c')).toBe(false);
  });

  it('recordParseFailed truncates raw to 2KB', () => {
    const s = new EntityState({ runId: 'r', dataDir });
    const raw = 'x'.repeat(3000);
    s.recordParseFailed('mem-x', raw);
    const line = readFileSync(join(dataDir, 'entity-state.jsonl'), 'utf8').trim();
    const obj = JSON.parse(line);
    expect(obj.status).toBe('parse_failed');
    expect(obj.raw.length).toBe(2048);
  });

  it('parse_failed memories are NOT terminal (will retry on next run)', () => {
    const s1 = new EntityState({ runId: 'r1', dataDir });
    s1.recordParseFailed('mem-z', 'bad');
    s1.close();
    const s2 = new EntityState({ runId: 'r2', dataDir, resumeFrom: 'r1' });
    expect(s2.isMemoryTerminal('mem-z')).toBe(false);
  });

  it('writeRunSummary outputs to data/entity-state.runs/<run_id>.json', () => {
    const s = new EntityState({ runId: 'run-xyz', dataDir });
    s.writeRunSummary({
      run_id: 'run-xyz',
      started_at: '2026-05-16T00:00:00Z',
      ended_at:   '2026-05-16T00:01:00Z',
      memories_seen: 5, memories_extracted: 5,
      entities_created: 3, entities_updated: 1, links_created: 7,
      total_cost_usd: 0.12, hit_cost_cap: false,
      hallucinated_matched: 0,
    });
    const path = join(dataDir, 'entity-state.runs', 'run-xyz.json');
    expect(existsSync(path)).toBe(true);
    const summary = JSON.parse(readFileSync(path, 'utf8'));
    expect(summary.entities_created).toBe(3);
  });
});
