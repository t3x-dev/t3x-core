import { defineConfig } from 'tsup';

const externalPackages = [/^(?![./]|@t3x-dev\/).+/];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: externalPackages,
  noExternal: [/^@t3x-dev\//],
});
