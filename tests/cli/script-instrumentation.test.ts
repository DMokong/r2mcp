// claw-1ejd — coarse but deterministic assertion that all three subprocess
// scripts load the OTel instrumentation module BEFORE any other code. Without
// this import the OTEL_TRACEPARENT propagation set by the MCP wrapper is a
// no-op (propagation.extract has no SDK to register a parent context with).
//
// We assert via file content rather than module behavior because asserting
// "trace.getTracerProvider() is non-no-op" requires actually booting the
// OTel SDK with a real endpoint, which is brittle in CI. File-content
// assertion gives us a deterministic regression guard with zero side
// effects.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCRIPTS = [
  'src/cli/extract-entities.ts',
  'src/cli/compile-wiki.ts',
  'src/cli/classify-edges.ts',
] as const;

describe('claw-1ejd subprocess OTel SDK init', () => {
  for (const rel of SCRIPTS) {
    it(`${rel} imports ../instrumentation.js before any other module`, () => {
      const path = resolve(__dirname, '../..', rel);
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n');

      // Find the first non-shebang, non-blank, non-comment line. It must be
      // the instrumentation import (or, equivalently, a `/* */` block comment
      // hosting the import — but our convention is line comments + the bare
      // import). The reason this matters: OTel auto-instrumentation patches
      // modules at require-time; any traced module imported BEFORE
      // instrumentation.js will not be patched.
      let firstImportLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;
        if (line.startsWith('#!')) continue; // shebang
        if (line.startsWith('//')) continue; // line comment
        if (line.startsWith('/*') || line.startsWith('*') || line.startsWith('*/')) continue; // block comment fragments
        firstImportLineIndex = i;
        break;
      }

      expect(firstImportLineIndex).toBeGreaterThanOrEqual(0);
      const firstCodeLine = lines[firstImportLineIndex];
      expect(firstCodeLine).toMatch(/^import\s+['"]\.\.\/instrumentation\.js['"];?\s*$/);
    });
  }
});
