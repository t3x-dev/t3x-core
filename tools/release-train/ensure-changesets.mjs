#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseSurfaceOrThrow } from '../lib/releaseSurface.mjs';

const rootUrl = new URL('../..', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;
const bumpRank = new Map([
  ['patch', 1],
  ['minor', 2],
  ['major', 3],
]);

export function normalizeVersionInput(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().replace(/[\u3002\uff0e\uff61]/g, '.');
  if (normalized.toLowerCase() === 'auto') {
    return 'auto';
  }
  return normalized.replace(/^v(?=\d)/i, '');
}

export function normalizePackageSelectionInput(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'auto';
  }
  return value.trim();
}

function parseArgs(argv) {
  const options = {
    apply: false,
    mode: 'auto',
    packageBump: 'patch',
    packages: 'auto',
    version: 'auto',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.apply = false;
      continue;
    }
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

  options.version = normalizeVersionInput(options.version);
  options.packages = normalizePackageSelectionInput(options.packages);

  if (!options.version || (options.version !== 'auto' && !semverPattern.test(options.version))) {
    throw new Error('--version must be "auto" or a semantic version like 1.1.0');
  }
  if (!['auto', 'code-only', 'package'].includes(options.mode)) {
    throw new Error('--mode must be auto, code-only, or package');
  }
  if (!['patch', 'minor', 'major'].includes(options.packageBump)) {
    throw new Error('--package-bump must be patch, minor, or major');
  }

  return options;
}

export function parseChangesetEntries(markdown) {
  const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)?.[1] ?? '';
  return frontmatter
    .split('\n')
    .map((line) =>
      line.match(/^\s*["']?(@[^"':\s]+\/[^"':\s]+|[^"':\s]+)["']?\s*:\s*(major|minor|patch)\s*$/)
    )
    .filter(Boolean)
    .map((match) => ({
      packageName: match[1],
      bump: match[2],
    }));
}

export function readChangesets({ rootDir = rootPath } = {}) {
  const changesetDir = join(rootDir, '.changeset');
  const ignoredPackageNames = new Set(readChangesetConfig({ rootDir }).ignore ?? []);
  const names = existsSync(changesetDir)
    ? readdirSync(changesetDir)
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => `.changeset/${name}`)
        .sort()
    : [];

  return names
    .map((name) => {
      const markdown = readFileSync(join(rootDir, name), 'utf8');
      const entries = parseChangesetEntries(markdown).filter(
        (entry) => !ignoredPackageNames.has(entry.packageName)
      );
      return {
        name,
        entries,
        packages: entries.map((entry) => entry.packageName),
        summary:
          markdown
            .split(/^---\s*$/m)
            .at(-1)
            ?.trim() ?? '',
      };
    })
    .filter((changeset) => changeset.entries.length > 0);
}

function readPackageVersion(packagePath, rootDir) {
  const manifest = JSON.parse(readFileSync(join(rootDir, packagePath, 'package.json'), 'utf8'));
  if (!manifest.version) {
    throw new Error(`${packagePath}/package.json does not declare a version`);
  }
  return manifest.version;
}

function bumpVersion(version, bump) {
  const match = version.match(semverPattern);
  if (!match) {
    throw new Error(`cannot estimate next package version from non-stable version: ${version}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') {
    return `${major + 1}.0.0`;
  }
  if (bump === 'minor') {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

function bumpForTargetVersion(currentVersion, targetVersion) {
  for (const bump of ['patch', 'minor', 'major']) {
    if (bumpVersion(currentVersion, bump) === targetVersion) {
      return bump;
    }
  }
  throw new Error(
    `target version ${targetVersion} cannot be produced from ${currentVersion} by one patch/minor/major changeset bump`
  );
}

function highestBump(entries) {
  let selected = null;
  for (const entry of entries) {
    if (!selected || bumpRank.get(entry.bump) > bumpRank.get(selected)) {
      selected = entry.bump;
    }
  }
  return selected;
}

export function readChangesetConfig({ rootDir = rootPath } = {}) {
  const configPath = join(rootDir, '.changeset/config.json');
  if (!existsSync(configPath)) {
    return {};
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

export function releaseTrainPackageNames({ releaseSurface }) {
  return [
    ...(releaseSurface.releaseTrainPackages ??
      releaseSurface.packages
        ?.filter((entry) => entry.npm_publish === true && entry.release_train !== 'paused')
        .map((entry) => entry.name) ??
      releaseSurface.npmPublishPackages ??
      []),
  ];
}

export function pausedReleaseTrainIgnoreDiagnostics({ releaseSurface, changesetConfig = {} } = {}) {
  const ignoredPackageNames = new Set(changesetConfig.ignore ?? []);
  return (releaseSurface?.pausedReleaseTrainPackages ?? [])
    .filter((packageName) => !ignoredPackageNames.has(packageName))
    .map(
      (packageName) =>
        `${packageName} is paused in the release train and must be listed in .changeset/config.json ignore`
    );
}

export function pausedReleaseTrainChangesetDiagnostics({ changesets = [], releaseSurface } = {}) {
  const pausedPackageNames = new Set(releaseSurface?.pausedReleaseTrainPackages ?? []);
  if (pausedPackageNames.size === 0) {
    return [];
  }

  const diagnostics = [];
  for (const changeset of changesets) {
    for (const entry of changeset.entries ?? []) {
      if (pausedPackageNames.has(entry.packageName)) {
        diagnostics.push(
          `${changeset.name} targets ${entry.packageName}, which is paused in the release train`
        );
      }
    }
  }
  return diagnostics;
}

export function assertNoPausedReleaseTrainChangesets({ changesets = [], releaseSurface } = {}) {
  const diagnostics = pausedReleaseTrainChangesetDiagnostics({ changesets, releaseSurface });
  if (diagnostics.length === 0) {
    return;
  }

  throw new Error(`changesets target paused release-train package(s):\n${diagnostics.join('\n')}`);
}

function packageSlug(packageName) {
  return packageName.replace(/^@t3x-dev\//, '').replace(/[^a-z0-9]+/g, '-');
}

function normalizedPackageName(token, releaseSurface) {
  const activePackageNames = releaseTrainPackageNames({ releaseSurface });
  const activeByName = new Map(activePackageNames.map((name) => [name, name]));
  const activeBySlug = new Map(activePackageNames.map((name) => [packageSlug(name), name]));
  const pausedPackageNames = new Set(releaseSurface.pausedReleaseTrainPackages ?? []);

  const trimmed = token.trim();
  const packageName = trimmed.startsWith('@t3x-dev/') ? trimmed : `@t3x-dev/${trimmed}`;
  const resolved = activeByName.get(packageName) ?? activeBySlug.get(trimmed);
  if (resolved) {
    return resolved;
  }

  if (pausedPackageNames.has(packageName) || pausedPackageNames.has(`@t3x-dev/${trimmed}`)) {
    throw new Error(`${packageName} is paused in the release train`);
  }

  throw new Error(`${packageName} is not an active release-train package`);
}

export function resolveSelectedPackageNames({
  changesets = [],
  mode,
  packageSelection = 'auto',
  releaseSurface,
} = {}) {
  const normalizedSelection = normalizePackageSelectionInput(packageSelection).toLowerCase();
  const activePackageNames = releaseTrainPackageNames({ releaseSurface });
  const activePackageSet = new Set(activePackageNames);

  if (mode === 'code-only' || normalizedSelection === 'none') {
    return [];
  }

  if (['all', 'all-active'].includes(normalizedSelection)) {
    return activePackageNames;
  }

  if (normalizedSelection === 'auto') {
    const selectedFromChangesets = [
      ...new Set(
        changesets
          .flatMap((changeset) => changeset.entries)
          .filter((entry) => activePackageSet.has(entry.packageName))
          .map((entry) => entry.packageName)
      ),
    ];
    if (selectedFromChangesets.length > 0) {
      return selectedFromChangesets;
    }
    return mode === 'package' ? activePackageNames : [];
  }

  return [
    ...new Set(
      packageSelection
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => normalizedPackageName(token, releaseSurface))
    ),
  ];
}

function generatedChangesetContent({ bump, packageName, targetVersion }) {
  return `---\n"${packageName}": ${bump}\n---\n\nPrepare ${packageName} for ${targetVersion}.\n`;
}

function existingBumpForPackage(changesets, packageName) {
  return highestBump(
    changesets.flatMap((changeset) =>
      changeset.entries.filter((entry) => entry.packageName === packageName)
    )
  );
}

function targetForPackage({ currentVersion, packageBump, requestedVersion }) {
  if (requestedVersion === 'auto') {
    return {
      bump: packageBump,
      targetVersion: bumpVersion(currentVersion, packageBump),
    };
  }

  const bump = bumpForTargetVersion(currentVersion, requestedVersion);
  return {
    bump,
    targetVersion: requestedVersion,
  };
}

export function planMissingChangesets({
  changesets,
  hasReleaseChanges = false,
  mode,
  packageBump = 'patch',
  packageSelection = 'auto',
  readVersion,
  releaseSurface,
  requestedVersion,
} = {}) {
  if (!['patch', 'minor', 'major'].includes(packageBump)) {
    throw new Error('packageBump must be patch, minor, or major');
  }

  const selectedPackageNames = resolveSelectedPackageNames({
    changesets,
    mode,
    packageSelection,
    releaseSurface,
  });
  const selectedPackageSet = new Set(selectedPackageNames);
  const activeChangesetExists = changesets.some((changeset) =>
    changeset.entries.some((entry) => selectedPackageSet.has(entry.packageName))
  );
  const shouldGenerate =
    mode === 'package' ||
    (mode === 'auto' &&
      selectedPackageNames.length > 0 &&
      (hasReleaseChanges || activeChangesetExists));

  if (!shouldGenerate || mode === 'code-only') {
    return {
      changesets,
      generatedChangesets: [],
      selectedPackageNames,
    };
  }

  const generatedChangesets = [];

  for (const packageName of selectedPackageNames) {
    const entry = releaseSurface.packagesByName.get(packageName);
    if (!entry) {
      throw new Error(`release surface is missing package metadata for ${packageName}`);
    }

    const currentVersion = readVersion(entry.path);
    const desired = targetForPackage({
      currentVersion,
      packageBump,
      requestedVersion,
    });
    const existingBump = existingBumpForPackage(changesets, packageName);

    if (existingBump && bumpRank.get(existingBump) > bumpRank.get(desired.bump)) {
      throw new Error(
        `${packageName} already has a ${existingBump} changeset, which exceeds requested ${desired.bump} target ${desired.targetVersion}`
      );
    }
    if (existingBump && bumpRank.get(existingBump) >= bumpRank.get(desired.bump)) {
      continue;
    }

    const name = `.changeset/release-train-${packageSlug(packageName)}-${desired.targetVersion.replace(
      /\./g,
      '-'
    )}.md`;
    const content = generatedChangesetContent({
      bump: desired.bump,
      packageName,
      targetVersion: desired.targetVersion,
    });
    generatedChangesets.push({
      content,
      entries: [{ packageName, bump: desired.bump }],
      generated: true,
      name,
      packages: [packageName],
      summary: content
        .split(/^---\s*$/m)
        .at(-1)
        ?.trim(),
    });
  }

  return {
    changesets: [...changesets, ...generatedChangesets],
    generatedChangesets,
    selectedPackageNames,
  };
}

export function writeGeneratedChangesets({ generatedChangesets, rootDir = rootPath }) {
  if (generatedChangesets.length === 0) {
    return [];
  }
  const changesetDir = join(rootDir, '.changeset');
  if (!existsSync(changesetDir)) {
    mkdirSync(changesetDir, { recursive: true });
  }
  const paths = [];
  for (const changeset of generatedChangesets) {
    const filePath = join(rootDir, changeset.name);
    writeFileSync(filePath, changeset.content);
    paths.push(changeset.name);
  }
  return paths;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const releaseSurface = validateReleaseSurfaceOrThrow({ rootDir: rootUrl });
  const changesets = readChangesets();
  const plan = planMissingChangesets({
    changesets,
    mode: options.mode,
    packageBump: options.packageBump,
    packageSelection: options.packages,
    readVersion: (packagePath) => readPackageVersion(packagePath, rootPath),
    releaseSurface,
    requestedVersion: options.version,
  });

  if (plan.generatedChangesets.length === 0) {
    console.log('No release train changesets need to be generated.');
    return;
  }

  console.log(`Release train will generate ${plan.generatedChangesets.length} changeset(s).`);
  for (const changeset of plan.generatedChangesets) {
    console.log(
      `- ${changeset.name}: ${changeset.entries[0].packageName} ${changeset.entries[0].bump}`
    );
  }

  if (options.apply) {
    writeGeneratedChangesets({ generatedChangesets: plan.generatedChangesets });
  } else {
    console.log('Dry run only; no files were written.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
