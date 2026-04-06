import { defineConfig } from 'tsup';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: ['zod', 'js-yaml'],
  onSuccess: async () => {
    copyFileSync('yops.yaml', 'dist/yops.yaml');
  },
});
