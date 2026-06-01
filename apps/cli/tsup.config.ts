import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as {
  version?: string;
};

const externalPackages = [/^(?![./]|@t3x-dev\/).+/];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  banner: {
    js: "import { createRequire as __t3xCreateRequire } from 'node:module'; const require = __t3xCreateRequire(import.meta.url);",
  },
  define: {
    __T3X_CLI_VERSION__: JSON.stringify(packageJson.version ?? '0.0.0'),
  },
  external: externalPackages,
  noExternal: [/^@t3x-dev\//],
});
