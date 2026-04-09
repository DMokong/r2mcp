import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false, // CRITICAL: shared DB requires sequential file execution
    coverage: {
      provider: 'v8',
      exclude: [
        'src/index.ts',          // MCP server entry point — integration-only
        'src/graph-rebuild.ts',  // optional script, existsSync guard only
        'src/embeddings.ts',     // requires live OpenRouter API
        'src/instrumentation.ts', // OTel setup — requires running collector
        'src/telemetry.ts',      // OTel metrics — requires running collector
        'dist/**',
        'tests/**',
        'vitest.config.ts',
        'scripts/migrate.ts',    // CLI script
        'scripts/setup.ts',      // CLI script — same rationale as migrate.ts
      ],
    },
  },
});
