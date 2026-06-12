import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb } from './setup.js';
import { parseMarkdownEntries } from '../src/cli/migrate.js';
import { remember } from '../src/tools/remember.js';
import type pg from 'pg';

let pool: pg.Pool;

beforeAll(async () => { pool = await setupTestDb(); });
afterAll(async () => { await teardownTestDb(); });
beforeEach(async () => { await pool.query('DELETE FROM memories'); });

const SAMPLE_MARKDOWN = `# Preferences & Decisions

Tier 1 priority memory — Dustin's working style, tool preferences, and decisions with rationale.

## Code Style
- Prefers tabs over spaces for indentation <!-- type:preference topics:code-style -->
- Always prefer async/await over raw promises in JavaScript <!-- type:preference topics:code-style,javascript -->

## Workflow Preferences
- Slack is the control plane — channels for context domains, threads for task sessions
  Important detail on continuation line
  Another continuation <!-- type:decision topics:slack,workflow people:dustin -->
`;

describe('parseMarkdownEntries()', () => {
	it('parses entries with correct tier, type, topics, section, and people', () => {
		const entries = parseMarkdownEntries(SAMPLE_MARKDOWN, 'preferences', 'preference');

		expect(entries).toHaveLength(3);

		// Entry 1: tabs vs spaces
		expect(entries[0].content).toBe('Prefers tabs over spaces for indentation <!-- type:preference topics:code-style -->');
		expect(entries[0].tier).toBe('preferences');
		expect(entries[0].metadata.type).toBe('preference');
		expect(entries[0].metadata.topics).toEqual(['code-style']);
		expect(entries[0].metadata.section).toBe('Code Style');

		// Entry 2: async/await
		expect(entries[1].metadata.type).toBe('preference');
		expect(entries[1].metadata.topics).toEqual(['code-style', 'javascript']);

		// Entry 3: Slack with continuation lines and people
		expect(entries[2].content).toContain('Slack is the control plane');
		expect(entries[2].content).toContain('Important detail on continuation line');
		expect(entries[2].content).toContain('Another continuation');
		expect(entries[2].metadata.type).toBe('decision');
		expect(entries[2].metadata.topics).toEqual(['slack', 'workflow']);
		expect(entries[2].metadata.people).toEqual(['dustin']);
		expect(entries[2].metadata.section).toBe('Workflow Preferences');
	});

	it('uses default type when no metadata comment present', () => {
		const md = `# Context

## State
- Memory system is running
- Database is PostgreSQL <!-- type:context topics:database -->
`;
		const entries = parseMarkdownEntries(md, 'project-context', 'context');
		expect(entries).toHaveLength(2);

		// No metadata comment — should use defaultType
		expect(entries[0].metadata.type).toBe('context');
		expect(entries[0].metadata.topics).toBeUndefined();

		// With metadata
		expect(entries[1].metadata.type).toBe('context');
		expect(entries[1].metadata.topics).toEqual(['database']);
	});
});

describe('migration import', () => {
	it('imports parsed entries into the database with correct fields', async () => {
		const entries = parseMarkdownEntries(SAMPLE_MARKDOWN, 'preferences', 'preference');
		expect(entries.length).toBe(3);

		for (const entry of entries) {
			await remember({
				operation: 'ADD',
				tier: entry.tier,
				content: entry.content,
				metadata: entry.metadata,
			});
		}

		const result = await pool.query('SELECT * FROM memories ORDER BY created_at');
		expect(result.rows).toHaveLength(3);

		expect(result.rows[0].tier).toBe('preferences');
		expect(result.rows[0].type).toBe('preference');
		expect(result.rows[0].section).toBe('Code Style');
		expect(result.rows[0].topics).toEqual(['code-style']);

		expect(result.rows[2].tier).toBe('preferences');
		expect(result.rows[2].type).toBe('decision');
		expect(result.rows[2].people).toEqual(['dustin']);
	});

	it('is idempotent — running twice produces no new rows', async () => {
		const entries = parseMarkdownEntries(SAMPLE_MARKDOWN, 'preferences', 'preference');

		// First pass
		for (const entry of entries) {
			await remember({
				operation: 'ADD',
				tier: entry.tier,
				content: entry.content,
				metadata: entry.metadata,
			});
		}

		const afterFirst = await pool.query('SELECT COUNT(*) FROM memories');
		expect(parseInt(afterFirst.rows[0].count, 10)).toBe(3);

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

		const afterSecond = await pool.query('SELECT COUNT(*) FROM memories');
		expect(parseInt(afterSecond.rows[0].count, 10)).toBe(3);
	});
});
