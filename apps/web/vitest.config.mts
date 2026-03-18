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
    // Tests are stateless — no need for per-file process isolation
    isolate: false,
    // Longer timeout for database operations
    testTimeout: 10000,
    // Setup file for test utilities
    setupFiles: ['./src/__tests__/setup.ts'],
    // Limit parallel workers
    minWorkers: 1,
    maxWorkers: 4,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
