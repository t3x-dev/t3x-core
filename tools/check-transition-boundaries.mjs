#!/usr/bin/env node
import { validateTransitionBoundaries } from './lib/transitionBoundaries.mjs';

const result = validateTransitionBoundaries();

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log(`transition boundaries ok: ${result.filesChecked} source files checked`);
