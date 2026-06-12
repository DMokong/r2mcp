/**
 * SPEC-047 — real-handler integration tests for the breadcrumb mappers.
 *
 * The prior suite (tests/breadcrumbs.test.ts, tests/breadcrumbs-wrapper.test.ts)
 * exercised the mappers with hand-written fixtures, which let three shape
 * mismatches ship undetected (claw-sup7). This file invokes the ACTUAL tool
 * handlers (recall, lint, remember) against a real test DB and asserts the
 * breadcrumb appears in the wrapped MCP response. If a mapper drifts from
 * the handler's response shape again, these tests fail immediately.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type pg from 'pg';
import { setupTestDb, teardownTestDb } from './setup.js';
import { asMcpResponse } from '../src/mcp-response.js';
import { recall } from '../src/tools/recall.js';
import { lint } from '../src/tools/lint.js';
import { remember } from '../src/tools/remember.js';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await pool.query('DELETE FROM memory_edges');
  await pool.query('DELETE FROM memory_entities');
  await pool.query('DELETE FROM entities');
  await pool.query('DELETE FROM memories');
});

async function seedTwoContradictingMemories(opts: { topic?: string } = {}) {
  const topics = opts.topic ? [opts.topic] : [];
  const { rows: [a] } = await pool.query(
    `INSERT INTO memories (content, tier, type, topics, fingerprint)
     VALUES ('Speculator runs on Bun runtime', 'preferences', 'decision', $1, 'fp-bc-a')
     RETURNING id`,
    [topics],
  );
  const { rows: [b] } = await pool.query(
    `INSERT INTO memories (content, tier, type, topics, fingerprint)
     VALUES ('Speculator runs on Node runtime', 'preferences', 'decision', $1, 'fp-bc-b')
     RETURNING id`,
    [topics],
  );
  await pool.query(
    `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
     VALUES ($1, $2, 'contradicts', 0.9, 'A says Bun; B says Node', 'test-v1')`,
    [a.id, b.id],
  );
  return { aId: a.id as string, bId: b.id as string };
}

describe('recall→lint breadcrumb against the real recall() handler (AC2)', () => {
  it('produces a lint breadcrumb naming the contradicted memory id', async () => {
    const { aId } = await seedTwoContradictingMemories();
    // Fulltext path — no API key required for embedding generation.
    const result = await recall({ query: 'Speculator runtime' });
    // Sanity: real handler returned the top-level signals array.
    expect(Array.isArray(result.signals)).toBe(true);
    expect(result.signals!.length).toBeGreaterThan(0);
    const contradicts = result.signals!.find((s) => s.kind === 'contradicts');
    expect(contradicts).toBeDefined();

    const wrapped = asMcpResponse('recall', result, { query: 'Speculator runtime' });
    const inner = JSON.parse(wrapped.content[0].text);
    expect(Array.isArray(inner.next_tools)).toBe(true);
    expect(inner.next_tools.length).toBeGreaterThanOrEqual(1);
    const lintCrumb = inner.next_tools.find((b: { name: string }) => b.name === 'lint');
    expect(lintCrumb).toBeDefined();
    expect(lintCrumb.usage).toContain('--check=contradictions');
    expect(lintCrumb.usage).toContain(`--memory-id=${aId}`);
  });

  it('returns empty next_tools when recall has no signals', async () => {
    await pool.query(
      `INSERT INTO memories (content, tier, type, fingerprint)
       VALUES ('isolated memory with no edges', 'preferences', 'context', 'fp-bc-iso')`,
    );
    const result = await recall({ query: 'isolated' });
    const wrapped = asMcpResponse('recall', result, { query: 'isolated' });
    const inner = JSON.parse(wrapped.content[0].text);
    expect(inner.next_tools).toEqual([]);
  });
});

describe('lint→compile breadcrumb against the real lint() handler (AC3)', () => {
  it('produces a compile breadcrumb per affected topic from the from-side memory', async () => {
    await seedTwoContradictingMemories({ topic: 'runtime-choice' });
    const result = await lint({ check: 'contradictions' });
    expect(result.findings.length).toBeGreaterThan(0);
    // The finding now carries the topic field directly — claw-sup7 fix.
    expect(result.findings[0].topic).toBe('runtime-choice');

    const wrapped = asMcpResponse('lint', result, { check: 'contradictions' });
    const inner = JSON.parse(wrapped.content[0].text);
    const compileCrumb = inner.next_tools.find(
      (b: { name: string }) => b.name === 'compile',
    );
    expect(compileCrumb).toBeDefined();
    expect(compileCrumb.usage).toBe('compile --topic=runtime-choice');
  });

  it('honors the new memory_id filter — only returns findings touching that memory', async () => {
    const { aId, bId } = await seedTwoContradictingMemories({ topic: 'runtime-choice' });
    // Seed an unrelated contradiction not involving either memory.
    const { rows: [c] } = await pool.query(
      `INSERT INTO memories (content, tier, type, topics, fingerprint)
       VALUES ('unrelated C', 'preferences', 'decision', ARRAY['other']::text[], 'fp-bc-c')
       RETURNING id`,
    );
    const { rows: [d] } = await pool.query(
      `INSERT INTO memories (content, tier, type, topics, fingerprint)
       VALUES ('unrelated D', 'preferences', 'decision', ARRAY['other']::text[], 'fp-bc-d')
       RETURNING id`,
    );
    await pool.query(
      `INSERT INTO memory_edges (from_memory_id, to_memory_id, relation, confidence, rationale, classifier_version)
       VALUES ($1, $2, 'contradicts', 0.9, 'unrelated', 'test-v1')`,
      [c.id, d.id],
    );

    const full = await lint({ check: 'contradictions' });
    expect(full.findings.length).toBeGreaterThanOrEqual(2);

    const scoped = await lint({ check: 'contradictions', memory_id: aId });
    expect(scoped.findings.length).toBe(1);
    expect([scoped.findings[0].memory_id, scoped.findings[0].related_memory_id]).toContain(aId);
    expect([scoped.findings[0].memory_id, scoped.findings[0].related_memory_id]).toContain(bId);
  });

  it('emits no compile breadcrumb when the from-side memory has no topics', async () => {
    await seedTwoContradictingMemories(); // no topic
    const result = await lint({ check: 'contradictions' });
    expect(result.findings[0].topic).toBeUndefined();
    const wrapped = asMcpResponse('lint', result, { check: 'contradictions' });
    const inner = JSON.parse(wrapped.content[0].text);
    const compileCrumb = inner.next_tools.find(
      (b: { name: string }) => b.name === 'compile',
    );
    expect(compileCrumb).toBeUndefined();
  });
});

describe('remember→recall breadcrumb against the real remember() handler', () => {
  it('produces a recall breadcrumb pointing at the just-stored memory', async () => {
    const result = await remember({
      operation: 'ADD',
      tier: 'preferences',
      content: 'breadcrumb-real-handlers test — unique decision content',
      metadata: { type: 'decision' },
    });
    // Real handler exposes `id` (NOT `memory_id`) — the mapper must read it.
    expect(result.id).toBeTruthy();
    const wrapped = asMcpResponse('remember', result, {
      tier: 'preferences',
      content: 'breadcrumb-real-handlers test — unique decision content',
    });
    const inner = JSON.parse(wrapped.content[0].text);
    expect(inner.next_tools).toHaveLength(1);
    expect(inner.next_tools[0].name).toBe('recall');
    expect(inner.next_tools[0].usage).toContain('--tier=preferences');
    expect(inner.next_tools[0].usage).toContain('--query=');
    expect(inner.next_tools[0].why).toContain('indexed');
  });

  it('produces no breadcrumb for a NOOP operation (no id set)', async () => {
    const result = await remember({
      operation: 'NOOP',
      tier: 'preferences',
      content: 'unused',
      metadata: { type: 'context' },
    });
    expect(result.id).toBeUndefined();
    const wrapped = asMcpResponse('remember', result, {
      tier: 'preferences',
      content: 'unused',
    });
    const inner = JSON.parse(wrapped.content[0].text);
    expect(inner.next_tools).toEqual([]);
  });
});
