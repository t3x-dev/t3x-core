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

function parseArgs(argv) {
  const options = {
    apply: false,
    mode: 'auto',
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

  if (!options.version || (options.version !== 'auto' && !semverPattern.test(options.version))) {
    throw new Error('--version must be "auto" or a semantic version like 1.1.0');
  }
  if (!['auto', 'code-only', 'package'].includes(options.mode)) {
    throw new Error('--mode must be auto, code-only, or package');
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
  const names = existsSync(changesetDir)
    ? readdirSync(changesetDir)
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => `.changeset/${name}`)
        .sort()
    : [];

  return names.map((name) => {
    const markdown = readFileSync(join(rootDir, name), 'utf8');
    const entries = parseChangesetEntries(markdown);
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
  });
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

function currentFixedVersion({ releaseSurface, readVersion }) {
  const versions = releaseSurface.npmPublishPackages.map((name) => {
    const entry = releaseSurface.packagesByName.get(name);
    if (!entry) {
      throw new Error(`release surface is missing package metadata for ${name}`);
    }
    return readVersion(entry.path);
  });
  const uniqueVersions = [...new Set(versions)];
  if (uniqueVersions.length !== 1) {
    throw new Error(`npm publish package versions are not fixed together: ${versions.join(', ')}`);
  }
  return uniqueVersions[0];
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

export function releaseTrainPackageNames({ changesetConfig, releaseSurface }) {
  const npmPublishPackageSet = new Set(releaseSurface.npmPublishPackages);
  const trainPackageSet = new Set(releaseSurface.npmPublishPackages);

  for (const fixedGroup of changesetConfig?.fixed ?? []) {
    if (!Array.isArray(fixedGroup)) {
      continue;
    }
    if (fixedGroup.some((packageName) => npmPublishPackageSet.has(packageName))) {
      for (const packageName of fixedGroup) {
        trainPackageSet.add(packageName);
      }
    }
  }

  return [...trainPackageSet];
}

function desiredReleaseBump({
  changesets,
  hasReleaseChanges,
  mode,
  releaseTrainPackages,
  releaseSurface,
  requestedVersion,
  readVersion,
}) {
  const releaseTrainPackageSet = new Set(releaseTrainPackages);
  const trainEntries = changesets
    .flatMap((changeset) => changeset.entries)
    .filter((entry) => releaseTrainPackageSet.has(entry.packageName));

  if (requestedVersion !== 'auto') {
    return bumpForTargetVersion(
      currentFixedVersion({ readVersion, releaseSurface }),
      requestedVersion
    );
  }

  if (trainEntries.length > 0) {
    return highestBump(trainEntries);
  }

  if (mode === 'package' || hasReleaseChanges) {
    return 'patch';
  }

  return null;
}

function packageSlug(packageName) {
  return packageName.replace(/^@t3x-dev\//, '').replace(/[^a-z0-9]+/g, '-');
}

function generatedChangesetContent({ bump, packageName, targetVersion }) {
  return `---\n"${packageName}": ${bump}\n---\n\nPrepare ${packageName} for the ${targetVersion} release train.\n`;
}

function existingBumpForPackage(changesets, packageName) {
  return highestBump(
    changesets.flatMap((changeset) =>
      changeset.entries.filter((entry) => entry.packageName === packageName)
    )
  );
}

export function planMissingChangesets({
  changesetConfig = readChangesetConfig(),
  changesets,
  hasReleaseChanges = false,
  mode,
  readVersion,
  releaseSurface,
  requestedVersion,
} = {}) {
  const releaseTrainPackages = releaseTrainPackageNames({ changesetConfig, releaseSurface });
  const shouldGenerate =
    mode === 'package' ||
    (mode === 'auto' &&
      (hasReleaseChanges ||
        changesets.some((changeset) =>
          changeset.entries.some((entry) => releaseTrainPackages.includes(entry.packageName))
        )));

  if (!shouldGenerate || mode === 'code-only') {
    return {
      changesets,
      generatedChangesets: [],
    };
  }

  const currentVersion = currentFixedVersion({ readVersion, releaseSurface });
  const bump = desiredReleaseBump({
    changesets,
    hasReleaseChanges,
    mode,
    readVersion,
    releaseTrainPackages,
    releaseSurface,
    requestedVersion,
  });
  const targetVersion =
    requestedVersion === 'auto' ? bumpVersion(currentVersion, bump) : requestedVersion;
  const generatedChangesets = [];

  for (const packageName of releaseSurface.npmPublishPackages) {
    const existingBump = existingBumpForPackage(changesets, packageName);
    if (existingBump && bumpRank.get(existingBump) > bumpRank.get(bump)) {
      throw new Error(
        `${packageName} already has a ${existingBump} changeset, which exceeds requested ${bump} target ${targetVersion}`
      );
    }
    if (existingBump && bumpRank.get(existingBump) >= bumpRank.get(bump)) {
      continue;
    }

    const name = `.changeset/release-train-${packageSlug(packageName)}-${targetVersion.replace(
      /\./g,
      '-'
    )}.md`;
    const content = generatedChangesetContent({ bump, packageName, targetVersion });
    generatedChangesets.push({
      content,
      entries: [{ packageName, bump }],
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
    targetVersion,
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
    readVersion: (packagePath) => readPackageVersion(packagePath, rootPath),
    releaseSurface,
    requestedVersion: options.version,
  });

  if (plan.generatedChangesets.length === 0) {
    console.log('No release train changesets need to be generated.');
    return;
  }

  console.log(
    `Release train will generate ${plan.generatedChangesets.length} changeset(s) for ${plan.targetVersion}.`
  );
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
