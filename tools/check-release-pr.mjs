#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readChangesetFiles, validateReleasePr } from './lib/releasePr.mjs';
import { validateReleaseSurfaceOrThrow } from './lib/releaseSurface.mjs';

function readChangedFiles() {
  if (process.env.T3X_PR_CHANGED_FILES) {
    return process.env.T3X_PR_CHANGED_FILES.split('\n')
      .map((file) => file.trim())
      .filter(Boolean);
  }

  if (process.env.T3X_PR_BASE_SHA && process.env.T3X_PR_HEAD_SHA) {
    return execFileSync(
      'git',
      ['diff', '--name-only', process.env.T3X_PR_BASE_SHA, process.env.T3X_PR_HEAD_SHA],
      {
        encoding: 'utf8',
      }
    )
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean);
  }

  return [];
}

const releaseSurface = validateReleaseSurfaceOrThrow({
  rootDir: new URL('..', import.meta.url),
});

function readCurrentPackageVersions() {
  const versions = new Map();
  for (const packageName of releaseSurface.releaseTrainPackages) {
    const entry = releaseSurface.packagesByName.get(packageName);
    if (!entry) {
      continue;
    }
    const packageJson = JSON.parse(readFileSync(join(entry.path, 'package.json'), 'utf8'));
    versions.set(packageName, packageJson.version);
  }
  return versions;
}

const result = validateReleasePr({
  baseBranch: process.env.T3X_PR_BASE ?? '',
  headBranch: process.env.T3X_PR_HEAD ?? '',
  body: process.env.T3X_PR_BODY ?? '',
  changesetFiles: readChangesetFiles(),
  changedFiles: readChangedFiles(),
  currentPackageVersions: readCurrentPackageVersions(),
  pausedReleaseSurfacePackages: releaseSurface.pausedReleaseTrainPackages,
  releaseSurfacePackages: releaseSurface.releaseTrainPackages,
});

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log('release PR policy ok');
