#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { FIXED_VERSION_PACKAGES, verifyVersionsOrThrow } from './verify-versions.mjs';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

const packageDir = process.cwd();
const repoRoot = await findRepoRoot(packageDir);
const packageJsonPath = path.join(packageDir, 'package.json');
const backupPath = path.join(packageDir, '.pack-package.json.backup');

const packageJson = await readJson(packageJsonPath);
const versionMap = await buildWorkspaceVersionMap(repoRoot);

if (FIXED_VERSION_PACKAGES.includes(packageJson.name)) {
  await verifyVersionsOrThrow({ repoRoot, verifyManifest: packageJson.name === '@t3x-dev/local' });
}

let changed = false;
const rewrittenPackageJson = { ...packageJson };

for (const field of DEPENDENCY_FIELDS) {
  const dependencies = packageJson[field];
  if (!dependencies || typeof dependencies !== 'object') {
    continue;
  }

  const rewrittenField = { ...dependencies };

  for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
    if (typeof dependencyVersion !== 'string' || !dependencyVersion.startsWith('workspace:')) {
      continue;
    }

    const resolvedVersion = versionMap.get(dependencyName);
    if (!resolvedVersion) {
      throw new Error(
        `Could not resolve workspace dependency ${dependencyName} from ${packageJsonPath}`
      );
    }

    rewrittenField[dependencyName] = resolvePublishedVersion(dependencyVersion, resolvedVersion);
    changed = true;
  }

  rewrittenPackageJson[field] = rewrittenField;
}

if (!changed) {
  console.log(`[prepack] No workspace dependencies found in ${packageJson.name ?? packageDir}`);
  process.exit(0);
}

await fs.copyFile(packageJsonPath, backupPath);
await writeJson(packageJsonPath, rewrittenPackageJson);
console.log(`[prepack] Rewrote workspace dependencies in ${packageJson.name ?? packageDir}`);

async function buildWorkspaceVersionMap(rootDir) {
  const versionMap = new Map();

  for (const workspaceDirName of ['apps', 'packages']) {
    const workspaceDir = path.join(rootDir, workspaceDirName);
    let entries = [];

    try {
      entries = await fs.readdir(workspaceDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const childPackageJsonPath = path.join(workspaceDir, entry.name, 'package.json');

      try {
        const childPackageJson = await readJson(childPackageJsonPath);
        if (
          typeof childPackageJson.name === 'string' &&
          typeof childPackageJson.version === 'string'
        ) {
          versionMap.set(childPackageJson.name, childPackageJson.version);
        }
      } catch {}
    }
  }

  return versionMap;
}

async function findRepoRoot(startDir) {
  let current = startDir;

  while (current !== path.dirname(current)) {
    try {
      await fs.access(path.join(current, 'pnpm-workspace.yaml'));
      return current;
    } catch {
      current = path.dirname(current);
    }
  }

  throw new Error(`Could not locate pnpm-workspace.yaml above ${startDir}`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolvePublishedVersion(workspaceRange, resolvedVersion) {
  const spec = workspaceRange.slice('workspace:'.length);

  if (spec === '' || spec === '*') {
    return resolvedVersion;
  }

  if (spec === '^' || spec === '~') {
    return `${spec}${resolvedVersion}`;
  }

  if (spec.startsWith('./') || spec.startsWith('../')) {
    return spec;
  }

  return spec;
}
