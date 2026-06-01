import { defineConfig } from 'tsup';

const externalPackages = [/^(?![./]|@t3x-dev\/).+/];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  banner: {
    js: "import { createRequire as __t3xCreateRequire } from 'node:module'; const require = __t3xCreateRequire(import.meta.url);",
  },
  external: externalPackages,
  noExternal: [/^@t3x-dev\//],
});
