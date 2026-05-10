/**
 * Round-trip test for dump_edges_sidecar — insert known rows, call the
 * in-process function, parse the written JSON, assert counts and shape.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { dumpEdgesJsonWithClient } from '../../src/tools/dump-edges-sidecar.js';

// Defense-in-depth (claw-0vsn): only run against an explicit test DB or a
// local *test* database. Never against production, even if R2MCP_DATABASE_URL
// is set. To opt in, export R2MCP_TEST_DATABASE_URL.
function pickSafeTestDb(): string | undefined {
  const explicit = process.env.R2MCP_TEST_DATABASE_URL;
  if (explicit) return explicit;
  const ambient = process.env.R2MCP_DATABASE_URL;
  if (!ambient) return undefined;
  try {
    const parsed = new URL(ambient);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    const dbName = parsed.pathname.replace(/^\//, '');
    if (isLocal && /test/i.test(dbName)) return ambient;
  } catch {
    /* fall through */
  }
  return undefined;
}

const TEST_DB = pickSafeTestDb();

describe.skipIf(!TEST_DB)('dump_edges_sidecar round-trip', () => {
  let client: pg.Client;
  let outDir: string;
  let memId1: string;
  let memId2: string;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: TEST_DB });
    await client.connect();
    outDir = await mkdtemp(join(tmpdir(), 'r2mcp-sidecar-'));

    // Insert two known memories + one edge between them, all in a known
    // section so we can clean up.
    const m1 = await client.query(
      `INSERT INTO memories (content, tier, type, section, fingerprint)
       VALUES ($1, 'preferences', 'observation', 'sidecar-test', 'fp-sidecar-1')
       ON CONFLICT (fingerprint) DO UPDATE SET content = EXCLUDED.content
       RETURNING id`,
      ['sidecar-test memory 1'],
    );
    const m2 = await client.query(
      `INSERT INTO memories (content, tier, type, section, fingerprint)
       VALUES ($1, 'preferences', 'observation', 'sidecar-test', 'fp-sidecar-2')
       ON CONFLICT (fingerprint) DO UPDATE SET content = EXCLUDED.content
       RETURNING id`,
      ['sidecar-test memory 2'],
    );
    memId1 = m1.rows[0].id;
    memId2 = m2.rows[0].id;
    await client.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'related_to', 0.95, 'sidecar-test fixture', 'sidecar-test')
       ON CONFLICT DO NOTHING`,
      [memId1, memId2],
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM memory_edges WHERE classifier_version = 'sidecar-test'`);
    await client.query(`DELETE FROM memories WHERE section = 'sidecar-test'`);
    await client.end();
    await rm(outDir, { recursive: true, force: true });
  });

  it('writes both JSON files with the correct counts and structure', async () => {
    const result = await dumpEdgesJsonWithClient(client, outDir);

    expect(result.memories_count).toBeGreaterThanOrEqual(2);
    expect(result.edges_count).toBeGreaterThanOrEqual(1);
    expect(result.out_dir).toBe(outDir);

    const edgesJson = JSON.parse(await readFile(join(outDir, 'edges.json'), 'utf-8'));
    const memoriesJson = JSON.parse(await readFile(join(outDir, 'memories.json'), 'utf-8'));

    expect(edgesJson).toMatchObject({
      generated_at: expect.any(String),
      memory_count: expect.any(Number),
      edge_count: expect.any(Number),
      edges: expect.any(Array),
    });
    expect(memoriesJson).toMatchObject({
      generated_at: expect.any(String),
      memory_count: expect.any(Number),
      memories: expect.any(Array),
    });

    // Our test memories made it into the dump
    const ids = new Set<string>(memoriesJson.memories.map((m: { id: string }) => m.id));
    expect(ids.has(memId1)).toBe(true);
    expect(ids.has(memId2)).toBe(true);
  });
});
