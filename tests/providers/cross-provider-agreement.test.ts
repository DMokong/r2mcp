/**
 * D.AC6 — cross-provider classification agreement on a fixed corpus.
 *
 * Runs the Stage 2 classifier through each available provider against a
 * hand-labeled corpus of memory pairs. Verifies relation agreement ≥ 90%
 * and confidence agreement within ±0.1.
 *
 * **Gated by environment.** This is a real-LLM integration test; running
 * each pair through three providers is expensive (~$0.50–$1 on Anthropic +
 * OpenRouter, plus claude-code subprocess overhead). It is skipped by
 * default and runs only when `R2MCP_RUN_CROSS_PROVIDER=1` is set, with at
 * least two of the three providers configured.
 *
 * Skipped in CI by default — this is a "before-merging" sanity check, not
 * a per-commit guardrail.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { stage2OpusClassify } from '../../src/edges/stage2-opus.js';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import { ClaudeCodeProvider } from '../../src/providers/claude-code.js';
import { OpenRouterProvider } from '../../src/providers/openrouter.js';
import type { LLMProvider } from '../../src/providers/types.js';
import type { EdgeRelation } from '../../src/edges/types.js';

interface CorpusEntry {
  from: { id: string; content: string; type: string };
  to:   { id: string; content: string; type: string };
  expected_relation: EdgeRelation | 'none';
}

function loadCorpus(): CorpusEntry[] {
  const path = resolve(__dirname, '../fixtures/edge-corpus.jsonl');
  const raw = readFileSync(path, 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CorpusEntry);
}

function shouldRun(): boolean {
  return process.env.R2MCP_RUN_CROSS_PROVIDER === '1';
}

function availableProviders(): Map<string, LLMProvider> {
  const out = new Map<string, LLMProvider>();
  if (process.env.ANTHROPIC_API_KEY) {
    out.set('anthropic', new AnthropicProvider());
  }
  if (process.env.R2MCP_OPENROUTER_API_KEY) {
    out.set('openrouter', new OpenRouterProvider());
  }
  // claude-code can be inferred at use time — only include if explicitly enabled
  if (process.env.R2MCP_CROSS_PROVIDER_INCLUDE_CLAUDE_CODE === '1') {
    out.set('claude-code', new ClaudeCodeProvider());
  }
  return out;
}

describe.skipIf(!shouldRun())('cross-provider classification agreement (D.AC6)', () => {
  const corpus = loadCorpus();
  const providers = availableProviders();

  it('corpus has at least 30 pairs spanning all 6 relation types', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(30);
    const relations = new Set(corpus.map((e) => e.expected_relation));
    for (const r of ['supports', 'contradicts', 'supersedes', 'evolved_into', 'depends_on', 'related_to'] as const) {
      expect(relations.has(r)).toBe(true);
    }
  });

  it('relation agreement ≥ 90% between provider pairs, confidence within ±0.1', async () => {
    const names = [...providers.keys()];
    if (names.length < 2) {
      throw new Error('cross-provider test requires at least 2 providers configured');
    }

    // Run every provider through the corpus.
    type Result = { relation: EdgeRelation | 'none'; confidence: number };
    const perProvider = new Map<string, Result[]>();
    for (const [name, provider] of providers) {
      const results: Result[] = [];
      for (const entry of corpus) {
        const out = await stage2OpusClassify(provider, {
          from: entry.from,
          to: entry.to,
        });
        results.push({ relation: out.relation, confidence: out.confidence });
      }
      perProvider.set(name, results);
    }

    // Pairwise compare every two providers.
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = perProvider.get(names[i])!;
        const b = perProvider.get(names[j])!;
        let relAgree = 0;
        let confDiffOver = 0;
        for (let k = 0; k < a.length; k++) {
          if (a[k].relation === b[k].relation) relAgree++;
          if (Math.abs(a[k].confidence - b[k].confidence) > 0.1) confDiffOver++;
        }
        const relAgreeRate = relAgree / a.length;
        // D.AC6 thresholds.
        expect(relAgreeRate, `${names[i]} vs ${names[j]} relation agreement`).toBeGreaterThanOrEqual(0.90);
        // Confidence: at least 90% of pairs within ±0.1
        expect(confDiffOver / a.length, `${names[i]} vs ${names[j]} confidence drift`).toBeLessThanOrEqual(0.10);
      }
    }
  }, 600_000);
});
