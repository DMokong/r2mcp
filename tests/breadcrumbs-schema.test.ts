import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('breadcrumb schema advertisement (R3, AC6)', () => {
  const indexSrc = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf-8');

  const tools = ['remember', 'recall', 'search', 'stats', 'reject', 'meditate',
                 'compile', 'classify', 'extract_entities', 'dump_edges_sidecar', 'lint'];

  for (const tool of tools) {
    it(`tool "${tool}" description mentions next_tools`, () => {
      // Find the server.tool('<name>', '<description>', ...) call.
      const re = new RegExp(`server\\.tool\\(\\s*'${tool}',\\s*'([^']+)'`, 'm');
      const m = indexSrc.match(re);
      expect(m, `${tool} registration not found`).toBeTruthy();
      // Description must mention next_tools so MCP clients see it in tools/list.
      expect(m![1]).toMatch(/next_tools/i);
    });
  }
});
