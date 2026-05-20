import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      '@t3x-dev/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@t3x-dev/storage/backup': path.resolve(__dirname, '../storage/src/backup/index.ts'),
      '@t3x-dev/storage/embedded': path.resolve(__dirname, '../storage/src/embedded.ts'),
      '@t3x-dev/storage/postgres': path.resolve(__dirname, '../storage/src/postgres.ts'),
      '@t3x-dev/storage/seed/templates': path.resolve(
        __dirname,
        '../storage/src/seed/templates.ts'
      ),
      '@t3x-dev/storage/supabase': path.resolve(__dirname, '../storage/src/supabase.ts'),
      '@t3x-dev/storage': path.resolve(__dirname, '../storage/src/index.ts'),
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
    globalSetup: ['../storage/src/__tests__/globalSetup.ts'],
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
