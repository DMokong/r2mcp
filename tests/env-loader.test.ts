import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadEnvFile } from '../src/env.js';

// Keys these tests may mutate on process.env — snapshotted and restored
// around every test so loader side effects can't leak into other suites.
const TOUCHED_KEYS = [
  'R2MCP_DATABASE_URL',
  'R2MCP_OPENROUTER_API_KEY',
  'R2MCP_EDGE_MAX_USD',
  'R2MCP_COMPILE_MAX_USD',
  'R2MCP_ENTITY_MAX_USD',
  'R2MCP_ENTITY_CONTEXT_TOP_N',
  'R2MCP_CLASSIFIER_PROVIDER',
  'ANTHROPIC_API_KEY',
  'OTEL_ENABLED',
  'TEST_LOADER_PLAIN',
  'TEST_LOADER_QUOTED',
  'TEST_LOADER_SINGLE',
  'TEST_LOADER_SPACED',
  'TEST_LOADER_EMPTY',
];

let tmpDir: string;
let saved: Record<string, string | undefined>;

function writeEnv(content: string): string {
  const envPath = join(tmpDir, '.env');
  writeFileSync(envPath, content);
  return envPath;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'r2mcp-env-test-'));
  saved = {};
  for (const key of TOUCHED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  for (const key of TOUCHED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('loadEnvFile', () => {
  it('loads keys containing digits — the R2MCP_* regression', () => {
    const envPath = writeEnv(
      'R2MCP_DATABASE_URL=postgresql://u:p@db.example.co:5432/postgres\n' +
        'R2MCP_OPENROUTER_API_KEY=sk-or-v1-test\n'
    );
    loadEnvFile(envPath);
    expect(process.env.R2MCP_DATABASE_URL).toBe('postgresql://u:p@db.example.co:5432/postgres');
    expect(process.env.R2MCP_OPENROUTER_API_KEY).toBe('sk-or-v1-test');
  });

  it('round-trips every active key in the shipped .env.example', () => {
    const example = readFileSync(resolve(__dirname, '..', '.env.example'), 'utf-8');
    const expectedKeys = example
      .split('\n')
      .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[1]);
    // .env.example must actually exercise the digit case
    expect(expectedKeys).toContain('R2MCP_DATABASE_URL');
    expect(expectedKeys.length).toBeGreaterThanOrEqual(5);

    const envPath = writeEnv(example);
    loadEnvFile(envPath);
    for (const key of expectedKeys) {
      expect(process.env[key], `expected ${key} to load from .env.example`).toBeDefined();
    }
  });

  it('does not clobber values already present in process.env', () => {
    process.env.R2MCP_DATABASE_URL = 'postgresql://existing:5432/keep';
    const envPath = writeEnv('R2MCP_DATABASE_URL=postgresql://file:5432/lose\n');
    loadEnvFile(envPath);
    expect(process.env.R2MCP_DATABASE_URL).toBe('postgresql://existing:5432/keep');
  });

  it('trims whitespace around values', () => {
    const envPath = writeEnv('TEST_LOADER_SPACED=  padded value  \n');
    loadEnvFile(envPath);
    expect(process.env.TEST_LOADER_SPACED).toBe('padded value');
  });

  it('strips matching surrounding quotes', () => {
    const envPath = writeEnv(
      'TEST_LOADER_QUOTED="double quoted"\n' + "TEST_LOADER_SINGLE='single quoted'\n"
    );
    loadEnvFile(envPath);
    expect(process.env.TEST_LOADER_QUOTED).toBe('double quoted');
    expect(process.env.TEST_LOADER_SINGLE).toBe('single quoted');
  });

  it('skips comments, blank lines, and empty values', () => {
    const envPath = writeEnv(
      '# comment line\n' +
        '\n' +
        '# R2MCP_DATABASE_URL=postgresql://commented:5432/out\n' +
        'TEST_LOADER_EMPTY=\n' +
        'TEST_LOADER_PLAIN=kept\n'
    );
    loadEnvFile(envPath);
    expect(process.env.R2MCP_DATABASE_URL).toBeUndefined();
    expect(process.env.TEST_LOADER_EMPTY).toBeUndefined();
    expect(process.env.TEST_LOADER_PLAIN).toBe('kept');
  });

  it('is a no-op when the file does not exist', () => {
    expect(() => loadEnvFile(join(tmpDir, 'does-not-exist.env'))).not.toThrow();
  });
});
