import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false, // CRITICAL: shared DB requires sequential file execution
    // claw-i6td.2: structural test-DB isolation — runs before every test module
    // and forces R2MCP_DATABASE_URL to a safe test DB so no test can reach prod.
    setupFiles: ['./tests/global-db-guard.ts'],
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
