import { existsSync, readFileSync } from 'node:fs';

/**
 * Shared .env loader (claw-8cjf.1).
 *
 * MCP servers and launchd-spawned subprocesses don't inherit shell env, so
 * the server entrypoint and every CLI driver load .env themselves. This is
 * the single implementation — the previous five hand-rolled copies all used
 * /^([A-Z_]+)=/, which cannot match any R2MCP_* key (digit '2').
 *
 * Semantics: never clobbers vars already set in process.env, trims values,
 * strips one pair of matching surrounding quotes, ignores comments / blank
 * lines / empty values, and no-ops when the file is absent.
 */
export function loadEnvFile(envPath: string): void {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value === '') continue;
    process.env[match[1]] = value;
  }
}
