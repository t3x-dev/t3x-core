#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateReleaseSurfaceOrThrow } from './lib/releaseSurface.mjs';
import {
  assertNoPausedReleaseTrainChangesets,
  readChangesets,
} from './release-train/ensure-changesets.mjs';

const rootUrl = new URL('..', import.meta.url);
const rootPath = fileURLToPath(rootUrl);

export function normalizeSelectedPackages(value) {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || /^(none|no|false)$/i.test(trimmed)) {
    return [];
  }

  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('@t3x-dev/') ? entry : `@t3x-dev/${entry}`));
}

export function selectedPublicPackageVersionDiagnostics({
  changedFiles = [],
  releaseSurface,
  selectedPackages,
} = {}) {
  if (selectedPackages === null) {
    return [];
  }

  const selected = new Set(selectedPackages);
  const changedFileSet = new Set(changedFiles);
  return releaseSurface.packages
    .filter((entry) => entry.npm_publish === true && !selected.has(entry.name))
    .map((entry) => ({
      ...entry,
      packageJsonPath: `${entry.path}/package.json`,
    }))
    .filter((entry) => changedFileSet.has(entry.packageJsonPath))
    .map(
      (entry) => `${entry.name} (${entry.packageJsonPath}) changed outside T3X_PACKAGE_RELEASES`
    );
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootPath,
    env: process.env,
    stdio: 'inherit',
  });
}

function changedFiles() {
  const output = execFileSync('git', ['diff', '--name-only', '--', 'apps', 'packages'], {
    cwd: rootPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  return output ? output.split('\n') : [];
}

function assertSelectedPublicPackageVersions({ releaseSurface, selectedPackages }) {
  const diagnostics = selectedPublicPackageVersionDiagnostics({
    changedFiles: changedFiles(),
    releaseSurface,
    selectedPackages,
  });
  if (diagnostics.length === 0) {
    return;
  }

  throw new Error(
    `Changesets changed unselected public package manifest(s): ${diagnostics.join(
      ', '
    )}. Add the package to Package Releases or adjust workspace dependency ranges before creating the version PR.`
  );
}

function main() {
  const releaseSurface = validateReleaseSurfaceOrThrow({ rootDir: rootUrl });
  const selectedPackages = normalizeSelectedPackages(process.env.T3X_PACKAGE_RELEASES);

  assertNoPausedReleaseTrainChangesets({
    changesets: readChangesets({ rootDir: rootPath }),
    releaseSurface,
  });

  run('changeset', ['version']);
  assertSelectedPublicPackageVersions({
    releaseSurface,
    selectedPackages,
  });

  run('node', [
    'tools/sync-product-display-versions.mjs',
    '--version',
    'auto',
    '--workspace-source-scope',
    'changed',
  ]);
  run('pnpm', ['install', '--lockfile-only']);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
