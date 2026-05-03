/**
 * B.AC5 — compile() never modifies memory/MEMORY.md.
 *
 * The compile orchestrator only writes under `compiledDir` (defaulting to
 * `<projectRoot>/memory/compiled/`). It must never touch the human-curated
 * hub at `<projectRoot>/memory/MEMORY.md`. We verify this by:
 *   1. Computing a SHA-256 of the input MEMORY.md
 *   2. Running compile with all modes that touch the filesystem
 *   3. Asserting MEMORY.md is byte-identical (via SHA-256)
 *
 * The test uses real fs (a tmpdir scaffold) to actually exercise the path
 * separation logic — a pure-mock test wouldn't be load-bearing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCompile } from '../../src/compiler/run.js';
import type { LLMProvider } from '../../src/providers/types.js';
import type { MemoryForCompile } from '../../src/compiler/types.js';
import { vi } from 'vitest';

let projectRoot: string;
let memoryDir: string;
let compiledDir: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'r2mcp-compile-mem-'));
  memoryDir = join(projectRoot, 'memory');
  compiledDir = join(memoryDir, 'compiled');
  mkdirSync(memoryDir, { recursive: true });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

const MEMORY_MD = `# ClaudeClaw Memory

This is a hand-curated index. Compile must never touch it.

## Hot preferences
- Be concise
- Emojis welcome
`;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function provider(): LLMProvider {
  return {
    name: 'claude-code',
    concurrencyLimit: 2,
    complete: vi.fn(async () => ({
      response: 'synthesized prose',
      cost_usd: 0,
      latency_ms: 10,
    })),
  };
}

function mem(id: string, tier: 'preferences' | 'project-context' | 'conversations', topics: string[]): MemoryForCompile {
  return { id, tier, type: 'context', content: `memory ${id}`, topics, people: [], created_at: '2026-05-01T00:00:00Z' };
}

function baseOpts(over: { tier?: 'preferences' | 'project-context' | 'conversations'; all?: boolean; topic?: string; dryRun?: boolean } = {}) {
  return {
    runId: 'run-mem-test',
    startedAt: '2026-05-04T00:00:00Z',
    sourceGitSha: 'abc',
    compiledDir,
    maxCostUsd: 1,
    ...over,
  };
}

describe('B.AC5: compile() leaves memory/MEMORY.md byte-identical', () => {
  it('does not touch MEMORY.md after a tier compile', async () => {
    const memoryMdPath = join(memoryDir, 'MEMORY.md');
    writeFileSync(memoryMdPath, MEMORY_MD, 'utf-8');
    const before = sha256(readFileSync(memoryMdPath, 'utf-8'));
    const beforeMtime = statSync(memoryMdPath).mtimeMs;

    await runCompile(
      baseOpts({ tier: 'preferences' }),
      {
        provider: provider(),
        loadMemories: async () => [mem('m1', 'preferences', ['s'])],
      },
    );
    const after = sha256(readFileSync(memoryMdPath, 'utf-8'));
    const afterMtime = statSync(memoryMdPath).mtimeMs;
    expect(after).toBe(before);
    expect(afterMtime).toBe(beforeMtime);
  });

  it('does not touch MEMORY.md after a full all=true compile', async () => {
    const memoryMdPath = join(memoryDir, 'MEMORY.md');
    writeFileSync(memoryMdPath, MEMORY_MD, 'utf-8');
    const before = sha256(readFileSync(memoryMdPath, 'utf-8'));

    await runCompile(
      baseOpts({ all: true }),
      {
        provider: provider(),
        loadMemories: async () => [
          mem('m-p', 'preferences', ['style']),
          mem('m-pc', 'project-context', ['arch']),
          mem('m-c', 'conversations', ['continuity']),
        ],
      },
    );
    const after = sha256(readFileSync(memoryMdPath, 'utf-8'));
    expect(after).toBe(before);
  });

  it('does not touch MEMORY.md after a topic compile', async () => {
    const memoryMdPath = join(memoryDir, 'MEMORY.md');
    writeFileSync(memoryMdPath, MEMORY_MD, 'utf-8');
    const before = sha256(readFileSync(memoryMdPath, 'utf-8'));

    await runCompile(
      baseOpts({ topic: 'wiki-mode' }),
      {
        provider: provider(),
        loadMemories: async () => [mem('m1', 'preferences', ['wiki-mode'])],
      },
    );
    const after = sha256(readFileSync(memoryMdPath, 'utf-8'));
    expect(after).toBe(before);
  });

  it('does not touch MEMORY.md after a dry-run', async () => {
    const memoryMdPath = join(memoryDir, 'MEMORY.md');
    writeFileSync(memoryMdPath, MEMORY_MD, 'utf-8');
    const before = sha256(readFileSync(memoryMdPath, 'utf-8'));

    await runCompile(
      baseOpts({ tier: 'preferences', dryRun: true }),
      {
        provider: provider(),
        loadMemories: async () => [mem('m1', 'preferences', ['s'])],
        stdout: () => undefined,
      },
    );
    const after = sha256(readFileSync(memoryMdPath, 'utf-8'));
    expect(after).toBe(before);
  });

  it('compile output goes only under memory/compiled/, never elsewhere', async () => {
    writeFileSync(join(memoryDir, 'MEMORY.md'), MEMORY_MD, 'utf-8');
    writeFileSync(join(memoryDir, 'preferences.md'), '# tier file (legacy)', 'utf-8');
    const beforeLegacy = readFileSync(join(memoryDir, 'preferences.md'), 'utf-8');

    await runCompile(
      baseOpts({ tier: 'preferences' }),
      {
        provider: provider(),
        loadMemories: async () => [mem('m1', 'preferences', ['s'])],
      },
    );
    // The pre-existing memory/preferences.md (NOT under compiled/) is untouched.
    const afterLegacy = readFileSync(join(memoryDir, 'preferences.md'), 'utf-8');
    expect(afterLegacy).toBe(beforeLegacy);
    // The compile output landed under memory/compiled/preferences.md
    expect(existsSync(join(compiledDir, 'preferences.md'))).toBe(true);
  });
});
