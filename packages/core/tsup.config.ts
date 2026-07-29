import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  // Consumers bundle core's CJS output into different package boundaries.
  // Keep this adapter implementation detail self-contained at runtime.
  noExternal: ['yaml'],
});
