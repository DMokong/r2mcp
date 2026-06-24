/**
 * Per-topic wiki page compile.
 *
 * Output shape (B.AC4):
 *   ## Summary
 *   ## Key Decisions
 *   ## Open Questions
 *   ## Timeline
 *
 * Summary / Key Decisions / Open Questions are LLM-synthesized. Timeline is
 * deterministic — built from `created_at` ordering — so it adds zero LLM cost
 * and gives the page a stable scaffold even when the LLM declines to produce
 * Open Questions content.
 */

import { effectiveDate, memoriesForTopic } from './clustering.js';
import { topicSectionUserPrompt, topicSystemPrompt } from './prompts.js';
import { withLLMCallSpan } from '../telemetry.js';
import type { CompileSectionResult, CompileTopicInput, MemoryForCompile } from './types.js';

const SECTION_NAMES = ['Summary', 'Key Decisions', 'Open Questions'] as const;
const MAX_TOKENS_PER_SECTION = 500;

export async function compileTopic(input: CompileTopicInput): Promise<CompileSectionResult> {
  const { topic, memories, provider, maxCostUsd, costMeter } = input;
  const relevant = memoriesForTopic(memories, topic);

  const headers: string[] = [];
  const lines: string[] = [];
  const sourceIds = new Set<string>();
  let partial = false;
  let sectionCost = 0;

  if (relevant.length === 0) {
    headers.push('## Summary');
    lines.push('## Summary', '', `_No memories tagged with topic '${topic}'._`, '');
    return {
      body: lines.join('\n') + '\n',
      source_memory_ids: [],
      headers,
      cost_usd: 0,
      partial: false,
    };
  }

  for (const section of SECTION_NAMES) {
    if (costMeter.totalCostUsd >= maxCostUsd) {
      partial = true;
      costMeter.hitCap = true;
      break;
    }
    if (costMeter.totalCostUsd + 0.003 > maxCostUsd) {
      partial = true;
      costMeter.hitCap = true;
      break;
    }
    const heading = `## ${section}`;
    headers.push(heading);
    // claw-1ejd: wrap LLM call for cross-process trace inheritance.
    const result = await withLLMCallSpan(
      'memory.compile_wiki.call',
      { provider: provider.name, model: 'haiku' },
      () =>
        provider.complete({
          model: 'haiku',
          system: topicSystemPrompt(),
          prompt: topicSectionUserPrompt(topic, section, relevant),
          max_tokens: MAX_TOKENS_PER_SECTION,
        }),
    );
    costMeter.totalCostUsd += result.cost_usd;
    sectionCost += result.cost_usd;
    lines.push(heading, '');
    const prose = result.response.trim();
    if (prose === 'NONE' || prose === '') {
      lines.push('_(no relevant content)_');
    } else {
      lines.push(prose);
    }
    lines.push('');
    const citeIds = sectionMemoryIds(section, relevant);
    if (citeIds.length > 0) {
      const cites = citeIds.map((id) => `<m:${id}>`).join(' ');
      lines.push(`Sources: ${cites}`);
      lines.push('');
      for (const id of citeIds) sourceIds.add(id);
    }
  }

  // Timeline is deterministic — no LLM call.
  if (!partial) {
    headers.push('## Timeline');
    lines.push('## Timeline', '');
    for (const m of relevant) {
      const date = (effectiveDate(m) || '').slice(0, 10) || 'unknown';
      // Collapse internal whitespace (newlines, runs of spaces) so a multi-line
      // memory body stays on a single Timeline bullet instead of spilling into
      // orphaned continuation rows.
      const flat = m.content.replace(/\s+/g, ' ').trim();
      const excerpt = flat.length > 120 ? flat.slice(0, 117) + '...' : flat;
      lines.push(`- ${date} — <m:${m.id}> ${excerpt}`);
      sourceIds.add(m.id);
    }
    lines.push('');
  }

  return {
    body: lines.join('\n') + '\n',
    source_memory_ids: [...sourceIds].sort(),
    headers,
    cost_usd: sectionCost,
    partial,
  };
}

function sectionMemoryIds(
  section: (typeof SECTION_NAMES)[number],
  memories: MemoryForCompile[],
): string[] {
  // For now, every section cites the same set of source memories (the entire
  // topic-tagged set). A future refinement can attribute differently per
  // section, but the contract is "stable across runs" — and "all memories
  // for the topic" is trivially stable.
  return [...memories.map((m) => m.id)].sort();
}
