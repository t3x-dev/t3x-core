import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
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
    setupFiles: ['src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
