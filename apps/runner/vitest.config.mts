import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
    // Limit parallel workers
    minWorkers: 1,
    maxWorkers: 4,
  },
});
