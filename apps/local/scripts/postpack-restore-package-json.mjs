#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileExists, getLocalPackageDir } from './runtime-helpers.mjs';

const packageDir = getLocalPackageDir();
const packageJsonPath = path.join(packageDir, 'package.json');
const backupPath = path.join(packageDir, '.pack-package.json.backup');

if (!(await fileExists(backupPath))) {
  console.log('[postpack] No package.json backup found. Nothing to restore.');
  process.exit(0);
}

await fs.copyFile(backupPath, packageJsonPath);
await fs.rm(backupPath, { force: true });
console.log('[postpack] Restored apps/local/package.json');
