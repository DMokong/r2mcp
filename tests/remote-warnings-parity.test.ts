/**
 * SPEC-059 AC8 — degraded-mode `warnings[]` and tool-span parity between the
 * remote profile and the stdio registrations.
 *
 * Gate 2b blocking-flag remediation (scorecard: "AC8 has zero automated test
 * coverage"): a remote `remember`/`recall` under degraded embeddings must
 * carry the same `warnings[]` the stdio path does, and every remote
 * registration must route through the same `withToolSpan` wrapping stdio
 * uses, so remote calls emit the same-named spans with the same tool
 * attributes. Behavioral half runs the ACTUAL registered handlers over an
 * in-process client (same harness as tests/remote-profile.test.ts); the span
 * half is a source-level assertion in the style of
 * tests/lint/extract-entities-span.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { setupTestDb, teardownTestDb } from './setup.js';
import { registerRemoteProfile } from '../src/register/remote-profile.js';
import { registerRemember } from '../src/register/remember.js';
import { registerRecall } from '../src/register/recall.js';
import { EMBEDDINGS_DISABLED_WARNING } from '../src/embeddings.js';

let pool: pg.Pool;
let savedKey: string | undefined;
const SCOPE = 'spec059-ac8';

beforeAll(async () => {
  pool = await setupTestDb();
  savedKey = process.env.R2MCP_OPENROUTER_API_KEY;
});

afterAll(async () => {
  if (savedKey !== undefined) process.env.R2MCP_OPENROUTER_API_KEY = savedKey;
  await teardownTestDb();
});

beforeEach(async () => {
  await pool.query('DELETE FROM memories WHERE project_scope = $1', [SCOPE]);
  // Degraded mode: embeddings disabled for every test in this file.
  delete process.env.R2MCP_OPENROUTER_API_KEY;
});

async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'ac8-parity-probe', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function remoteServer(): McpServer {
  const server = new McpServer({ name: 'r2mcp-remote-test', version: '0.0.0' });
  registerRemoteProfile(server, { scope: SCOPE });
  return server;
}

/** The stdio composition of the same two tools: default descriptions, no afterWrite. */
function stdioServer(): McpServer {
  const server = new McpServer({ name: 'r2mcp-stdio-test', version: '0.0.0' });
  registerRemember(server, { scope: SCOPE });
  registerRecall(server, { scope: SCOPE });
  return server;
}

/** Parse the JSON payload out of an MCP text-content tool result. */
function payload(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type: string; text: string }> }).content;
  expect(content?.[0]?.type).toBe('text');
  return JSON.parse(content![0].text) as Record<string, unknown>;
}

const REMEMBER_ARGS = (content: string) => ({
  operation: 'ADD',
  tier: 'project-context',
  content,
  metadata: { type: 'context' },
});

describe('AC8 behavioral: degraded-mode warnings[] parity, remote vs stdio', () => {
  it('remote remember carries the embeddings-disabled warning', async () => {
    const client = await connect(remoteServer());
    const body = payload(
      await client.callTool({ name: 'remember', arguments: REMEMBER_ARGS('AC8 degraded remote write') }),
    );
    expect(body.warnings).toEqual([EMBEDDINGS_DISABLED_WARNING]);
    await client.close();
  });

  it('remote and stdio remember produce identical warnings for the same degraded call', async () => {
    const remote = await connect(remoteServer());
    const remoteBody = payload(
      await remote.callTool({ name: 'remember', arguments: REMEMBER_ARGS('AC8 parity remote') }),
    );
    await remote.close();

    const stdio = await connect(stdioServer());
    const stdioBody = payload(
      await stdio.callTool({ name: 'remember', arguments: REMEMBER_ARGS('AC8 parity stdio') }),
    );
    await stdio.close();

    expect(remoteBody.warnings).toEqual(stdioBody.warnings);
    expect(remoteBody.warnings).toEqual([EMBEDDINGS_DISABLED_WARNING]);
  });

  it('remote recall surfaces the same degraded warnings[] as stdio recall', async () => {
    const remote = await connect(remoteServer());
    const remoteBody = payload(
      await remote.callTool({ name: 'recall', arguments: { query: 'AC8 degraded probe' } }),
    );
    await remote.close();

    const stdio = await connect(stdioServer());
    const stdioBody = payload(
      await stdio.callTool({ name: 'recall', arguments: { query: 'AC8 degraded probe' } }),
    );
    await stdio.close();

    expect(remoteBody.warnings).toEqual(stdioBody.warnings);
    expect(remoteBody.warnings).toContain(EMBEDDINGS_DISABLED_WARNING);
  });
});

describe('AC8 structural: remote registrations share the stdio span wrapping', () => {
  const registerDir = resolve(__dirname, '..', 'src', 'register');

  for (const tool of ['recall', 'remember', 'search', 'stats', 'reject'] as const) {
    it(`register/${tool}.ts wraps its handler in withToolSpan('${tool}')`, () => {
      const src = readFileSync(resolve(registerDir, `${tool}.ts`), 'utf8');
      expect(src).toMatch(new RegExp(`withToolSpan\\(\\s*'${tool}'`));
    });
  }

  it('remote.ts imports the shared OTel instrumentation before any other module', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src', 'remote.ts'), 'utf8');
    const firstImport = src.split('\n').find((line) => line.trim().startsWith('import '));
    expect(firstImport).toContain('./instrumentation.js');
  });
});
