import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../setup.js';
import { remember } from '../../src/tools/remember.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });
beforeEach(async () => { await pool.query('DELETE FROM memories'); });

describe('remember() tool', () => {
  it('stores a new memory with ADD operation', async () => {
    const result = await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'Dustin prefers dark mode in all editors',
      metadata: {
        type: 'preference',
        topics: ['editor', 'ui'],
      },
    });

    expect(result.operation).toBe('ADD');
    expect(result.dedup).toBe(false);
    expect(result.id).toBeDefined();

    // Verify row exists in DB
    const row = await pool.query('SELECT * FROM memories WHERE id = $1', [result.id]);
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].tier).toBe('preferences');
    expect(row.rows[0].content).toBe('Dustin prefers dark mode in all editors');
    expect(row.rows[0].fingerprint).toBeDefined();
    expect(row.rows[0].fingerprint.length).toBe(64); // SHA-256 hex
  });

  it('deduplicates identical content via SHA-256', async () => {
    const content = 'Emojis are welcome in messages';

    const first = await remember({
      operation: 'ADD',
      tier: 'preferences',
      content,
      metadata: { type: 'preference', topics: ['communication'] },
    });

    expect(first.dedup).toBe(false);

    const second = await remember({
      operation: 'ADD',
      tier: 'preferences',
      content,
      metadata: { type: 'preference', topics: ['communication'] },
    });

    expect(second.dedup).toBe(true);
    expect(second.id).toBe(first.id);

    // Verify only 1 row exists
    const count = await pool.query('SELECT COUNT(*) FROM memories');
    expect(parseInt(count.rows[0].count, 10)).toBe(1);
  });

  it('handles UPDATE operation', async () => {
    // Insert first
    const original = await remember({
      operation: 'ADD',
      tier: 'project-context',
      content: 'Memory system uses flat files',
      metadata: { type: 'context', topics: ['memory'] },
    });

    // Update
    const updated = await remember({
      operation: 'UPDATE',
      tier: 'project-context',
      content: 'Memory system uses PostgreSQL + pgvector',
      metadata: { type: 'context', topics: ['memory', 'database'] },
      target_id: original.id,
    });

    expect(updated.operation).toBe('UPDATE');
    expect(updated.id).toBe(original.id);

    // Verify content changed in same row
    const row = await pool.query('SELECT * FROM memories WHERE id = $1', [original.id]);
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].content).toBe('Memory system uses PostgreSQL + pgvector');
    expect(row.rows[0].topics).toEqual(['memory', 'database']);
  });

  it('handles NOOP operation', async () => {
    const result = await remember({
      operation: 'NOOP',
      tier: 'preferences',
      content: 'ignored',
      metadata: { type: 'preference' },
    });
    expect(result.operation).toBe('NOOP');
    expect(result.message).toBe('No action taken.');
    const count = await pool.query('SELECT COUNT(*) FROM memories');
    expect(parseInt(count.rows[0].count, 10)).toBe(0);
  });

  it('handles REJECTION operation', async () => {
    const result = await remember({
      operation: 'REJECTION',
      tier: 'preferences',
      content: 'Don\'t use npm',
      metadata: { type: 'preference', topics: ['tooling'] },
    });
    expect(result.operation).toBe('REJECTION');
    expect(result.id).toBeDefined();
    const row = await pool.query('SELECT type FROM memories WHERE id = $1', [result.id]);
    expect(row.rows[0].type).toBe('rejection');
  });

  it('handles ARCHIVE operation', async () => {
    const original = await remember({
      operation: 'ADD',
      tier: 'conversations',
      content: 'Old conversation note',
      metadata: { type: 'relationship' },
    });

    const result = await remember({
      operation: 'ARCHIVE',
      tier: 'conversations',
      content: '',
      metadata: { type: 'relationship' },
      target_id: original.id,
    });
    expect(result.operation).toBe('ARCHIVE');
    // Soft-delete: row still exists but type is 'archived'
    const row = await pool.query('SELECT * FROM memories WHERE id = $1', [original.id]);
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].type).toBe('archived');
  });

  it('UPDATE without target_id returns error', async () => {
    const result = await remember({
      operation: 'UPDATE',
      tier: 'preferences',
      content: 'test',
      metadata: { type: 'preference' },
    });
    expect(result.message).toContain('target_id');
  });

  it('ARCHIVE without target_id returns error', async () => {
    const result = await remember({
      operation: 'ARCHIVE',
      tier: 'preferences',
      content: 'test',
      metadata: { type: 'preference' },
    });
    expect(result.message).toContain('target_id');
  });

  it('stores with NULL embedding when OpenRouter unavailable', async () => {
    // Ensure no API key
    const savedKey = process.env.OPEN_ROUTER_API_KEY;
    delete process.env.OPEN_ROUTER_API_KEY;

    try {
      const result = await remember({
        operation: 'ADD',
        tier: 'conversations',
        content: 'Test memory without embedding',
        metadata: { type: 'observation', topics: ['test'] },
      });

      expect(result.id).toBeDefined();

      const row = await pool.query('SELECT embedding FROM memories WHERE id = $1', [result.id]);
      expect(row.rows.length).toBe(1);
      expect(row.rows[0].embedding).toBeNull();
    } finally {
      // Restore key if it existed
      if (savedKey !== undefined) {
        process.env.OPEN_ROUTER_API_KEY = savedKey;
      }
    }
  });
});
