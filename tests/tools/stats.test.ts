import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { remember } from '../../src/tools/remember.js';
import { stats } from '../../src/tools/stats.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });
beforeEach(async () => { await pool.query('DELETE FROM memories'); });

describe('stats() tool', () => {
  it('returns correct counts across tiers and types', async () => {
    await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Dustin prefers dark mode',
      metadata: { type: 'preference', topics: ['ui'] },
    });

    await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Use TypeScript for all new code',
      metadata: { type: 'decision', topics: ['code', 'typescript'] },
    });

    await remember({
      operation: 'ADD',
      tier: 'project-context',
      content: 'Memory MCP server uses PostgreSQL',
      metadata: { type: 'context', topics: ['memory', 'database'] },
    });

    await remember({
      operation: 'ADD',
      tier: 'conversations',
      content: 'Discussed memory architecture on 2026-03-20',
      metadata: { type: 'relationship', topics: ['memory'] },
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
    expect(result.by_type.observation).toBe(0);
    expect(result.by_type.rejection).toBe(0);

    expect(result.staleness.oldest_entry).toBeDefined();
    expect(result.staleness.avg_age_days).toBeGreaterThanOrEqual(0);

    // 'memory' appears in 2 entries, others in 1
    const memoryTopic = result.top_topics.find((t) => t.topic === 'memory');
    expect(memoryTopic).toBeDefined();
    expect(memoryTopic!.count).toBe(2);

    expect(result.index.model).toBe('openai/text-embedding-3-small');
    expect(result.index.entries_with_embeddings + result.index.entries_without_embeddings).toBe(4);
  });
});
