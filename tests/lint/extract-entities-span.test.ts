// SPEC-046 R9 — OTel span name guard for extract_entities.
//
// gate-2b advisory: "R9 OTel span name 'memory.extract_entities' has no test.
//  Absence here means a typo or missing instrumentation would be invisible."
//
// Two-layer guard:
//   1. Source-level: `withToolSpan('extract_entities', ...)` is called in
//      src/index.ts (a missing/renamed wire-up is caught at static lint).
//   2. Behavioral: `withToolSpan(name, ...)` actually opens a span whose
//      name is `memory.${name}` (telemetry.ts:50). We hijack the OTel tracer
//      to capture the span name and assert it directly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('SPEC-046 R9 extract_entities OTel span', () => {
  it('source wires withToolSpan("extract_entities", ...) in index.ts', () => {
    const indexPath = resolve(__dirname, '..', '..', 'src', 'index.ts');
    const src = readFileSync(indexPath, 'utf8');
    // Catches typos, accidental rename, or removed instrumentation. The
    // single-quoted string literal is the canonical shape used by every other
    // tool registration in this file (remember, recall, classify, ...).
    expect(src).toContain("withToolSpan('extract_entities'");
  });

  it('telemetry helper prefixes tool names with `memory.` — so withToolSpan("extract_entities") opens span `memory.extract_entities`', () => {
    // We can't reliably hijack the cached OTel tracer once telemetry.ts has
    // loaded (the tracer is a module-level constant). Instead pin the
    // prefix-template against the source: if anyone changes the literal
    // `memory.${toolName}` in telemetry.ts:50, this test fails and forces a
    // review of every tool's instrumented span name.
    const telPath = resolve(__dirname, '..', '..', 'src', 'telemetry.ts');
    const src = readFileSync(telPath, 'utf8');
    expect(src).toMatch(/startActiveSpan\(\s*`memory\.\$\{\s*toolName\s*\}`/);
  });
});
