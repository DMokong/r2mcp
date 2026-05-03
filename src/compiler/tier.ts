/**
 * Tier-level wiki compile (preferences / project-context / conversations).
 *
 * Compiler-controlled structure (headers, citations) → LLM-controlled prose.
 * This split keeps headers and source_memory_ids deterministic across runs
 * (B.R5 / B.AC3) while allowing prose-level variance under the 5% Levenshtein
 * threshold.
 */

import { clusterByTopic, topicTitle } from './clustering.js';
import { tierSystemPrompt, tierClusterUserPrompt } from './prompts.js';
import type {
  CompileSectionResult,
  CompileTierInput,
  Tier,
} from './types.js';

const TIER_HEADERS: Record<Tier, string> = {
  preferences: 'Preferences and Decisions',
  'project-context': 'Project Context',
  conversations: 'Relationship and Continuity',
};

const MAX_TOKENS_PER_CLUSTER = 400;

export async function compileTier(input: CompileTierInput): Promise<CompileSectionResult> {
  const { tier, memories, provider, maxCostUsd, costMeter } = input;
  const clusters = clusterByTopic(memories);

  const headers: string[] = [`## ${TIER_HEADERS[tier]}`];
  const sourceIds = new Set<string>();
  const lines: string[] = [`## ${TIER_HEADERS[tier]}`, ''];
  let partial = false;
  let sectionCost = 0;

  if (clusters.length === 0) {
    lines.push('_No memories in this tier yet._');
    return {
      body: lines.join('\n') + '\n',
      source_memory_ids: [],
      headers,
      cost_usd: 0,
      partial: false,
    };
  }

  for (const cluster of clusters) {
    if (costMeter.totalCostUsd >= maxCostUsd) {
      partial = true;
      costMeter.hitCap = true;
      break;
    }
    // Reserve estimate (worst-case) before issuing the call.
    if (costMeter.totalCostUsd + estimatedCallCost() > maxCostUsd) {
      partial = true;
      costMeter.hitCap = true;
      break;
    }

    const heading = `### ${topicTitle(cluster.topic)}`;
    headers.push(heading);

    const result = await provider.complete({
      model: 'haiku',
      system: tierSystemPrompt(tier),
      prompt: tierClusterUserPrompt(cluster.topic, cluster.memories),
      max_tokens: MAX_TOKENS_PER_CLUSTER,
    });
    costMeter.totalCostUsd += result.cost_usd;
    sectionCost += result.cost_usd;

    const prose = result.response.trim();
    lines.push('');
    lines.push(heading);
    lines.push('');
    lines.push(prose === '' ? '_(synthesis returned empty paragraph)_' : prose);
    lines.push('');
    const cites = cluster.memories.map((m) => `<m:${m.id}>`).join(' ');
    lines.push(`Sources: ${cites}`);
    for (const m of cluster.memories) sourceIds.add(m.id);
  }

  return {
    body: lines.join('\n') + '\n',
    source_memory_ids: [...sourceIds].sort(),
    headers,
    cost_usd: sectionCost,
    partial,
  };
}

/**
 * Conservative pre-call estimate. Tracks Anthropic's haiku list price for
 * an 800-token input + 400-token output: 0.0008*0.80 + 0.0004*4.00 ≈ $0.0022.
 * Used for cap-respect math; not for final cost reporting (which uses actuals).
 */
function estimatedCallCost(): number {
  return 0.003;
}
