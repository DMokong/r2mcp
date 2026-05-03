/**
 * Synthesis prompts for tier and topic compile. Kept in their own module so
 * tests can snapshot them and developers can iterate on prompt language
 * without scrolling through synthesis logic.
 *
 * Design contract (B.R5 stability):
 *   - The compiler controls structure (headers, citation placeholders).
 *   - The LLM produces only the prose paragraphs.
 *   - Citation tags are inserted by the compiler, not the LLM, so the set
 *     of cited memory IDs is identical across runs.
 */

import type { MemoryForCompile, Tier } from './types.js';

const TIER_INTENT: Record<Tier, string> = {
  preferences: 'a browsable summary of preferences and decisions',
  'project-context': 'a browsable summary of architecture and project state',
  conversations: 'a browsable summary of relationship continuity and recurring threads',
};

export function tierSystemPrompt(tier: Tier): string {
  return `You produce ${TIER_INTENT[tier]} for a personal AI memory store.

Write a single concise paragraph (2-4 sentences) per cluster. Do NOT add headers, lists, or citation tags — those are inserted by the compiler around your output. Speak in present tense. Stay grounded in the cluster content; do not invent decisions or context.

Reply with ONLY the paragraph text — no preamble, no closing remarks.`;
}

export function topicSystemPrompt(): string {
  return `You write a single section of an LLM wiki page about a topic. The section name and the source memories are given. Write a concise paragraph (2-5 sentences) capturing the section's content.

Do NOT add headers, lists, or citation tags — the compiler inserts those. Stay grounded; do not speculate beyond the source memories. If the section is empty (no relevant content), reply with the literal string: NONE`;
}

export function memoryListPromptFragment(memories: MemoryForCompile[]): string {
  return memories
    .map((m) => `- (id=${m.id}, type=${m.type}) ${m.content}`)
    .join('\n');
}

export function tierClusterUserPrompt(topic: string, memories: MemoryForCompile[]): string {
  const edgeNote = describeEdges(memories);
  return [
    `Cluster topic: ${topic}`,
    'Source memories:',
    memoryListPromptFragment(memories),
    edgeNote ? `\nKnown structural relationships:\n${edgeNote}` : '',
    '\nWrite the paragraph.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function topicSectionUserPrompt(
  topic: string,
  section: 'Summary' | 'Key Decisions' | 'Open Questions',
  memories: MemoryForCompile[],
): string {
  const edgeNote = describeEdges(memories);
  return [
    `Topic: ${topic}`,
    `Section: ${section}`,
    'Source memories:',
    memoryListPromptFragment(memories),
    edgeNote ? `\nKnown structural relationships:\n${edgeNote}` : '',
    '\nWrite the section paragraph (or NONE if no content fits this section).',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Surface superseded / contradicted relationships so the LLM frames history
 * accurately (B.AC7). Only mentions relations that affect prose framing.
 */
function describeEdges(memories: MemoryForCompile[]): string {
  const lines: string[] = [];
  const ids = new Set(memories.map((m) => m.id));
  for (const m of memories) {
    if (!m.edges) continue;
    for (const e of m.edges) {
      if (!ids.has(e.from_memory_id) || !ids.has(e.to_memory_id)) continue;
      if (e.relation === 'supersedes') {
        lines.push(`- ${e.from_memory_id} supersedes ${e.to_memory_id} — ${e.rationale}`);
      } else if (e.relation === 'contradicts') {
        lines.push(`- ${e.from_memory_id} contradicts ${e.to_memory_id} — ${e.rationale}`);
      } else if (e.relation === 'evolved_into') {
        lines.push(`- ${e.from_memory_id} evolved into ${e.to_memory_id} — ${e.rationale}`);
      }
    }
  }
  return lines.join('\n');
}
