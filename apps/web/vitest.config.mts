import { dirname, resolve } from 'path';
import swc from 'unplugin-swc';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/__tests__/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
    // Per-file isolation prevents cross-test pollution of
    // localStorage / zustand-persist state seen before
    // this switch. Cost: small worker-startup overhead;
    // benefit: CI stability.
    isolate: true,
    // The full UI suite runs four isolated workers in CI. Complex interaction
    // tests can exceed 10 seconds under shared-runner contention even though
    // their assertions complete normally when run alone.
    testTimeout: 30000,
    // Setup file for test utilities
    setupFiles: ['./src/__tests__/setup.ts'],
    // Limit parallel workers
    minWorkers: 1,
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@t3x-dev/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@t3x-dev/yops': resolve(__dirname, '../../packages/yops/src/index.ts'),
    },
  },
});
