---
type: Module
title: src/providers/semaphore.ts
description: Skeleton concept for src/providers/semaphore.ts (extracted; 7 symbols).
resource: src/providers/semaphore.ts
tags:
  - src
  - module
  - class
  - method
enrichment: accuracy-audited
from:
  - BACKFILL-r2mcp-09
explains:
  - src/providers/semaphore.ts#Semaphore
  - src/providers/semaphore.ts#Semaphore.acquire
  - src/providers/semaphore.ts#Semaphore.constructor
  - src/providers/semaphore.ts#Semaphore.inFlight
  - src/providers/semaphore.ts#Semaphore.peak
  - src/providers/semaphore.ts#Semaphore.release
  - src/providers/semaphore.ts#Semaphore.withPermit
stale: false
stale_reason: ""
graph_hash: c192643d124600fd68491305707bec2b09c19febe0921e729af00e7c9e27905f
---

# Structure

## Exports
- `Semaphore` (class, lines 9-51)

## Symbols
| Symbol | Kind | Span | Exported |
|---|---|---|---|
| `Semaphore` | class | 9-51 | yes |
| `Semaphore.acquire` | method | 26-35 | yes |
| `Semaphore.constructor` | method | 14-16 | yes |
| `Semaphore.inFlight` | method | 18-20 | yes |
| `Semaphore.peak` | method | 22-24 | yes |
| `Semaphore.release` | method | 37-41 | yes |
| `Semaphore.withPermit` | method | 43-50 | yes |

## Calls out
- `Semaphore.withPermit` → `Semaphore.acquire` (same file)
- `Semaphore.withPermit` → `Semaphore.release` (same file)

# Explanation
A minimal, dependency-free counting semaphore that is provider-agnostic by design — despite living in `src/providers/`, it is not wired to any provider automatically, and it is not called anywhere else inside `src/providers/` itself. There is exactly one verified production call site today: `src/edges/classifier.ts#runClassifier`, which constructs its own `new Semaphore(concurrency)` sized from `ClassifierDeps.concurrencyLimit` (intended to be set to the active provider's `LLMProvider.concurrencyLimit` at the call site, per that file's own comment referencing `D.R6, D.AC8`) and wraps each candidate pair's Stage-1/Stage-2 classification work in `withPermit(...)` to bound concurrent LLM dispatch during an edge-classification run. Do not trust the graph manifest's call-edge data for consumption claims about this class: it links `Semaphore.release` to `src/db.ts` and `src/migrations.ts` via a bare-name collision with Node's pg `PoolClient.release()` method — an unrelated API that happens to share a method name. Neither file imports or references `Semaphore` at all; this was verified by reading both files directly, not by trusting the graph. (A prior version of this artifact repeated the false manifest-derived claim; it was corrected after an independent audit flagged it — treat manifest call edges as leads to verify, not facts, for exactly this reason.)

# Decisions
- (BACKFILL-r2mcp-09) Because the semaphore is caller-constructed rather than shared or injected, there is no single shared concurrency cap across the whole process by design — today that's moot since there's only one call site, but it's a real caveat worth carrying forward: if a second call site is added later that wraps calls to the *same* `LLMProvider` instance with its own independently-constructed `Semaphore(N)`, the two semaphores would not coordinate and combined concurrency to that provider could exceed `N`. A future reader adding a new LLM-calling subsystem that shares a provider instance with `runClassifier` should check whether the `Semaphore` needs to be shared/injected via `ClassifierDeps` (or an equivalent options bag) rather than re-constructed independently. The waiter queue is a plain array of bare resolver closures (no timeout, no cancellation) — a waiter that never gets its turn (e.g. if `release()` is never called due to a bug elsewhere) will hang forever with no diagnostic; `peak` is the only introspection available, and only via direct property access, not exposed through any logging. `withPermit`'s `finally`-based release is what guarantees a permit is returned even when the wrapped async function throws — removing that `finally` would leak permits under errors and eventually deadlock every caller waiting on that semaphore. Separately, `tests/entities/extractor.test.ts` contains an "R4 sentinel" test whose comment explicitly documents that the entity extractor deliberately does *not* use a `Semaphore` (it processes memories sequentially, pinning peak in-flight at 1); that file references `Semaphore` only in a comment as a tripwire description, not as an import or real usage, so it should not be read as a second consumer.

# Citations
[1] BACKFILL-r2mcp-09 evidence: /Users/dustincheng/projects/claudeclaw/docs/specs/asbuilt-living-kb/evidence/backfill09-evidence.yml
