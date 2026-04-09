import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false, // CRITICAL: shared DB requires sequential file execution
    coverage: {
      provider: 'v8',
      exclude: [
        'src/index.ts',
        'src/graph-rebuild.ts',
        'src/embeddings.ts',
        'dist/**',
        'tests/**',
        'vitest.config.ts',
        'scripts/migrate.ts',
      ],
    },
  },
});
