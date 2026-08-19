// SPEC-059 (R10/AC6) — single source of truth for the advertised server version.
//
// src/index.ts previously hard-coded `version: '0.2.0'` in the McpServer
// constructor, which had drifted from package.json. Reading package.json here
// means every entry point (stdio + remote) advertises the real version and
// cannot drift again.
//
// Path note: tsc emits with rootDir=src / outDir=dist, so the register/ folder
// sits one level below the output root in both trees —
//   dist/register/version.js -> ../../ = repo root
//   src/register/version.ts  -> ../../ = repo root  (tsx / vitest)
// so the same relative hop is correct in both.

import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export const SERVER_VERSION: string = pkg.version;
