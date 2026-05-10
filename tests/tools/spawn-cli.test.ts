/**
 * Unit test for resolveCliCommand — the dev/prod detection heuristic
 * for r2mcp's CLI subprocess spawn pattern.
 *
 * Both branches are exercised independently of the bundler by patching
 * import.meta.url against both .ts and .js source extensions, so a future
 * bundler switch surfaces here first.
 */
import { describe, it, expect } from 'vitest';
import { resolveCliCommandForUrl } from '../../src/tools/spawn-cli.js';

describe('resolveCliCommand', () => {
  it('returns tsx + .ts in dev mode (source-tree import.meta.url)', () => {
    const fakeUrl = 'file:///abs/r2mcp/src/tools/spawn-cli.ts';
    const result = resolveCliCommandForUrl('classify-edges', fakeUrl);
    expect(result.bin).toBe('tsx');
    expect(result.args).toHaveLength(1);
    expect(result.args[0]).toBe('/abs/r2mcp/scripts/classify-edges.ts');
  });

  it('returns node + .js in prod mode (dist-tree import.meta.url)', () => {
    const fakeUrl = 'file:///abs/install/node_modules/r2mcp/dist/tools/spawn-cli.js';
    const result = resolveCliCommandForUrl('classify-edges', fakeUrl);
    expect(result.bin).toBe('node');
    expect(result.args).toHaveLength(1);
    expect(result.args[0]).toBe('/abs/install/node_modules/r2mcp/dist/scripts/classify-edges.js');
  });

  it('handles compile-wiki the same way (helper is script-name-agnostic)', () => {
    const dev = resolveCliCommandForUrl('compile-wiki', 'file:///r/src/tools/spawn-cli.ts');
    const prod = resolveCliCommandForUrl('compile-wiki', 'file:///r/dist/tools/spawn-cli.js');
    expect(dev.bin).toBe('tsx');
    expect(dev.args[0]).toMatch(/\/scripts\/compile-wiki\.ts$/);
    expect(prod.bin).toBe('node');
    expect(prod.args[0]).toMatch(/\/dist\/scripts\/compile-wiki\.js$/);
  });
});
