/**
 * SPEC-045: shared subprocess command resolver for r2mcp's CLI tools.
 *
 * Returns {bin, args} for spawning a script under both:
 *   - dev mode: this file is .ts (via tsx) → spawn tsx <project>/scripts/<name>.ts
 *   - prod mode: this file is .js (compiled to dist/) → spawn node <project>/dist/scripts/<name>.js
 *
 * Detection uses the file extension at import.meta.url. This is automatic,
 * zero-config, and authoritative for tsx + tsc workflows. If r2mcp ever
 * adopts esbuild single-file bundling (.ts and .js both look like .js),
 * promote a different mitigation here (NODE_ENV check, or dist/ substring).
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export type CliScriptName = 'classify-edges' | 'compile-wiki' | 'dump-edges-json';

export interface ResolvedCli {
  bin: string;
  args: string[];
}

/**
 * Convenience wrapper that uses the caller's import.meta.url. Most callers
 * use this; resolveCliCommandForUrl is the testable seam.
 */
export function resolveCliCommand(scriptName: CliScriptName): ResolvedCli {
  return resolveCliCommandForUrl(scriptName, import.meta.url);
}

/**
 * Pure function — testable in isolation by passing a fake import.meta.url.
 */
export function resolveCliCommandForUrl(scriptName: CliScriptName, importMetaUrl: string): ResolvedCli {
  const thisFile = fileURLToPath(importMetaUrl);
  const isDev = thisFile.endsWith('.ts');
  const dir = dirname(thisFile);

  if (isDev) {
    // dev: <root>/src/tools/spawn-cli.ts → <root>/scripts/<name>.ts
    return {
      bin: 'tsx',
      args: [resolve(dir, '..', '..', 'scripts', `${scriptName}.ts`)],
    };
  }
  // prod: <root>/dist/tools/spawn-cli.js → <root>/dist/scripts/<name>.js
  return {
    bin: 'node',
    args: [resolve(dir, '..', 'scripts', `${scriptName}.js`)],
  };
}
