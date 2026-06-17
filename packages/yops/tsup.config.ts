import { copyFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  noExternal: ['zod', 'js-yaml', 'yaml'],
  onSuccess: async () => {
    copyFileSync('yops.yaml', 'dist/yops.yaml');
  },
});
