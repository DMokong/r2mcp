import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { remember } from '../../src/tools/remember.js';
import { recall } from '../../src/tools/recall.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });
beforeEach(async () => { await pool.query('DELETE FROM memories'); });

describe('recall() tool', () => {
  it('falls back to full-text search when embeddings unavailable', async () => {
    // Ensure no API key so embeddings are null
    const savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      // Seed data
      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Dustin prefers dark mode in all code editors',
        metadata: { type: 'preference', topics: ['editor', 'ui'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'project-context',
        content: 'The Slack bot runs on port 3000',
        metadata: { type: 'context', topics: ['slack', 'infrastructure'] },
      });

      // Recall by keyword
      const response = await recall({ query: 'dark mode editor' });

      expect(response.search_mode).toBe('fulltext_only');
      expect(response.total_results).toBeGreaterThanOrEqual(1);
      expect(response.query).toBe('dark mode editor');

      // Should find the dark mode memory
      const match = response.results.find(r => r.content.includes('dark mode'));
      expect(match).toBeDefined();
      expect(match!.match_type).toBe('fulltext');
      expect(match!.tier).toBe('preferences');
      expect(match!.metadata.type).toBe('preference');
      expect(match!.metadata.topics).toContain('editor');
      expect(match!.score).toBeGreaterThan(0);
    } finally {
      if (savedKey !== undefined) {
        process.env.OPENROUTER_API_KEY = savedKey;
      }
    }
  });

  it('applies tier weighting — preferences ranks above conversations for similar content', async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      // Store similar content in different tiers
      await remember({
        operation: 'ADD',
        tier: 'conversations',
        content: 'Discussed TypeScript configuration for the memory server project',
        metadata: { type: 'observation', topics: ['typescript', 'memory'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Dustin prefers strict TypeScript configuration for memory server projects',
        metadata: { type: 'preference', topics: ['typescript', 'memory'] },
      });

      const response = await recall({ query: 'TypeScript configuration memory server' });

      expect(response.total_results).toBe(2);

      // Preferences (1.3x) should rank above conversations (0.8x)
      // given similar fulltext relevance
      expect(response.results[0].tier).toBe('preferences');
      expect(response.results[1].tier).toBe('conversations');

      // Verify the weighted score reflects tier weights
      expect(response.results[0].score).toBeGreaterThan(response.results[1].score);
    } finally {
      if (savedKey !== undefined) {
        process.env.OPENROUTER_API_KEY = savedKey;
      }
    }
  });

  it('filters by tier when tier parameter is provided', async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      // Store memories in different tiers, all mentioning "database"
      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Dustin prefers PostgreSQL database for all backend services',
        metadata: { type: 'decision', topics: ['database'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'project-context',
        content: 'The database schema uses pgvector for embedding storage',
        metadata: { type: 'context', topics: ['database', 'schema'] },
      });

      await remember({
        operation: 'ADD',
        tier: 'conversations',
        content: 'Discussed database migration strategy for the memory system',
        metadata: { type: 'observation', topics: ['database', 'migration'] },
      });

      // Recall with tier filter
      const response = await recall({
        query: 'database',
        tier: 'project-context',
      });

      // Should only return project-context tier
      expect(response.total_results).toBe(1);
      expect(response.results[0].tier).toBe('project-context');
      expect(response.results[0].content).toContain('pgvector');
    } finally {
      if (savedKey !== undefined) {
        process.env.OPENROUTER_API_KEY = savedKey;
      }
    }
  });

  it('excludes rejected and archived entries from results', async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    try {
      const original = await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Dustin prefers spaces for indentation style',
        metadata: { type: 'preference', topics: ['code-style'] },
      });
      await pool.query("UPDATE memories SET type = 'rejection' WHERE id = $1", [original.id]);

      const arch = await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Old indentation preference archived entirely',
        metadata: { type: 'preference', topics: ['code-style'] },
      });
      await pool.query("UPDATE memories SET type = 'archived' WHERE id = $1", [arch.id]);

      await remember({
        operation: 'ADD',
        tier: 'preferences',
        content: 'Dustin prefers tabs for indentation',
        metadata: { type: 'preference', topics: ['code-style'] },
      });

      const response = await recall({ query: 'indentation' });
      expect(response.total_results).toBe(1);
      expect(response.results[0].content).toContain('tabs');
    } finally {
      if (savedKey !== undefined) {
        process.env.OPENROUTER_API_KEY = savedKey;
      }
    }
  });
});
