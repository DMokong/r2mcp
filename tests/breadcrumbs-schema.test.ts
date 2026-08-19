import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// SPEC-059 note: the eleven `server.tool(...)` registrations moved out of
// src/index.ts into one module per tool under src/register/, so each entry
// point (stdio + the remote profile) can compose the subset it needs. The
// invariant guarded here is unchanged — every tool's DEFAULT description must
// still advertise next_tools — only the file the assertion reads has moved.
// Each register module holds its stdio text in a `DESCRIPTION` constant and
// passes `ctx.description ?? DESCRIPTION` to server.tool(), so we pin both:
// the constant's text, and that the constant really is the registered default.

describe('breadcrumb schema advertisement (R3, AC6)', () => {
  const tools = ['remember', 'recall', 'search', 'stats', 'reject', 'meditate',
                 'compile', 'classify', 'extract_entities', 'dump_edges_sidecar', 'lint'];

  for (const tool of tools) {
    it(`tool "${tool}" description mentions next_tools`, () => {
      // Tool name -> module name: underscores become hyphens (extract_entities
      // -> extract-entities.ts).
      const moduleName = tool.replace(/_/g, '-');
      const src = readFileSync(
        new URL(`../src/register/${moduleName}.ts`, import.meta.url),
        'utf-8',
      );

      // The registration must use the DESCRIPTION constant as its default, so
      // the text we assert on below is genuinely what stdio advertises.
      const wiring = new RegExp(
        `server\\.tool\\(\\s*'${tool}',\\s*ctx\\.description \\?\\? DESCRIPTION`,
        'm',
      );
      expect(src, `${tool} registration not found`).toMatch(wiring);

      // Find the default description literal.
      const m = src.match(/const DESCRIPTION =\s*'([^']+)'/m);
      expect(m, `${tool} DESCRIPTION constant not found`).toBeTruthy();
      // Description must mention next_tools so MCP clients see it in tools/list.
      expect(m![1]).toMatch(/next_tools/i);
    });
  }
});
