#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const packageDir = process.cwd();
const packageJsonPath = path.join(packageDir, 'package.json');
const backupPath = path.join(packageDir, '.pack-package.json.backup');

try {
  await fs.access(backupPath);
} catch {
  console.log('[postpack] No package.json backup found. Nothing to restore.');
  process.exit(0);
}

await fs.copyFile(backupPath, packageJsonPath);
await fs.rm(backupPath, { force: true });
console.log(`[postpack] Restored ${packageJsonPath}`);
