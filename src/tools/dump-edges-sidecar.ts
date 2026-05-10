/**
 * SPEC-045: in-process sidecar JSON exporter for memory_edges + memories.
 *
 * Exposed in two ways:
 *   1. As an MCP tool (handler in this same file — see dumpEdgesSidecarTool).
 *   2. As a CLI script (scripts/dump-edges-json.ts) — thin wrapper over dumpEdgesJson().
 *
 * Both paths run in-process against pgvector — no subprocess, no LLM call.
 * Output: <out_dir>/edges.json and <out_dir>/memories.json. The caller
 * supplies out_dir; the MCP server makes no assumption about a fixed path.
 */
import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface DumpEdgesInput {
  /** Absolute path to the directory where edges.json + memories.json land. Required. */
  out_dir: string;
}

export interface DumpEdgesOutput {
  memories_count: number;
  edges_count: number;
  out_dir: string;
}

/**
 * Pure function — takes a connected pg.Client and an out dir, writes the
 * two JSON files, returns counts. Connection lifecycle is the caller's job
 * so tests can inject a test client.
 */
export async function dumpEdgesJsonWithClient(
  client: pg.Client,
  outDir: string,
): Promise<DumpEdgesOutput> {
  const edges = await client.query(`
    SELECT id, from_memory_id, to_memory_id, relation, confidence, rationale,
           classifier_version, valid_from, valid_until, created_at, updated_at
    FROM memory_edges
    WHERE valid_until IS NULL
    ORDER BY created_at DESC
  `);
  const memories = await client.query(`
    SELECT id, content, tier, type, section, topics, people, date, fingerprint,
           source_file, source_line, created_at, updated_at
    FROM memories
    WHERE type != 'archived'
    ORDER BY created_at DESC
  `);

  await mkdir(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();

  await writeFile(
    join(outDir, 'edges.json'),
    JSON.stringify(
      {
        generated_at: generatedAt,
        memory_count: memories.rows.length,
        edge_count: edges.rows.length,
        edges: edges.rows,
      },
      null,
      2,
    ),
    'utf-8',
  );
  await writeFile(
    join(outDir, 'memories.json'),
    JSON.stringify(
      {
        generated_at: generatedAt,
        memory_count: memories.rows.length,
        memories: memories.rows,
      },
      null,
      2,
    ),
    'utf-8',
  );

  return {
    memories_count: memories.rows.length,
    edges_count: edges.rows.length,
    out_dir: outDir,
  };
}

/**
 * Convenience wrapper that opens its own connection from R2MCP_DATABASE_URL.
 * Used by the CLI script and the MCP tool handler.
 */
export async function dumpEdgesJson(outDir: string): Promise<DumpEdgesOutput> {
  const url = process.env.R2MCP_DATABASE_URL;
  if (!url) throw new Error('R2MCP_DATABASE_URL not set');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await dumpEdgesJsonWithClient(client, outDir);
  } finally {
    await client.end();
  }
}
