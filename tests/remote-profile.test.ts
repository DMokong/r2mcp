// SPEC-059 (Task 02) — behavioral tests for the remote 5-tool profile.
//
// Covers:
//   - AC2 (R2/R4): a module-graph audit proving src/remote.ts has no import
//     path — direct or transitive — to the six excluded tools, spawn-cli,
//     graph-rebuild, or any first-party module that reaches node:child_process.
//     A control walk from src/index.ts proves the walker itself isn't blind.
//   - AC1 (R2/R8): the remote profile registers exactly the five tools
//     (recall, remember, search, stats, reject) with the design.md §6
//     description texts verbatim, and each tool's input schema is
//     byte-identical to the stdio registration's schema for the same tool
//     (R1's anti-drift guarantee).
//   - AC5 (R4): a behavioral belt test — even with a real
//     scripts/build-memory-graph.js sentinel script present, a remote
//     `remember` call never triggers it, while the write itself genuinely
//     lands in the database (proving this isn't a short-circuited no-op).
//
// Listing/AC5 tests use InMemoryTransport (in-process client<->server) per
// the brief's explicit fallback — this satisfies "the listing must not
// require a live DB round trip" for AC1, while AC5 legitimately needs the
// live test DB (available locally via docker) to prove a real write occurs.
// A full over-the-wire HTTP boot + tools/list smoke test lives in
// tests/remote-startup.test.ts alongside the fail-loud startup tests, since
// both need the same "spawn dist/remote.js" machinery.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { setupTestDb, teardownTestDb } from './setup.js';
import { registerRecall } from '../src/register/recall.js';
import { registerRemember } from '../src/register/remember.js';
import { registerSearch } from '../src/register/search.js';
import { registerStats } from '../src/register/stats.js';
import { registerReject } from '../src/register/reject.js';
import { SERVER_VERSION } from '../src/register/version.js';
import type pg from 'pg';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEST_SCOPE = 'r2mcp-remote-profile-test';

/* =====================================================================
 * AC2 — module-graph audit
 * =================================================================== */

interface WalkResult {
  visited: Set<string>;
  childProcessImporters: Set<string>;
}

/**
 * Resolves a relative import specifier (e.g. './db.js', '../tools/recall.js')
 * from the file that contains it to an absolute path of the TS source file
 * it refers to. Source imports use compiled `.js` extensions (NodeNext-style)
 * that map back to `.ts` files on disk.
 */
function resolveSpecifier(fromFile: string, specifier: string): string {
  const baseDir = dirname(fromFile);
  const candidate = resolve(baseDir, specifier);
  if (candidate.endsWith('.js')) {
    const tsPath = candidate.slice(0, -3) + '.ts';
    if (existsSync(tsPath)) return tsPath;
  }
  if (existsSync(candidate)) return candidate;
  if (existsSync(candidate + '.ts')) return candidate + '.ts';
  const indexTs = join(candidate, 'index.ts');
  if (existsSync(indexTs)) return indexTs;
  throw new Error(
    `module-graph walker: could not resolve specifier '${specifier}' imported from ${fromFile}. ` +
      `Either the target file does not exist yet, or the walker's resolution heuristic needs updating.`,
  );
}

const RELATIVE_IMPORT_RE = /(?:from|import)\s+['"](\.\.?\/[^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
const CHILD_PROCESS_RE =
  /(?:from|import)\s+['"](?:node:)?child_process['"]|require\(\s*['"](?:node:)?child_process['"]\s*\)/;

/**
 * Walks first-party (relative-specifier) static imports transitively from
 * `entryFile`, returning the full visited set plus the subset of visited
 * files that themselves import node:child_process / child_process.
 *
 * Deliberately a plain text/regex walk (per the brief), not a TS compiler
 * API traversal — this is a structural, cheap-to-run guard, not a full
 * type-checker.
 */
function walkImports(entryFile: string): WalkResult {
  const visited = new Set<string>();
  const childProcessImporters = new Set<string>();
  const queue = [resolve(entryFile)];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    if (!existsSync(file)) {
      throw new Error(
        `module-graph walker: entry/imported file does not exist: ${file}. ` +
          `(Expected for round-1 tests before src/remote.ts lands — see report.)`,
      );
    }
    visited.add(file);
    const content = readFileSync(file, 'utf-8');

    if (CHILD_PROCESS_RE.test(content)) {
      childProcessImporters.add(file);
    }

    for (const re of [RELATIVE_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content))) {
        const resolved = resolveSpecifier(file, match[1]);
        if (!visited.has(resolved)) queue.push(resolved);
      }
    }
  }

  return { visited, childProcessImporters };
}

const FORBIDDEN_FILES = [
  'src/tools/meditate.ts',
  'src/tools/compile.ts',
  'src/tools/lint.ts',
  'src/tools/classify.ts',
  'src/tools/extract-entities.ts',
  'src/tools/dump-edges-sidecar.ts',
  'src/tools/spawn-cli.ts',
  'src/graph-rebuild.ts',
].map((p) => resolve(REPO_ROOT, p));

const FORBIDDEN_DIR_PREFIXES = [
  'src/providers/',
  'src/cli/',
  'src/compiler/',
  'src/lint/',
].map((p) => resolve(REPO_ROOT, p) + '/');

// DEVIATION (round 1, implementer) — `src/edges/` and `src/entities/` cannot be
// blanket-banned directories, and the audit uses an allowlist for them instead.
//
// Evidence: `recall` is a REQUIRED remote tool (spec AC1), and
// src/tools/recall.ts:5-8 imports ../edges/signals.js, ../edges/types.js,
// ../entities/db.js and ../entities/types.js — SPEC-046 entity-filtered recall
// and edge recall-signals. A blanket ban on those two directories is therefore
// unsatisfiable with `recall` on the profile, at any implementation.
//
// It is also not what the hazard is. The five files below import nothing but
// `pg` types, sibling type modules, ./normalize.js and ../env.js — no fs
// writes, no subprocess, no providers. The genuinely dangerous residents of
// those directories (edges/classifier.ts, edges/stage1-haiku.ts,
// edges/stage2-opus.ts, entities/extractor.ts, entities/prompt.ts) all reach
// src/providers/, which IS a banned prefix above and which chains to
// node:child_process via providers/claude-code.ts.
//
// Neither SPEC-059 AC2 (which names the six excluded tool modules + spawn-cli)
// nor plan.md's Global Constraints (providers/cli/compiler/lint) asks for the
// directory ban — it was added in the task brief only. An allowlist is the
// tighter guard anyway: it pins the exact reachable set, so ANY new
// edges/entities file entering the remote graph fails this test, whereas a
// prefix ban that had to be deleted outright would have guarded nothing.
const ALLOWED_EDGES_ENTITIES_FILES = [
  'src/edges/signals.ts',
  'src/edges/types.ts',
  'src/entities/db.ts',
  'src/entities/normalize.ts',
  'src/entities/types.ts',
].map((p) => resolve(REPO_ROOT, p));

const ALLOWLISTED_DIR_PREFIXES = ['src/edges/', 'src/entities/'].map(
  (p) => resolve(REPO_ROOT, p) + '/',
);

const ELEVEN_STDIO_TOOL_FILES = [
  'classify',
  'compile',
  'dump-edges-sidecar',
  'extract-entities',
  'lint',
  'meditate',
  'recall',
  'reject',
  'remember',
  'search',
  'stats',
].map((name) => resolve(REPO_ROOT, `src/tools/${name}.ts`));

describe('AC2 — module-graph audit for src/remote.ts (R2/R4)', () => {
  const REMOTE_ENTRY = resolve(REPO_ROOT, 'src/remote.ts');
  const INDEX_ENTRY = resolve(REPO_ROOT, 'src/index.ts');

  it('AC2a: no forbidden tool/CLI/spawner module is reachable from src/remote.ts', () => {
    const { visited } = walkImports(REMOTE_ENTRY);
    expect(visited.size).toBeGreaterThan(1); // sanity: the walker actually traversed something

    const visitedArray = Array.from(visited);
    for (const forbidden of FORBIDDEN_FILES) {
      expect(visitedArray).not.toContain(forbidden);
    }
    for (const file of visited) {
      for (const dirPrefix of FORBIDDEN_DIR_PREFIXES) {
        expect(file.startsWith(dirPrefix)).toBe(false);
      }
    }
  });

  it('AC2a (allowlist): only the five inert leaf modules of src/edges + src/entities are reachable', () => {
    const { visited } = walkImports(REMOTE_ENTRY);
    const reached = Array.from(visited)
      .filter((file) => ALLOWLISTED_DIR_PREFIXES.some((prefix) => file.startsWith(prefix)))
      .sort();
    // Anything beyond the allowlist (an LLM classifier, an extractor, a state
    // store that shells out) is a regression — see the DEVIATION note above.
    expect(reached).toEqual([...ALLOWED_EDGES_ENTITIES_FILES].sort());
  });

  it('AC2b/R4: no module reachable from src/remote.ts imports node:child_process', () => {
    const { childProcessImporters } = walkImports(REMOTE_ENTRY);
    expect(Array.from(childProcessImporters)).toEqual([]);
  });

  it('AC2c control: the SAME walker DOES visit all 11 stdio tool modules from src/index.ts (proves it is not blind)', () => {
    const { visited } = walkImports(INDEX_ENTRY);
    const visitedArray = Array.from(visited);
    for (const toolFile of ELEVEN_STDIO_TOOL_FILES) {
      expect(visitedArray).toContain(toolFile);
    }
  });
});

/* =====================================================================
 * AC1 — five-tool listing + §6 descriptions + stdio-identical schemas
 * =================================================================== */

// design.md §6 verbatim texts (Task 02 "Required content": remote-descriptions.ts
// must ship these as the starting draft, one exported const per tool). Copied
// byte-for-byte from docs/fable-streams/2026-08-20-r2mcp-remote-deployment/design.md
// lines 107-113 (verified via `od -c` against the source doc).
const EXPECTED_RECALL_DESCRIPTION =
  "Dustin's personal long-term memory: past decisions and their rationale, stated preferences and corrections, project architecture and state, and prior conversations. Call this before answering anything about his projects, tools, people, working style, or past choices — including when he refers to something as though you should already know it. Cheap to call; prefer calling it over guessing. An empty result is normal and not an error.";
const EXPECTED_REMEMBER_DESCRIPTION =
  "Store something durable in Dustin's long-term memory. Call when a decision with its rationale, a stated preference or correction, or project state worth carrying forward surfaces. Use tier `preferences` for decisions/style/corrections, `project-context` for architecture and system state, `conversations` for session continuity. Use operation `REJECTION` when he corrects an approach and the correction would apply again.";
const EXPECTED_SEARCH_DESCRIPTION =
  'Metadata-filtered lookup over the same memory as `recall`. Use when you know the *shape* of what you want (type, tier, topics, people, date range); use `recall` when you know what it is *about*.';
const EXPECTED_STATS_DESCRIPTION =
  'Health of the memory store: counts by tier and type, staleness, top topics, embedding index status.';
const EXPECTED_REJECT_DESCRIPTION =
  'Mark a stored memory as wrong or unwanted, with a reason. Excluded from future `recall` and `search`.';

interface ListedTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

async function connectInMemory(server: McpServer, clientName: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: clientName, version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function listRemoteTools(): Promise<{ tools: ListedTool[]; client: Client }> {
  const { registerRemoteProfile } = await import('../src/register/remote-profile.js');
  const server = new McpServer({ name: 'r2mcp', version: SERVER_VERSION });
  registerRemoteProfile(server, { scope: TEST_SCOPE });
  const client = await connectInMemory(server, 'remote-profile-test-client');
  const { tools } = await client.listTools();
  return { tools: tools as ListedTool[], client };
}

async function listStdioEquivalentTools(): Promise<{ tools: ListedTool[]; client: Client }> {
  const server = new McpServer({ name: 'r2mcp', version: SERVER_VERSION });
  // Deliberately call the same five register functions stdio uses (no
  // description override), reconstructing the stdio schema/description
  // WITHOUT importing src/index.ts (which self-executes main() on import).
  registerRecall(server, { scope: TEST_SCOPE });
  registerRemember(server, { scope: TEST_SCOPE }); // no afterWrite — irrelevant to schema shape
  registerSearch(server, { scope: TEST_SCOPE });
  registerStats(server, { scope: TEST_SCOPE });
  registerReject(server, { scope: TEST_SCOPE });
  const client = await connectInMemory(server, 'stdio-equivalent-test-client');
  const { tools } = await client.listTools();
  return { tools: tools as ListedTool[], client };
}

describe('AC1 — remote profile registers exactly 5 tools (in-process, no live DB required)', () => {
  it('AC1: tools/list returns exactly recall, remember, search, stats, reject — none of the excluded six', async () => {
    const { tools, client } = await listRemoteTools();
    try {
      expect(tools.map((t) => t.name).sort()).toEqual(['recall', 'reject', 'remember', 'search', 'stats']);
    } finally {
      await client.close();
    }
  });

  it('R8: each tool description is the design.md §6 text verbatim', async () => {
    const { tools, client } = await listRemoteTools();
    try {
      const byName = Object.fromEntries(tools.map((t) => [t.name, t.description]));
      expect(byName.recall).toBe(EXPECTED_RECALL_DESCRIPTION);
      expect(byName.remember).toBe(EXPECTED_REMEMBER_DESCRIPTION);
      expect(byName.search).toBe(EXPECTED_SEARCH_DESCRIPTION);
      expect(byName.stats).toBe(EXPECTED_STATS_DESCRIPTION);
      expect(byName.reject).toBe(EXPECTED_REJECT_DESCRIPTION);
    } finally {
      await client.close();
    }
  });

  it('R1: each remote tool input schema deep-equals the stdio registration schema for the same tool (no drift)', async () => {
    const remote = await listRemoteTools();
    const stdio = await listStdioEquivalentTools();
    try {
      const stdioByName = Object.fromEntries(stdio.tools.map((t) => [t.name, t]));
      expect(remote.tools.length).toBe(5);
      for (const remoteTool of remote.tools) {
        const stdioTool = stdioByName[remoteTool.name];
        expect(stdioTool, `stdio registration missing for tool '${remoteTool.name}'`).toBeDefined();
        expect(remoteTool.inputSchema).toEqual(stdioTool.inputSchema);
      }
    } finally {
      await remote.client.close();
      await stdio.client.close();
    }
  });
});

describe('R8 — REMOTE_INSTRUCTIONS session-loop string', () => {
  it('is a short (<=6 non-blank-line) string covering recall-before-answering, remember-on-durable-decision, and empty-recall-is-normal', async () => {
    const { REMOTE_INSTRUCTIONS } = await import('../src/register/remote-descriptions.js');
    expect(typeof REMOTE_INSTRUCTIONS).toBe('string');
    const nonBlankLines = REMOTE_INSTRUCTIONS.split('\n').filter((l) => l.trim().length > 0);
    expect(nonBlankLines.length).toBeLessThanOrEqual(6);
    const lower = REMOTE_INSTRUCTIONS.toLowerCase();
    expect(lower).toMatch(/recall/);
    expect(lower).toMatch(/remember/);
    expect(lower).toContain('empty');
  });

  it('is actually wired as the McpServer initialize instructions (observable via the MCP client)', async () => {
    const { REMOTE_INSTRUCTIONS } = await import('../src/register/remote-descriptions.js');
    const { registerRemoteProfile } = await import('../src/register/remote-profile.js');
    const server = new McpServer(
      { name: 'r2mcp', version: SERVER_VERSION },
      { instructions: REMOTE_INSTRUCTIONS },
    );
    registerRemoteProfile(server, { scope: TEST_SCOPE });
    const client = await connectInMemory(server, 'instructions-test-client');
    try {
      expect(client.getInstructions()).toBe(REMOTE_INSTRUCTIONS);
    } finally {
      await client.close();
    }
  });
});

/* =====================================================================
 * AC5 — no-spawn behavioral belt test (structural proof is AC2b above)
 * =================================================================== */

describe('AC5 — remote remember never triggers the graph-rebuild subprocess (R4)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await setupTestDb();
  });
  afterAll(async () => {
    await teardownTestDb();
  });
  beforeEach(async () => {
    await pool.query('DELETE FROM memories WHERE project_scope = $1', [TEST_SCOPE]);
  });

  it('AC5: a real scripts/build-memory-graph.js sentinel is never executed by a remote remember() call, and the write genuinely lands', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'r2mcp-ac5-'));
    const scriptsDir = join(tempRoot, 'scripts');
    mkdirSync(scriptsDir, { recursive: true });
    const sentinelPath = join(tempRoot, 'sentinel-fired.txt');
    writeFileSync(
      join(scriptsDir, 'build-memory-graph.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(sentinelPath)}, 'fired');\n`,
    );

    const savedProjectRoot = process.env.PROJECT_ROOT;
    // Belt-and-suspenders: even if a future edit accidentally makes remote.ts
    // read PROJECT_ROOT, prove the sentinel still never fires.
    process.env.PROJECT_ROOT = tempRoot;

    try {
      const { registerRemoteProfile } = await import('../src/register/remote-profile.js');
      const server = new McpServer({ name: 'r2mcp', version: SERVER_VERSION });
      registerRemoteProfile(server, { scope: TEST_SCOPE });
      const client = await connectInMemory(server, 'ac5-belt-test-client');

      try {
        const content = `AC5 belt test memory ${Date.now()} — remote remember must not spawn a subprocess`;
        const result = await client.callTool({
          name: 'remember',
          arguments: {
            operation: 'ADD',
            tier: 'preferences',
            content,
            metadata: { type: 'preference', topics: ['ac5-belt-test'] },
          },
        });

        const textContent = (result.content as Array<{ type: string; text?: string }>).find(
          (c) => c.type === 'text',
        );
        expect(textContent?.text).toBeDefined();
        const parsed = JSON.parse(textContent!.text!) as { id?: string; operation?: string; dedup?: boolean };
        expect(parsed.operation).toBe('ADD');
        expect(parsed.id).toBeDefined();

        // Confirm the write genuinely landed in the target scope (this is a
        // real remember, not a short-circuited stub).
        const row = await pool.query(
          'SELECT content, project_scope FROM memories WHERE id = $1',
          [parsed.id],
        );
        expect(row.rows).toHaveLength(1);
        expect(row.rows[0].content).toBe(content);
        expect(row.rows[0].project_scope).toBe(TEST_SCOPE);

        // Give any accidental execFile() callback time to run and write the
        // sentinel before asserting its absence.
        await new Promise((r) => setTimeout(r, 500));
        expect(existsSync(sentinelPath)).toBe(false);
      } finally {
        await client.close();
      }
    } finally {
      if (savedProjectRoot === undefined) delete process.env.PROJECT_ROOT;
      else process.env.PROJECT_ROOT = savedProjectRoot;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
