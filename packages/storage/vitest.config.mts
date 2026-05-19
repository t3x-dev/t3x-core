import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@t3x-dev/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./src/__tests__/globalSetup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
    },
    // DB tests need isolation for transaction safety
    isolate: true,
    // Longer timeout for database operations
    testTimeout: 10000,
    // Limit parallel workers
    minWorkers: 1,
    maxWorkers: 4,
  },
});
