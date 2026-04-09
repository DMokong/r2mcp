import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const GRAPH_SCRIPT = 'scripts/build-memory-graph.js';

/**
 * Optionally trigger a graph rebuild script if it exists in the project root.
 * This is a no-op for most r2mcp installations — the script is a ClaudeClaw
 * extension. r2mcp bundles the Memory Explorer separately.
 */
export function triggerGraphRebuild(projectRoot: string): void {
  const scriptPath = resolve(projectRoot, GRAPH_SCRIPT);
  if (!existsSync(scriptPath)) {
    return; // No graph script — skip silently
  }
  execFile('node', [scriptPath], { cwd: projectRoot, timeout: 30000 }, (err) => {
    if (err) {
      console.error(`Graph rebuild failed (non-blocking): ${err.message}`);
    }
  });
}
