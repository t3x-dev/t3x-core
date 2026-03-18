import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/__tests__/golden/**', 'src/__tests__/benchmarks/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**', 'src/**/*.bench.ts'],
    },
    // Tests are stateless — no need for per-file process isolation
    isolate: false,
    // Longer timeout for async operations
    testTimeout: 10000,
    // Limit parallel workers to prevent memory exhaustion
    minWorkers: 1,
    maxWorkers: 4,
  },
  bench: {
    globals: true,
    include: ['src/**/*.bench.ts'],
  },
});
