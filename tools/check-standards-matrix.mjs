#!/usr/bin/env node
import { validateStandardsMatrix } from './lib/standardsMatrix.mjs';

const result = validateStandardsMatrix();

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log(`standards matrix ok: ${result.rows.map((row) => row.id).join(', ')}`);
