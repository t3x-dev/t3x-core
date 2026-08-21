#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectArchitectureInventory,
  formatArchitectureInventory,
} from './lib/architectureInventory.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inventoryPath = join(repoRoot, 'docs/architecture/phase3-application-inventory.json');
const args = new Set(process.argv.slice(2));

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const inventory = collectArchitectureInventory({ rootDir: repoRoot });
const current = serialize(inventory);

if (args.has('--write')) {
  mkdirSync(dirname(inventoryPath), { recursive: true });
  writeFileSync(inventoryPath, current);
  console.log(`Wrote ${inventoryPath}`);
  console.log(formatArchitectureInventory(inventory));
  process.exit(0);
}

if (args.has('--verify')) {
  if (!existsSync(inventoryPath)) {
    console.error(
      `${inventoryPath} is missing. Run: pnpm run check:architecture-inventory -- --write`
    );
    process.exit(1);
  }

  const expected = readFileSync(inventoryPath, 'utf8');
  if (expected !== current) {
    console.error('Phase 3 architecture inventory is stale.');
    console.error('Run: pnpm run check:architecture-inventory -- --write');
    process.exit(1);
  }

  console.log('Phase 3 architecture inventory verified.');
  console.log(formatArchitectureInventory(inventory));
  process.exit(0);
}

console.log(formatArchitectureInventory(inventory));
