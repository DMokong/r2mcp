import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { remember } from '../../src/tools/remember.js';
import { search } from '../../src/tools/search.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });
beforeEach(async () => { await pool.query('DELETE FROM memories'); });

describe('search() tool', () => {
  it('filters by topics — returns only matching memories', async () => {
    await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Dustin prefers dark mode in all editors',
      metadata: { type: 'preference', topics: ['editor', 'ui'] },
    });

    await remember({
      operation: 'ADD',
      tier: 'project-context',
      content: 'The Slack bot uses Node.js runtime',
      metadata: { type: 'context', topics: ['slack', 'runtime'] },
    });

    const result = await search({
      filter: { topics: ['editor'] },
    });

    expect(result.count).toBe(1);
    expect(result.results[0].content).toBe('Dustin prefers dark mode in all editors');
    expect(result.results[0].topics).toContain('editor');
  });

  it('combines topic filter with full-text query', async () => {
    await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Dustin prefers dark mode in all editors',
      metadata: { type: 'preference', topics: ['editor', 'ui'] },
    });

    await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Dustin likes vim keybindings in editors',
      metadata: { type: 'preference', topics: ['editor', 'keybindings'] },
    });

    await remember({
      operation: 'ADD',
      tier: 'project-context',
      content: 'Dark mode is enabled on the dashboard',
      metadata: { type: 'context', topics: ['dashboard'] },
    });

    // Filter by topic 'editor' AND query for 'dark mode'
    const result = await search({
      filter: { topics: ['editor'] },
      query: 'dark mode',
    });

    expect(result.count).toBe(1);
    expect(result.results[0].content).toBe('Dustin prefers dark mode in all editors');
  });

  it('filters by tier', async () => {
    await remember({
      operation: 'ADD', tier: 'preferences',
      content: 'Use tabs for indentation',
      metadata: { type: 'preference', topics: ['code'] },
    });
    await remember({
      operation: 'ADD', tier: 'project-context',
      content: 'Database uses PostgreSQL',
      metadata: { type: 'context', topics: ['database'] },
    });

    const result = await search({ filter: { tier: 'preferences' } });
    expect(result.count).toBe(1);
    expect(result.results[0].tier).toBe('preferences');
  });

  it('filters by type', async () => {
    await remember({
      operation: 'ADD', tier: 'preferences',
      content: 'Always use bun',
      metadata: { type: 'decision', topics: ['tooling'] },
    });
    await remember({
      operation: 'ADD', tier: 'preferences',
      content: 'Prefer dark mode',
      metadata: { type: 'preference', topics: ['ui'] },
    });

    const result = await search({ filter: { type: 'decision' } });
    expect(result.count).toBe(1);
    expect(result.results[0].type).toBe('decision');
  });

  it('filters by persons', async () => {
    await remember({
      operation: 'ADD', tier: 'conversations',
      content: 'Discussed architecture with Alice',
      metadata: { type: 'relationship', people: ['Alice'] },
    });
    await remember({
      operation: 'ADD', tier: 'conversations',
      content: 'Chatted with Bob about testing',
      metadata: { type: 'relationship', people: ['Bob'] },
    });

    const result = await search({ filter: { persons: ['Alice'] } });
    expect(result.count).toBe(1);
    expect(result.results[0].people).toContain('Alice');
  });

  it('filters by date range', async () => {
    await remember({
      operation: 'ADD', tier: 'preferences',
      content: 'Recent preference',
      metadata: { type: 'preference' },
    });
    // Back-date one entry
    const old = await remember({
      operation: 'ADD', tier: 'preferences',
      content: 'Old preference from last year',
      metadata: { type: 'preference' },
    });
    await pool.query("UPDATE memories SET created_at = '2025-01-01' WHERE id = $1", [old.id]);

    const result = await search({
      filter: { created_after: '2026-01-01' },
    });
    expect(result.count).toBe(1);
    expect(result.results[0].content).toBe('Recent preference');
  });

  it('returns empty results with no matches', async () => {
    const result = await search({ filter: { topics: ['nonexistent'] } });
    expect(result.count).toBe(0);
    expect(result.results).toEqual([]);
  });
});

describe('search() scope resolution (trk-cou)', () => {
  // trk-cou: search()'s metadata-filter path built its own inline
  // project_scope predicate that only ever resolved current+global — unlike
  // recall(), it had no `scope` param at all, so an explicit non-default
  // scope (e.g. the ai-landscape index's date:YYYY-MM-DD topic key) silently
  // returned zero rows unless the caller passed all_scopes:true.

  it('search({filter: {topics}, scope}) reads a SPECIFIC scope, matching recall()', async () => {
    await remember(
      {
        operation: 'ADD',
        tier: 'project-context',
        content: 'AI landscape digest for 2026-09-02',
        metadata: { type: 'context', topics: ['date:2026-09-02'] },
      },
      'ai-landscape',
    );

    const scoped = await search({
      filter: { topics: ['date:2026-09-02'] },
      scope: 'ai-landscape',
    });
    expect(scoped.count).toBe(1);
    expect(scoped.results[0].content).toBe('AI landscape digest for 2026-09-02');

    // Default scope (no `scope`, no `all_scopes`) must NOT see the
    // ai-landscape row — this is exactly the bug: the topics filter path
    // ignored `scope` and fell back to current+global only.
    const unscoped = await search({ filter: { topics: ['date:2026-09-02'] } });
    expect(unscoped.count).toBe(0);

    const allScopes = await search({
      filter: { topics: ['date:2026-09-02'] },
      all_scopes: true,
    });
    expect(allScopes.count).toBe(1);
  });

  it('search({filter: {created_after}, scope}) also resolves scope — not topic-specific', async () => {
    await remember(
      {
        operation: 'ADD',
        tier: 'project-context',
        content: 'Recent ai-landscape entry',
        metadata: { type: 'context' },
      },
      'ai-landscape',
    );

    const scoped = await search({
      filter: { created_after: '2020-01-01' },
      scope: 'ai-landscape',
    });
    expect(scoped.results.map((r) => r.content)).toContain('Recent ai-landscape entry');

    const unscoped = await search({ filter: { created_after: '2020-01-01' } });
    expect(unscoped.results.map((r) => r.content)).not.toContain('Recent ai-landscape entry');
  });
});
