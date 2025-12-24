/**
 * Shared Vitest configuration for T3X packages
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules',
        'dist',
        '**/*.d.ts',
        '**/__tests__/setup.ts',
      ],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
