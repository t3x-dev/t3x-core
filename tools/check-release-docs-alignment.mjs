#!/usr/bin/env node
import { validateReleaseDocsAlignment } from './lib/releaseDocsAlignment.mjs';

const result = await validateReleaseDocsAlignment();

for (const warning of result.releaseSurfaceWarnings) {
  console.warn(`warning: ${warning}`);
}

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log(`release docs alignment ok: v${result.expectedVersion}`);
