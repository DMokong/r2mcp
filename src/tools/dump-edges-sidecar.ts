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
import { currentScope } from '../env.js';

export interface DumpEdgesInput {
  /** Absolute path to the directory where edges.json + memories.json land. Required. */
  out_dir: string;
  /** claw-z8k8: when true, dump ALL project scopes (default: current scope + global). */
  all_scopes?: boolean;
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
  scopes: string[] | null,
): Promise<DumpEdgesOutput> {
  // claw-z8k8: `null` dumps every scope (explicit escape hatch); an array
  // confines the dump to those scopes. Edges are filtered on BOTH endpoints —
  // a scoped dump must never emit an edge pointing at a memory it excluded.
  const scopeParams: unknown[] = scopes === null ? [] : [scopes];
  const edgeScopeClause =
    scopes === null
      ? ''
      : ' AND m1.project_scope = ANY($1::text[]) AND m2.project_scope = ANY($1::text[])';
  const memoryScopeClause = scopes === null ? '' : ' AND project_scope = ANY($1::text[])';

  const edges = await client.query(
    `SELECT e.id, e.from_memory_id, e.to_memory_id, e.relation, e.confidence, e.rationale,
            e.classifier_version, e.valid_from, e.valid_until, e.created_at, e.updated_at
     FROM memory_edges e
     JOIN memories m1 ON m1.id = e.from_memory_id
     JOIN memories m2 ON m2.id = e.to_memory_id
     WHERE e.valid_until IS NULL${edgeScopeClause}
     ORDER BY e.created_at DESC`,
    scopeParams,
  );
  // project_scope is selected deliberately: it makes scope purity verifiable
  // downstream with jq, without another round-trip to the DB.
  const memories = await client.query(
    `SELECT id, content, tier, type, section, topics, people, date, fingerprint,
            source_file, source_line, project_scope, created_at, updated_at
     FROM memories
     WHERE type != 'archived'${memoryScopeClause}
     ORDER BY created_at DESC`,
    scopeParams,
  );

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
export async function dumpEdgesJson(
  outDir: string,
  opts?: { all_scopes?: boolean },
): Promise<DumpEdgesOutput> {
  const url = process.env.R2MCP_DATABASE_URL;
  if (!url) throw new Error('R2MCP_DATABASE_URL not set');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // claw-z8k8: default to the current scope + global, mirroring recall().
    const scopes = opts?.all_scopes ? null : [currentScope(), 'global'];
    return await dumpEdgesJsonWithClient(client, outDir, scopes);
  } finally {
    await client.end();
  }
}

/**
 * MCP tool wrapper. The server calls this with the validated input.
 * Returns the structured output as a JSON-serialized text content block.
 */
export async function dumpEdgesSidecarTool(input: DumpEdgesInput): Promise<DumpEdgesOutput> {
  if (!input.out_dir) {
    throw new Error('dump_edges_sidecar requires out_dir');
  }
  return dumpEdgesJson(input.out_dir, { all_scopes: input.all_scopes });
}
