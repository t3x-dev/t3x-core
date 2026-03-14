import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
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
