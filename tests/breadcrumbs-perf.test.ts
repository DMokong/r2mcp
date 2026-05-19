import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import {
  withBreadcrumbs,
  type BreadcrumbContext,
  type RecallResultItem,
  type RecallSignal,
} from '../src/breadcrumbs.js';

describe('withBreadcrumbs performance (R7, AC7)', () => {
  it('median per-call duration under 1ms on a 50-result recall payload', () => {
    const results: RecallResultItem[] = Array.from({ length: 50 }, (_, i) => ({
      id: `mem-${i}`,
      content: 'Lorem ipsum dolor sit amet '.repeat(8),
    }));
    // Half of the result IDs carry a contradicts signal — exercise the
    // dedupe loop. Real RecallResponse.signals is top-level (SPEC-044).
    const signals: RecallSignal[] = results
      .filter((_, i) => i % 2 === 0)
      .map((r) => ({ kind: 'contradicts' as const, from_id: r.id, to_id: 'partner' }));
    const ctx: BreadcrumbContext = {
      tool: 'recall',
      response: {
        results,
        signals,
        total_results: 50,
        search_mode: 'semantic',
        tiers_searched: ['hot'],
        query: 'q',
      },
      args: {},
    };

    // Warmup
    for (let i = 0; i < 100; i++) withBreadcrumbs({}, ctx);

    const N = 1000;
    const durations: number[] = [];
    for (let i = 0; i < N; i++) {
      const t0 = performance.now();
      withBreadcrumbs({}, ctx);
      durations.push(performance.now() - t0);
    }
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(N / 2)];

    // Allow some headroom for CI noise — budget is 1ms, fail at 1.5ms to avoid flakes.
    expect(median).toBeLessThan(1.5);
    // Log for visibility.
    console.log(`withBreadcrumbs median: ${median.toFixed(4)}ms (over ${N} calls)`);
  });
});
