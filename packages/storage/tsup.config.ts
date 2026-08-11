import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    postgres: 'src/postgres.ts',
    embedded: 'src/embedded.ts',
    supabase: 'src/supabase.ts',
    'backup/index': 'src/backup/index.ts',
    'seed/templates': 'src/seed/templates.ts',
  },
  format: ['cjs'],
  // Type declarations are emitted by tsc so re-exported query modules are
  // preserved as a declaration tree for downstream packages.
  dts: false,
  clean: true,
  // Mark all dependencies as external (this is a library, not a bundle)
  external: [/^[^./]/],
  splitting: false,
});
