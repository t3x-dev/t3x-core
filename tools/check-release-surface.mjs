#!/usr/bin/env node
import { validateReleaseSurface } from './lib/releaseSurface.mjs';

const result = validateReleaseSurface();

for (const warning of result.warnings) {
  console.warn(`warning: ${warning}`);
}

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log(`release surface ok: ${result.publicPackages.join(', ')}`);
