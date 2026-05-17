// SPEC-046 Task 6 — extractor driver.
//
// Orchestrates pre-filter → LLM call → strict parse → DB writes → state
// recording → run summary, with cost cap enforcement and resume support.
// All DB writes go through the entity DB layer (Task 4), which accepts both
// pg.Pool and pg.PoolClient. State machinery is delegated to EntityState
// (Task 5).

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { LLMProvider } from '../providers/types.js';
import { withLLMCallSpan } from '../telemetry.js';
import { buildExtractionPrompt, parseExtractionResponse } from './prompt.js';
import {
  findCandidateMemories,
  getTopEntitiesByFrequency,
  upsertEntity,
  linkMemoryToEntity,
} from './db.js';
import { normalizeEntityName } from './normalize.js';
import { EntityState } from './state.js';
import type { RunSummary } from './types.js';

export interface RunExtractorOptions {
  client: pg.Pool | pg.PoolClient;
  provider: LLMProvider;
  dataDir: string;
  maxCostUsd: number;
  contextTopN: number;
  sinceDays?: number;
  full?: boolean;
  resumeFrom?: string;
}

export async function runExtractor(opts: RunExtractorOptions): Promise<RunSummary> {
  const startedAt = new Date();
  const runId = randomUUID();
  const state = new EntityState({ runId, dataDir: opts.dataDir, resumeFrom: opts.resumeFrom });

  let memories_seen = 0;
  let memories_extracted = 0;
  let entities_created = 0;
  let entities_updated = 0;
  let links_created = 0;
  let total_cost_usd = 0;
  let parse_failures = 0;
  let hit_cost_cap = false;
  let hallucinated_matched = 0;

  const candidates = await findCandidateMemories(opts.client, {
    sinceDays: opts.sinceDays,
    full: opts.full,
  });
  const known = await getTopEntitiesByFrequency(opts.client, opts.contextTopN);

  // claw-2jbo finding 1: build a normalized-name → entity-id map once per run
  // so LLM-matched canonical_names resolve synchronously instead of issuing
  // findEntityByInput() per match (N+1). The spec requires the LLM to echo a
  // canonical_name verbatim from the known set, so the map should always hit
  // for well-behaved LLM output. Map misses (counted via hallucinated_matched)
  // are the hallucination signal — see finding 2.
  //
  // Key by normalized canonical_name AND each alias so a match-by-alias still
  // resolves (aliases stored normalized; see db.ts upsertEntity/mergeAliases).
  const knownById = new Map<string, string>(); // normalized lookup → entity id
  for (const e of known) {
    knownById.set(e.normalized_name, e.id);
    for (const alias of e.aliases) knownById.set(alias, e.id);
  }

  for (const mem of candidates) {
    memories_seen++;
    if (state.isMemoryTerminal(mem.id)) continue;
    if (total_cost_usd >= opts.maxCostUsd) {
      state.recordTerminal(mem.id, 'cap_reached');
      hit_cost_cap = true;
      continue;
    }

    const prompt = buildExtractionPrompt({
      memory_content: mem.content,
      known_entities: known.map((e) => ({
        type: e.type,
        canonical_name: e.canonical_name,
        aliases: e.aliases,
      })),
    });

    let rawResponse: string;
    try {
      // claw-1ejd: wrap the LLM call in a child span so the parent context
      // restored from OTEL_TRACEPARENT (set by the MCP wrapper) has a
      // concrete operation to inherit. No-op when SDK is not initialized.
      const result = await withLLMCallSpan(
        'memory.extract_entities.call',
        { provider: opts.provider.name, model: 'haiku' },
        () => opts.provider.complete({ prompt, model: 'haiku' }),
      );
      total_cost_usd += result.cost_usd;
      rawResponse = result.response;
    } catch (e) {
      // Surface provider failures via run summary error; do not mark terminal.
      return finalize(state, startedAt, runId, {
        memories_seen,
        memories_extracted,
        entities_created,
        entities_updated,
        links_created,
        total_cost_usd,
        hit_cost_cap,
        parse_failures,
        hallucinated_matched,
        error: `provider error: ${(e as Error).message}`,
      });
    }

    if (total_cost_usd >= opts.maxCostUsd) hit_cost_cap = true;

    const parsed = parseExtractionResponse(rawResponse);
    if (!parsed.ok) {
      parse_failures++;
      state.recordParseFailed(mem.id, rawResponse);
      continue;
    }

    for (const m of parsed.value.matched) {
      // Synchronous lookup against the in-memory map built from the known set
      // above (claw-2jbo finding 1). A miss means the LLM returned a
      // canonical_name not in the context we provided — i.e. a hallucination.
      // Increment hallucinated_matched and skip the link (no DB write for a
      // canonical we never told the model about).
      const entityId = knownById.get(normalizeEntityName(m.canonical_name));
      if (!entityId) {
        hallucinated_matched++;
        continue;
      }
      const link = await linkMemoryToEntity(
        opts.client,
        mem.id,
        entityId,
        m.confidence,
        'classifier',
      );
      if (link.inserted) links_created++;
    }
    for (const n of parsed.value.new_entities) {
      const up = await upsertEntity(opts.client, {
        type: n.type,
        canonical_name: n.canonical_name,
        aliases: n.aliases,
      });
      if (up.created) entities_created++;
      else entities_updated++;
      // Alias merge happens inside upsertEntity's ON CONFLICT clause (see db.ts).
      const link = await linkMemoryToEntity(opts.client, mem.id, up.id, n.confidence, 'classifier');
      if (link.inserted) links_created++;
    }

    memories_extracted++;
    state.recordTerminal(mem.id, 'extracted');
  }

  return finalize(state, startedAt, runId, {
    memories_seen,
    memories_extracted,
    entities_created,
    entities_updated,
    links_created,
    total_cost_usd,
    hit_cost_cap,
    parse_failures,
    hallucinated_matched,
  });
}

function finalize(
  state: EntityState,
  startedAt: Date,
  runId: string,
  counts: {
    memories_seen: number;
    memories_extracted: number;
    entities_created: number;
    entities_updated: number;
    links_created: number;
    total_cost_usd: number;
    hit_cost_cap: boolean;
    parse_failures: number;
    hallucinated_matched: number;
    error?: string;
  },
): RunSummary {
  const summary: RunSummary = {
    run_id: runId,
    started_at: startedAt.toISOString(),
    ended_at: new Date().toISOString(),
    ...counts,
  };
  if (counts.parse_failures > 0 && !summary.error) {
    summary.error = `parse failures: ${counts.parse_failures}`;
  }
  state.writeRunSummary(summary);
  state.close();
  return summary;
}
