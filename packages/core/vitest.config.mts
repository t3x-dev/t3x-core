import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Each test file gets its own isolated environment
    isolate: true,
    // Longer timeout for async operations
    testTimeout: 10000,
  },
  bench: {
    globals: true,
    include: ['src/**/*.bench.ts'],
  },
});
