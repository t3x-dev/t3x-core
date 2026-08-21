#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePackageReleaseEntries } from './lib/releasePr.mjs';
import { validateReleaseSurfaceOrThrow } from './lib/releaseSurface.mjs';
import { readChangesets } from './release-train/ensure-changesets.mjs';

function parseArgs(argv) {
  const options = {
    base: 'HEAD^',
    changedFiles: null,
    head: 'HEAD',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unexpected argument: ${arg}`);
  }

  return options;
}

function readChangedFiles(options) {
  if (options.changedFiles !== null) {
    return options.changedFiles
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean);
  }

  const output = execFileSync('git', ['diff', '--name-only', options.base, options.head], {
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

export function detectPublishPackages({
  changedFiles,
  changesets = [],
  isPackageVersionPublished = defaultIsPackageVersionPublished,
  readVersion = defaultReadVersion,
  releaseRecords = [],
  releaseSurface,
}) {
  const changedFileSet = new Set(changedFiles);
  const activeEntries = releaseSurface.packages.filter(
    (entry) => entry.npm_publish === true && entry.release_train === 'active'
  );
  const changedPackages = new Set(
    activeEntries
      .filter((entry) => changedFileSet.has(`${entry.path}/package.json`))
      .map((entry) => entry.name)
  );
  const changesetPackages = pendingChangesetPackageNames({ activeEntries, changesets });
  const firstPublishPackages = firstPublishPackageNames({
    activeEntries,
    isPackageVersionPublished,
    readVersion,
    releaseRecords,
  });
  const selectedPackages = new Set([
    ...changedPackages,
    ...changesetPackages,
    ...firstPublishPackages,
  ]);
  const packages = activeEntries
    .filter((entry) => selectedPackages.has(entry.name))
    .map((entry) => entry.name);

  return {
    hasPublishPackages: packages.length > 0,
    packageNames: packages,
    packageSlugs: packages.map((name) => name.replace(/^@t3x-dev\//, '')),
    publishesLocal: packages.includes('@t3x-dev/local'),
  };
}

function pendingChangesetPackageNames({ activeEntries, changesets }) {
  const activePackageNames = new Set(activeEntries.map((entry) => entry.name));
  const selected = new Set();

  for (const changeset of changesets) {
    for (const entry of changeset.entries ?? []) {
      if (activePackageNames.has(entry.packageName)) {
        selected.add(entry.packageName);
      }
    }
  }

  return selected;
}

function firstPublishPackageNames({
  activeEntries,
  isPackageVersionPublished,
  readVersion,
  releaseRecords,
}) {
  const entriesByName = new Map(activeEntries.map((entry) => [entry.name, entry]));
  const selected = new Set();

  for (const release of normalizeReleaseRecords(releaseRecords)) {
    for (const packageEntry of parsePackageReleaseEntries(release.body)) {
      if (!packageEntry.firstPublish) {
        continue;
      }
      const surfaceEntry = entriesByName.get(packageEntry.packageName);
      if (!surfaceEntry) {
        continue;
      }
      if (readVersion(surfaceEntry.path) !== packageEntry.version) {
        continue;
      }
      if (isPackageVersionPublished(packageEntry.packageName, packageEntry.version)) {
        continue;
      }
      selected.add(packageEntry.packageName);
    }
  }

  return selected;
}

function normalizeReleaseRecords(releaseRecords) {
  return releaseRecords
    .map((release) => ({
      body: release?.body ?? '',
      tagName: release?.tagName ?? release?.tag_name ?? '',
    }))
    .filter((release) => release.tagName.startsWith('t3x-v'));
}

function defaultReadVersion(packagePath) {
  const packageJson = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'));
  return packageJson.version;
}

function defaultIsPackageVersionPublished(packageName, packageVersion) {
  try {
    execFileSync('npm', ['view', `${packageName}@${packageVersion}`, 'version', '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    if (output.includes('E404') || output.includes('404 Not Found')) {
      return false;
    }
    throw error;
  }
}

function readProductReleaseRecords() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) {
    return [];
  }
  const repository =
    process.env.GITHUB_REPOSITORY ||
    execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_TOKEN: token,
      },
    }).trim();

  return JSON.parse(
    execFileSync('gh', ['api', `/repos/${repository}/releases?per_page=100`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_TOKEN: token,
      },
    })
  );
}

function outputLine(name, value) {
  return `${name}=${value}\n`;
}

function writeOutputs(result) {
  const lines = [
    outputLine('has_publish_packages', String(result.hasPublishPackages)),
    outputLine('package_names', result.packageNames.join(',')),
    outputLine('package_slugs', result.packageSlugs.join(',')),
    outputLine('publishes_local', String(result.publishesLocal)),
  ];

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, lines.join(''));
  }

  for (const line of lines) {
    process.stdout.write(line);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootUrl = new URL('..', import.meta.url);
  const rootDir = fileURLToPath(rootUrl);
  const releaseSurface = validateReleaseSurfaceOrThrow({ rootDir: rootUrl });
  const changedFiles = readChangedFiles(options);
  const result = detectPublishPackages({
    changedFiles,
    changesets: readChangesets({ rootDir }),
    releaseRecords: readProductReleaseRecords(),
    releaseSurface,
  });
  writeOutputs(result);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
