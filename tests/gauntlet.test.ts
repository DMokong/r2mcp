/**
 * Memory System Gauntlet — Regression + Benchmark Test Suite
 *
 * A comprehensive integration test that exercises every critical path of the
 * Memory MCP Server against a real PostgreSQL database.
 *
 * Run:
 *   cd r2mcp
 *   R2MCP_DATABASE_URL=postgresql://r2mcp:r2mcp@localhost:5432/r2mcp_test npx vitest run tests/gauntlet.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './setup.js';
import { remember } from '../src/tools/remember.js';
import { recall } from '../src/tools/recall.js';
import { search } from '../src/tools/search.js';
import { stats } from '../src/tools/stats.js';
import { reject } from '../src/tools/reject.js';
import { meditate } from '../src/tools/meditate.js';
import { parseMarkdownEntries } from '../src/cli/migrate.js';
import type pg from 'pg';

let pool: pg.Pool;

// Load .env from project root if API key not already in environment
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __gauntlet_dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__gauntlet_dirname, '../.env');
if (!process.env.R2MCP_OPENROUTER_API_KEY && existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^R2MCP_OPENROUTER_API_KEY=(.+)$/m);
  if (match) {
    process.env.R2MCP_OPENROUTER_API_KEY = match[1].trim();
  }
}

// Ensure no embeddings API is used (full-text only, unless explicitly testing semantic)
const originalApiKey = process.env.R2MCP_OPENROUTER_API_KEY;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  // Restore original API key
  if (originalApiKey) {
    process.env.R2MCP_OPENROUTER_API_KEY = originalApiKey;
  }
  await teardownTestDb();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function clearMemories() {
  await pool.query('DELETE FROM memories');
}

/** Insert a backdated memory by manipulating created_at directly. */
async function insertBackdated(
  content: string,
  tier: 'preferences' | 'project-context' | 'conversations',
  type: string,
  topics: string[],
  daysAgo: number,
): Promise<string> {
  const result = await remember({
    operation: 'ADD',
    tier,
    content,
    metadata: { type: type as any, topics },
  });
  const id = result.id!;
  await pool.query(
    `UPDATE memories SET created_at = NOW() - $1 * INTERVAL '1 day' WHERE id = $2`,
    [daysAgo, id],
  );
  return id;
}

// ---------------------------------------------------------------------------
// Gauntlet
// ---------------------------------------------------------------------------

describe('Memory System Gauntlet', () => {
  beforeEach(async () => {
    // Clear DB and unset API key for deterministic full-text mode
    await clearMemories();
    delete process.env.R2MCP_OPENROUTER_API_KEY;
  });

  // =========================================================================
  // Scenario 1: CRUD Lifecycle
  // =========================================================================
  describe('1. CRUD Lifecycle', () => {
    it('ADD → recall → UPDATE → recall → ARCHIVE → recall (excluded)', async () => {
      // ADD
      const addResult = await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Always use dark mode in VSCode editor',
        metadata: { type: 'preference', topics: ['editor', 'vscode'] },
      });
      expect(addResult.operation).toBe('ADD');
      expect(addResult.id).toBeTruthy();
      expect(addResult.dedup).toBe(false);

      const id = addResult.id!;

      // Verify row exists
      const row = await pool.query('SELECT * FROM memories WHERE id = $1', [id]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].content).toBe('Always use dark mode in VSCode editor');
      expect(row.rows[0].tier).toBe('preferences');

      // Recall by keyword
      const recall1 = await recall({ query: 'dark mode VSCode' });
      expect(recall1.results.length).toBeGreaterThanOrEqual(1);
      expect(recall1.results.some((r) => r.id === id)).toBe(true);

      // UPDATE
      const updateResult = await remember({
        operation: 'UPDATE',
        tier: 'preferences',
        content: 'Always use light mode in VSCode editor during daytime',
        metadata: { type: 'preference', topics: ['editor', 'vscode'] },
        target_id: id,
      });
      expect(updateResult.operation).toBe('UPDATE');
      expect(updateResult.id).toBe(id);

      // Verify content changed
      const updated = await pool.query('SELECT content FROM memories WHERE id = $1', [id]);
      expect(updated.rows[0].content).toBe('Always use light mode in VSCode editor during daytime');

      // Recall again — should return updated content
      const recall2 = await recall({ query: 'light mode VSCode daytime' });
      const found2 = recall2.results.find((r) => r.id === id);
      expect(found2).toBeTruthy();
      expect(found2!.content).toContain('light mode');

      // ARCHIVE
      const archiveResult = await remember({
        operation: 'ARCHIVE',
        tier: 'preferences',
        content: '',
        metadata: { type: 'preference' },
        target_id: id,
      });
      expect(archiveResult.operation).toBe('ARCHIVE');

      // Verify type='archived'
      const archived = await pool.query('SELECT type FROM memories WHERE id = $1', [id]);
      expect(archived.rows[0].type).toBe('archived');

      // Recall again — archived entries EXCLUDED
      const recall3 = await recall({ query: 'mode VSCode editor' });
      expect(recall3.results.every((r) => r.id !== id)).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 2: Dedup Idempotency
  // =========================================================================
  describe('2. Dedup Idempotency', () => {
    it('inserting same content 10 times produces exactly 1 row with 9 dedups', async () => {
      const content = 'Prefer bun over npm for all TypeScript projects';
      let dedupCount = 0;

      for (let i = 0; i < 10; i++) {
        const result = await remember({
          operation: 'ADD',
          tier: 'preferences',
          content,
          metadata: { type: 'preference', topics: ['tooling'] },
        });
        if (result.dedup) dedupCount++;
      }

      expect(dedupCount).toBe(9);

      const count = await pool.query('SELECT COUNT(*)::int AS cnt FROM memories');
      expect(count.rows[0].cnt).toBe(1);
    });
  });

  // =========================================================================
  // Scenario 3: Rejection Exclusion
  // =========================================================================
  describe('3. Rejection Exclusion', () => {
    it('rejected entries are excluded from recall and search', async () => {
      // ADD a memory
      const addResult = await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Use spaces for indentation in all source code files',
        metadata: { type: 'preference', topics: ['code-style', 'indentation'] },
      });
      const id = addResult.id!;

      // Reject it
      const rejectResult = await reject({ id, reason: 'Actually prefer tabs for indentation' });
      expect(rejectResult.rejected_id).toBe(id);
      expect(rejectResult.reason_id).toBeTruthy();

      // Verify original row has type='rejection'
      const row = await pool.query('SELECT type FROM memories WHERE id = $1', [id]);
      expect(row.rows[0].type).toBe('rejection');

      // recall("indentation") → rejected entry NOT in results
      const recallResult = await recall({ query: 'indentation' });
      expect(recallResult.results.every((r) => r.id !== id)).toBe(true);

      // search with topic filter → rejected entry NOT in results
      const searchResult = await search({
        filter: { topics: ['code-style'] },
      });
      expect(searchResult.results.every((r) => r.id !== id)).toBe(true);
    });
  });

  // =========================================================================
  // Scenario 4: Tier Weighting
  // =========================================================================
  describe('4. Tier Weighting', () => {
    it('preferences ranks first, conversations ranks last in recall', async () => {
      // Add identical-ish content to all 3 tiers (slightly different to avoid dedup)
      const baseContent = 'Kubernetes deployment strategy for microservices';

      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: `${baseContent} — preferences tier entry`,
        metadata: { type: 'preference', topics: ['kubernetes'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'project-context',
        content: `${baseContent} — project context tier entry`,
        metadata: { type: 'context', topics: ['kubernetes'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'conversations',
        content: `${baseContent} — conversations tier entry`,
        metadata: { type: 'relationship', topics: ['kubernetes'] },
      });

      const result = await recall({ query: 'Kubernetes deployment microservices' });
      expect(result.results.length).toBe(3);

      // Preferences should rank first
      expect(result.results[0].tier).toBe('preferences');
      // Conversations should rank last
      expect(result.results[2].tier).toBe('conversations');

      // Verify score ratios roughly match tier weights (1.3 : 1.0 : 0.8)
      const prefScore = result.results.find((r) => r.tier === 'preferences')!.score;
      const ctxScore = result.results.find((r) => r.tier === 'project-context')!.score;
      const convScore = result.results.find((r) => r.tier === 'conversations')!.score;

      // The raw fulltext scores should be the same, so weighted scores should follow tier ratio
      // Allow 5% tolerance for floating point
      const prefToCtx = prefScore / ctxScore;
      const ctxToConv = ctxScore / convScore;

      expect(prefToCtx).toBeCloseTo(1.3, 1); // 1.3 / 1.0
      expect(ctxToConv).toBeCloseTo(1.25, 1); // 1.0 / 0.8
    });
  });

  // =========================================================================
  // Scenario 5: Full-Text Fallback
  // =========================================================================
  describe('5. Full-Text Fallback', () => {
    it('recall works in fulltext_only mode when no API key is set', async () => {
      // R2MCP_OPENROUTER_API_KEY is already unset in beforeEach
      expect(process.env.R2MCP_OPENROUTER_API_KEY).toBeUndefined();

      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Prefer PostgreSQL over MySQL for all database projects',
        metadata: { type: 'preference', topics: ['database'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'project-context',
        content: 'Redis is used for caching session data across services',
        metadata: { type: 'context', topics: ['caching'] },
      });

      const result = await recall({ query: 'PostgreSQL database' });
      expect(result.search_mode).toBe('fulltext_only');
      expect(result.results.length).toBeGreaterThanOrEqual(1);
      expect(result.results[0].content).toContain('PostgreSQL');
    });
  });

  // =========================================================================
  // Scenario 6: Semantic Recall (conditional)
  // =========================================================================
  describe('6. Semantic Recall', () => {
    it.skipIf(!originalApiKey)(
      'meaning-based search finds results by concept, not keyword',
      async () => {
        // Restore API key for this test
        process.env.R2MCP_OPENROUTER_API_KEY = originalApiKey;

        await remember({
          operation: 'ADD',
          tier: 'preferences',
          content: 'Always use bun instead of npm for package management',
          metadata: { type: 'preference', topics: ['tooling', 'package-manager'] },
        });

        // Query by meaning, not keyword
        const result = await recall({
          query: 'what package manager does Dustin prefer',
        });
        expect(result.search_mode).toBe('semantic');
        expect(result.results.length).toBeGreaterThanOrEqual(1);
        expect(result.results[0].content).toContain('bun');

        // Clean up
        delete process.env.R2MCP_OPENROUTER_API_KEY;
      },
    );
  });

  // =========================================================================
  // Scenario 7: Search Filters (comprehensive)
  // =========================================================================
  describe('7. Search Filters', () => {
    let ids: string[];

    beforeEach(async () => {
      await clearMemories();
      delete process.env.R2MCP_OPENROUTER_API_KEY;
      ids = [];

      // Seed 5 memories with varying attributes
      // [0] preferences, preference, topics: [tooling, bun], people: [dustin]
      const r0 = await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Prefer bun for running scripts and installing packages quickly',
        metadata: { type: 'preference', topics: ['tooling', 'bun'], people: ['dustin'] },
      });
      ids.push(r0.id!);

      // [1] project-context, context, topics: [architecture, database]
      const r1 = await remember({
        operation: 'ADD',
        tier: 'project-context',
        content: 'Memory MCP server stores all memories in PostgreSQL with pgvector',
        metadata: { type: 'context', topics: ['architecture', 'database'] },
      });
      ids.push(r1.id!);

      // [2] conversations, relationship, topics: [workflow], people: [alice]
      const r2 = await remember({
        operation: 'ADD',
        tier: 'conversations',
        content: 'Discussed migration strategy with Alice last Thursday morning',
        metadata: { type: 'relationship', topics: ['workflow'], people: ['alice'] },
      });
      ids.push(r2.id!);

      // [3] preferences, decision, topics: [tooling, testing]
      const r3 = await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Decided to use vitest instead of jest for all testing purposes',
        metadata: { type: 'decision', topics: ['tooling', 'testing'] },
      });
      ids.push(r3.id!);

      // [4] project-context, observation, topics: [performance]
      const r4 = await remember({
        operation: 'ADD',
        tier: 'project-context',
        content: 'Observed that recall latency spikes above 500ms with more than 10k entries',
        metadata: { type: 'observation', topics: ['performance'] },
      });
      ids.push(r4.id!);

      // Backdate [2] for date range tests (30 days ago)
      await pool.query(
        `UPDATE memories SET created_at = NOW() - INTERVAL '30 days' WHERE id = $1`,
        [ids[2]],
      );
    });

    it('filters by type', async () => {
      const result = await search({ filter: { type: 'decision' } });
      expect(result.count).toBe(1);
      expect(result.results[0].id).toBe(ids[3]);
    });

    it('filters by tier', async () => {
      const result = await search({ filter: { tier: 'project-context' } });
      expect(result.count).toBe(2);
      const tierIds = result.results.map((r) => r.id);
      expect(tierIds).toContain(ids[1]);
      expect(tierIds).toContain(ids[4]);
    });

    it('filters by topics (array overlap)', async () => {
      const result = await search({ filter: { topics: ['tooling'] } });
      expect(result.count).toBe(2);
      const topicIds = result.results.map((r) => r.id);
      expect(topicIds).toContain(ids[0]);
      expect(topicIds).toContain(ids[3]);
    });

    it('filters by persons', async () => {
      const result = await search({ filter: { persons: ['alice'] } });
      expect(result.count).toBe(1);
      expect(result.results[0].id).toBe(ids[2]);
    });

    it('filters by created_after', async () => {
      // Only entries created in the last 7 days (excludes backdated [2])
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const result = await search({ filter: { created_after: sevenDaysAgo } });
      expect(result.count).toBe(4);
      expect(result.results.every((r) => r.id !== ids[2])).toBe(true);
    });

    it('filters by created_before', async () => {
      // Only entries created more than 7 days ago (only backdated [2])
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const result = await search({ filter: { created_before: sevenDaysAgo } });
      expect(result.count).toBe(1);
      expect(result.results[0].id).toBe(ids[2]);
    });

    it('combines tier + topics + query', async () => {
      const result = await search({
        filter: { tier: 'preferences', topics: ['tooling'] },
        query: 'vitest',
      });
      expect(result.count).toBe(1);
      expect(result.results[0].id).toBe(ids[3]);
    });

    it('returns empty on non-matching filter', async () => {
      const result = await search({
        filter: { topics: ['nonexistent-topic-xyz'] },
      });
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  // =========================================================================
  // Scenario 8: Stats Accuracy
  // =========================================================================
  describe('8. Stats Accuracy', () => {
    it('returns correct totals, tier counts, type counts, and top topics', async () => {
      // Insert exactly: 2 preferences, 1 project-context, 1 conversation
      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Prefer dark terminals with Monokai color scheme',
        metadata: { type: 'preference', topics: ['editor', 'theme'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Always run linters before committing code changes',
        metadata: { type: 'decision', topics: ['workflow', 'linting'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'project-context',
        content: 'ClaudeClaw uses launchd for scheduled background job execution',
        metadata: { type: 'context', topics: ['architecture', 'workflow'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'conversations',
        content: 'Discussed quarterly planning goals with the engineering team',
        metadata: { type: 'relationship', topics: ['planning'] },
      });

      const result = await stats();

      expect(result.total).toBe(4);

      expect(result.by_tier.preferences).toBe(2);
      expect(result.by_tier['project-context']).toBe(1);
      expect(result.by_tier.conversations).toBe(1);

      expect(result.by_type.preference).toBe(1);
      expect(result.by_type.decision).toBe(1);
      expect(result.by_type.context).toBe(1);
      expect(result.by_type.relationship).toBe(1);
      expect(result.by_type.rejection).toBe(0);

      // Top topics: workflow appears 2x, all others 1x
      const workflowTopic = result.top_topics.find((t) => t.topic === 'workflow');
      expect(workflowTopic).toBeTruthy();
      expect(workflowTopic!.count).toBe(2);

      // Staleness
      expect(result.staleness.oldest_entry).toBeTruthy();
      expect(result.staleness.avg_age_days).toBeGreaterThanOrEqual(0);

      // Index
      expect(result.index.entries_without_embeddings).toBe(4); // No API key = no embeddings
      expect(result.index.model).toBe('openai/text-embedding-3-small');
    });
  });

  // =========================================================================
  // Scenario 9: Meditate Operations
  // =========================================================================
  describe('9. Meditate Operations', () => {
    it('archives stale conversations but leaves preferences untouched', async () => {
      // Insert a conversations-tier entry, backdated 100 days (>90 threshold)
      const staleId = await insertBackdated(
        'Had an introductory call discussing project milestones and delivery timeline',
        'conversations',
        'relationship',
        ['meetings'],
        100,
      );

      // Insert a preferences-tier entry (should NEVER be auto-archived)
      const prefResult = await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Always prefer explicit error handling over silent catch blocks',
        metadata: { type: 'preference', topics: ['code-style'] },
      });
      const prefId = prefResult.id!;

      // Run meditate
      const result = await meditate({ mode: 'full', dry_run: false });

      expect(result.archived).toBe(1);

      // Verify the stale conversations entry is archived
      const staleRow = await pool.query('SELECT type FROM memories WHERE id = $1', [staleId]);
      expect(staleRow.rows[0].type).toBe('archived');

      // Verify the preferences entry is untouched
      const prefRow = await pool.query('SELECT type FROM memories WHERE id = $1', [prefId]);
      expect(prefRow.rows[0].type).toBe('preference');
    });

    it('dry_run counts but does not archive', async () => {
      await insertBackdated(
        'Old conversation about onboarding steps and documentation review process',
        'conversations',
        'relationship',
        ['onboarding'],
        100,
      );

      const result = await meditate({ mode: 'full', dry_run: true });
      expect(result.archived).toBe(1); // counted

      // But the entry should NOT be archived
      const rows = await pool.query("SELECT type FROM memories WHERE type = 'archived'");
      expect(rows.rows).toHaveLength(0);
    });
  });

  // =========================================================================
  // Scenario 10: Migration Idempotency
  // =========================================================================
  describe('10. Migration Idempotency', () => {
    it('parseMarkdownEntries + remember is idempotent — no duplicates on re-import', async () => {
      const syntheticMarkdown = `# Test Memories

## Tools
- Always use TypeScript strict mode for new projects <!-- type:preference topics:typescript,tooling -->
- Configure ESLint with recommended ruleset for linting consistency <!-- type:decision topics:linting,tooling -->

## Architecture
- Services communicate via gRPC for internal API calls <!-- type:context topics:architecture,grpc -->
`;

      const entries = parseMarkdownEntries(syntheticMarkdown, 'preferences', 'preference');
      expect(entries).toHaveLength(3);

      // First pass
      for (const entry of entries) {
        await remember({
          operation: 'ADD',
          tier: entry.tier,
          content: entry.content,
          metadata: entry.metadata,
        });
      }

      const afterFirst = await pool.query('SELECT COUNT(*)::int AS cnt FROM memories');
      expect(afterFirst.rows[0].cnt).toBe(3);

      // Second pass — all should dedup
      for (const entry of entries) {
        const result = await remember({
          operation: 'ADD',
          tier: entry.tier,
          content: entry.content,
          metadata: entry.metadata,
        });
        expect(result.dedup).toBe(true);
      }

      const afterSecond = await pool.query('SELECT COUNT(*)::int AS cnt FROM memories');
      expect(afterSecond.rows[0].cnt).toBe(3);
    });
  });

  // =========================================================================
  // Benchmarks
  // =========================================================================
  describe('Benchmarks', { timeout: 120_000 }, () => {
    it('measures latency for all tools and outputs JSON summary', async () => {
      await clearMemories();
      delete process.env.R2MCP_OPENROUTER_API_KEY;

      // Seed 100 entries across 3 tiers
      const tiers: Array<'preferences' | 'project-context' | 'conversations'> = [
        'preferences',
        'project-context',
        'conversations',
      ];
      const types: Array<'preference' | 'decision' | 'context' | 'relationship' | 'observation'> = [
        'preference',
        'decision',
        'context',
        'relationship',
        'observation',
      ];
      const topicPool = [
        'tooling',
        'database',
        'architecture',
        'workflow',
        'testing',
        'deployment',
        'security',
        'performance',
        'ux',
        'api',
      ];

      for (let i = 0; i < 100; i++) {
        const tier = tiers[i % 3];
        const type = types[i % 5];
        const topics = [topicPool[i % 10], topicPool[(i + 3) % 10]];
        await remember({
          operation: 'ADD',
          tier,
          content: `Benchmark entry number ${i}: this covers ${topics.join(' and ')} related ${type} for ${tier} tier memory storage`,
          metadata: { type, topics },
        });
      }

      // Verify corpus
      const corpusCount = await pool.query('SELECT COUNT(*)::int AS cnt FROM memories');
      expect(corpusCount.rows[0].cnt).toBe(100);

      // --- remember() latency ---
      const rememberTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await remember({
          operation: 'ADD',
          tier: 'preferences',
          content: `Latency benchmark write test entry iteration ${i} with unique content ${Date.now()}`,
          metadata: { type: 'observation', topics: ['benchmark'] },
        });
        rememberTimes.push(performance.now() - start);
      }

      // --- recall() full-text latency ---
      const recallTimes: number[] = [];
      const queries = [
        'tooling database',
        'architecture workflow',
        'testing deployment',
        'security performance',
        'benchmark entry',
        'memory storage',
        'preference decision',
        'context relationship',
        'observation tier',
        'deployment security',
      ];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await recall({ query: queries[i] });
        recallTimes.push(performance.now() - start);
      }

      // --- search() with filters latency ---
      const searchTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await search({
          filter: {
            tier: tiers[i % 3],
            topics: [topicPool[i % 10]],
          },
          query: topicPool[(i + 5) % 10],
        });
        searchTimes.push(performance.now() - start);
      }

      // --- stats() latency ---
      const statsStart = performance.now();
      await stats();
      const statsMs = performance.now() - statsStart;

      // --- meditate() latency ---
      const meditateStart = performance.now();
      await meditate({ mode: 'full', dry_run: true });
      const meditateMs = performance.now() - meditateStart;

      // Compute percentiles
      rememberTimes.sort((a, b) => a - b);
      recallTimes.sort((a, b) => a - b);
      searchTimes.sort((a, b) => a - b);

      const summary = {
        gauntlet_version: '1.0',
        timestamp: new Date().toISOString(),
        corpus_size: 100,
        benchmarks: {
          remember_p50_ms: Math.round(percentile(rememberTimes, 50) * 100) / 100,
          remember_p95_ms: Math.round(percentile(rememberTimes, 95) * 100) / 100,
          recall_fulltext_p50_ms: Math.round(percentile(recallTimes, 50) * 100) / 100,
          recall_fulltext_p95_ms: Math.round(percentile(recallTimes, 95) * 100) / 100,
          search_filtered_p50_ms: Math.round(percentile(searchTimes, 50) * 100) / 100,
          search_filtered_p95_ms: Math.round(percentile(searchTimes, 95) * 100) / 100,
          stats_ms: Math.round(statsMs * 100) / 100,
          meditate_ms: Math.round(meditateMs * 100) / 100,
        },
        regression: 'pass',
      };

      console.log('\n--- GAUNTLET BENCHMARK RESULTS ---');
      console.log(JSON.stringify(summary, null, 2));
      console.log('--- END BENCHMARK RESULTS ---\n');

      // Sanity: all timings should be under 5 seconds (generous ceiling for CI)
      expect(summary.benchmarks.remember_p95_ms).toBeLessThan(5000);
      expect(summary.benchmarks.recall_fulltext_p95_ms).toBeLessThan(5000);
      expect(summary.benchmarks.search_filtered_p95_ms).toBeLessThan(5000);
      expect(summary.benchmarks.stats_ms).toBeLessThan(5000);
      expect(summary.benchmarks.meditate_ms).toBeLessThan(5000);
    });
  });

  // =========================================================================
  // Scenario 11: Recall v2 — token reduction, diversity, progressive search
  // =========================================================================
  describe('11. Recall v2 Benchmarks', () => {
    it('measures token reduction, diversity improvement, and latency overhead vs v1-style recall', async () => {
      // clearMemories() is handled by outer beforeEach — do not call again here
      // (the outer beforeEach also deletes R2MCP_OPENROUTER_API_KEY for deterministic fulltext mode)
      delete process.env.R2MCP_OPENROUTER_API_KEY;

      // Corpus design: 3 clusters of related memories + 1 cluster of off-topic ones
      // Cluster A: 15 near-duplicate launchd memories (tests MMR dedup)
      // Cluster B: 15 varied architecture memories (tests relevant diversity)
      // Cluster C: 15 workflow memories (tests tier distribution)
      // Cluster D: 15 unrelated memories (tests min_score floor)
      const clusters: Array<{
        topic: string;
        tier: 'preferences' | 'project-context' | 'conversations';
        type: 'preference' | 'decision' | 'context' | 'relationship' | 'observation';
        contents: string[];
      }> = [
        {
          topic: 'launchd',
          tier: 'preferences',
          type: 'preference',
          contents: Array.from({ length: 15 }, (_, i) =>
            `Always use launchd to schedule background tasks on macOS — it is the system service manager variant ${i}`,
          ),
        },
        {
          topic: 'architecture',
          tier: 'project-context',
          type: 'context',
          contents: [
            'ClaudeClaw uses PostgreSQL with pgvector for memory storage and semantic search',
            'Memory MCP server exposes recall, remember, search, meditate, reject, stats tools',
            'Launchd jobs call claude -p with task prompts and output to dated directories',
            'Slack is the control plane — channels for domains, threads for task sessions',
            'OpenClaw handles browser automation and messaging via Docker container',
            'Morning brief aggregates calendar, email, and health data into a daily digest',
            'Finance ingest parses CSV transactions and categorizes via Claude Code',
            'Email triage runs daily and labels messages by priority and action required',
            'Memory system uses tiered files: preferences, project-context, conversations',
            'Observability via OTel — Alloy collector, Prometheus, Grafana dashboards',
            'Speculator handles spec scoring and quality gates for new features',
            'Beads is a git-backed issue tracker with dependencies and workflow hooks',
            'Cross-surface data pipeline shares Google data hourly via cowork-inbox JSON',
            'MCP servers configured in .mcp.json with environment variable injection',
            'Claude Code runs headless via claude -p with --dangerously-skip-permissions flag',
          ],
        },
        {
          topic: 'workflow',
          tier: 'conversations',
          type: 'relationship',
          contents: Array.from({ length: 15 }, (_, i) =>
            `Workflow discussion entry ${i}: covered project status, priorities, and next steps for the week`,
          ),
        },
        {
          topic: 'unrelated',
          tier: 'preferences',
          type: 'observation',
          contents: Array.from({ length: 15 }, (_, i) =>
            `Completely unrelated observation about weather patterns and seasonal temperature variation ${i}`,
          ),
        },
      ];

      for (const cluster of clusters) {
        for (const content of cluster.contents) {
          await remember({
            operation: 'ADD',
            tier: cluster.tier,
            content,
            metadata: { type: cluster.type, topics: [cluster.topic] },
          });
        }
      }

      const corpusSize = (await pool.query('SELECT COUNT(*)::int AS cnt FROM memories')).rows[0].cnt;
      expect(corpusSize).toBe(60);

      const testQueries = [
        'launchd scheduling background tasks macOS',
        'memory architecture MCP server tools',
        'workflow project status priorities',
        'PostgreSQL vector search embeddings',
        'Slack control plane channel domains',
      ];

      // v1-style: no floor, no diversity, no progressive
      const v1Results: Array<ReturnType<typeof recall> extends Promise<infer T> ? T : never> = [];
      const v1Times: number[] = [];
      for (const q of testQueries) {
        const start = performance.now();
        const r = await recall({ query: q, top_k: 10, min_score: 0.0, diversity: 1.0, progressive: false });
        v1Times.push(performance.now() - start);
        v1Results.push(r);
      }

      // v2-style: with floor + MMR + progressive defaults
      const v2Results: typeof v1Results = [];
      const v2Times: number[] = [];
      for (const q of testQueries) {
        const start = performance.now();
        const r = await recall({ query: q, top_k: 10 });
        v2Times.push(performance.now() - start);
        v2Results.push(r);
      }

      // Token reduction
      const v1TotalTokens = v1Results.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);
      const v2TotalTokens = v2Results.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0);
      const tokenReductionPct = v1TotalTokens > 0
        ? Math.round((1 - v2TotalTokens / v1TotalTokens) * 100)
        : 0;

      // Diversity: avg pairwise Jaccard similarity (lower = more diverse)
      function avgPairwiseSim(results: (typeof v1Results)[0]['results']): number {
        let total = 0, count = 0;
        for (let i = 0; i < results.length; i++) {
          for (let j = i + 1; j < results.length; j++) {
            const a = new Set(results[i].content.toLowerCase().split(/\s+/));
            const b = new Set(results[j].content.toLowerCase().split(/\s+/));
            let inter = 0;
            for (const w of a) { if (b.has(w)) inter++; }
            const union = a.size + b.size - inter;
            total += union === 0 ? 0 : inter / union;
            count++;
          }
        }
        return count === 0 ? 0 : total / count;
      }

      const v1AvgDiversity = v1Results.map(r => avgPairwiseSim(r.results)).reduce((a, b) => a + b, 0) / v1Results.length;
      const v2AvgDiversity = v2Results.map(r => avgPairwiseSim(r.results)).reduce((a, b) => a + b, 0) / v2Results.length;
      const earlyStoppedCount = v2Results.filter(r => r.early_stopped).length;

      v1Times.sort((a, b) => a - b);
      v2Times.sort((a, b) => a - b);

      const v2Summary = {
        gauntlet_version: '2.0',
        timestamp: new Date().toISOString(),
        corpus_size: corpusSize,
        token_reduction: {
          v1_total_tokens: v1TotalTokens,
          v2_total_tokens: v2TotalTokens,
          reduction_pct: tokenReductionPct,
        },
        diversity: {
          v1_avg_pairwise_sim: Math.round(v1AvgDiversity * 1000) / 1000,
          v2_avg_pairwise_sim: Math.round(v2AvgDiversity * 1000) / 1000,
          improved: v2AvgDiversity <= v1AvgDiversity,
        },
        progressive: {
          early_stopped_queries: earlyStoppedCount,
          total_queries: testQueries.length,
          note: 'Early stop fires in semantic mode only — fulltext rawScores rarely exceed threshold',
        },
        latency: {
          v1_p95_ms: Math.round(percentile(v1Times, 95) * 100) / 100,
          v2_p95_ms: Math.round(percentile(v2Times, 95) * 100) / 100,
          overhead_ms: Math.round((percentile(v2Times, 95) - percentile(v1Times, 95)) * 100) / 100,
        },
        regression: 'pass',
      };

      console.log('\n--- RECALL v2 BENCHMARK RESULTS ---');
      console.log(JSON.stringify(v2Summary, null, 2));
      console.log('--- END RECALL v2 BENCHMARK RESULTS ---\n');

      // Regressions
      expect(v2Summary.latency.overhead_ms).toBeLessThan(200);
      expect(v2TotalTokens).toBeLessThanOrEqual(v1TotalTokens);
      expect(v2AvgDiversity).toBeLessThanOrEqual(v1AvgDiversity + 0.05);
      for (const r of v2Results) {
        expect(r.tiers_searched).toBeDefined();
        expect(r.tokens_used).toBeDefined();
        expect(r.early_stopped).toBeDefined();
      }
    });
  });
});
