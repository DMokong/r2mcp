import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool, initDb, closeDb } from '../../src/db.js';
import { meditate } from '../../src/tools/meditate.js';
import { fingerprint } from '../../src/fingerprint.js';

describe('meditate', () => {
  beforeEach(async () => {
    await initDb();
    const pool = getPool();
    await pool.query('DELETE FROM memories');
  });

  afterAll(async () => {
    await closeDb();
  });

  it('archives stale conversations entries', async () => {
    const pool = getPool();
    const content = 'Discussed project timeline with Dustin';
    const fp = fingerprint(content);

    // Insert a conversations-tier entry
    const insertResult = await pool.query(
      `INSERT INTO memories (content, tier, type, topics, people, fingerprint)
       VALUES ($1, 'conversations', 'relationship', $2, $3, $4)
       RETURNING id`,
      [content, ['timeline'], ['Dustin'], fp]
    );
    const id = insertResult.rows[0].id;

    // Set created_at to 100 days ago
    await pool.query(
      `UPDATE memories SET created_at = NOW() - INTERVAL '100 days' WHERE id = $1`,
      [id]
    );

    // Run meditate
    const result = await meditate({ mode: 'full', dry_run: false });

    expect(result.archived).toBe(1);
    expect(result.total_changes).toBeGreaterThanOrEqual(1);

    // Verify the type was changed to 'archived'
    const check = await pool.query('SELECT type FROM memories WHERE id = $1', [id]);
    expect(check.rows[0].type).toBe('archived');
  });

  it('dry run does not modify data', async () => {
    const pool = getPool();
    const content = 'Discussed project timeline with Dustin for dry run test';
    const fp = fingerprint(content);

    // Insert a conversations-tier entry
    const insertResult = await pool.query(
      `INSERT INTO memories (content, tier, type, topics, people, fingerprint)
       VALUES ($1, 'conversations', 'relationship', $2, $3, $4)
       RETURNING id`,
      [content, ['timeline'], ['Dustin'], fp]
    );
    const id = insertResult.rows[0].id;

    // Set created_at to 100 days ago
    await pool.query(
      `UPDATE memories SET created_at = NOW() - INTERVAL '100 days' WHERE id = $1`,
      [id]
    );

    // Run meditate with dry_run=true
    const result = await meditate({ mode: 'full', dry_run: true });

    // Should still report what WOULD be archived
    expect(result.archived).toBe(1);

    // But the type should NOT have changed
    const check = await pool.query('SELECT type FROM memories WHERE id = $1', [id]);
    expect(check.rows[0].type).toBe('relationship');
  });
});
