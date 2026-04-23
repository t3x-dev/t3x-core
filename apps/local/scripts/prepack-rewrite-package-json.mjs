#!/usr/bin/env node

import path from 'node:path';
import { getLocalPackageDir, readJson, writeJson } from './runtime-helpers.mjs';

const packageDir = getLocalPackageDir();
const repoRoot = path.resolve(packageDir, '../..');
const backupPath = path.join(packageDir, '.pack-package.json.backup');
const packageJsonPath = path.join(packageDir, 'package.json');

const packageJson = await readJson(packageJsonPath);
const resolvedVersions = {
  '@t3x-dev/api': (await readJson(path.join(repoRoot, 'packages', 'api', 'package.json'))).version,
  '@t3x-dev/cli': (await readJson(path.join(repoRoot, 'apps', 'cli', 'package.json'))).version,
  '@t3x-dev/mcp': (await readJson(path.join(repoRoot, 'apps', 'mcp', 'package.json'))).version,
  '@t3x-dev/storage': (await readJson(path.join(repoRoot, 'packages', 'storage', 'package.json')))
    .version,
};

await writeJson(backupPath, packageJson);

const rewrittenPackageJson = {
  ...packageJson,
  dependencies: {
    ...packageJson.dependencies,
    ...resolvedVersions,
  },
};

await writeJson(packageJsonPath, rewrittenPackageJson);
console.log('[prepack] Rewrote workspace dependencies in apps/local/package.json');
