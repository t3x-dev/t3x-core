import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@hono/zod-validator': path.resolve(
        __dirname,
        '../../node_modules/.pnpm/@hono+zod-validator@0.7.6_hono@4.11.1_zod@4.2.1/node_modules/@hono/zod-validator'
      ),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    globalSetup: ['../../packages/storage/src/__tests__/globalSetup.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Limit parallel workers
    minWorkers: 1,
    maxWorkers: 4,
  },
});
