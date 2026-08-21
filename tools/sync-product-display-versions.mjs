#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findProductReleasePull, parseProductReleaseVersion } from './lib/productRelease.mjs';
import { validateReleaseSurfaceOrThrow } from './lib/releaseSurface.mjs';

const rootUrl = new URL('..', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const productVersionPath = path.join('release', 'product-version.json');
const readmePath = 'README.md';
const readmeBadgePattern =
  /<img src="https:\/\/img\.shields\.io\/badge\/alpha-v([^"]+?)%20public-green" alt="public alpha v([^"]+?)" \/>/;

function parseArgs(argv) {
  const options = {
    check: false,
    dryRun: false,
    version: 'auto',
    workspaceSourceScope: 'changed',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') {
      options.check = true;
      options.dryRun = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      options[key] = key === 'version' ? normalizeVersionInput(value) : value.trim();
      index += 1;
      continue;
    }
    throw new Error(`unexpected argument: ${arg}`);
  }

  if (!options.version || (options.version !== 'auto' && !semverPattern.test(options.version))) {
    throw new Error('--version must be "auto" or a semantic version like 1.1.0');
  }
  if (!['changed', 'all'].includes(options.workspaceSourceScope)) {
    throw new Error('--workspace-source-scope must be "changed" or "all"');
  }

  return options;
}

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

export function readProductVersionFile({ rootDir = rootPath } = {}) {
  const filePath = path.join(toRootPath(rootDir), productVersionPath);
  if (!existsSync(filePath)) {
    return null;
  }

  const productVersion = JSON.parse(readFileSync(filePath, 'utf8'))?.version;
  return typeof productVersion === 'string' && semverPattern.test(productVersion)
    ? productVersion
    : null;
}

export function resolveProductDisplayVersion({
  env = process.env,
  requestedVersion = 'auto',
  rootDir = rootPath,
} = {}) {
  const normalizedVersion = normalizeVersionInput(requestedVersion);
  if (normalizedVersion !== 'auto') {
    return normalizedVersion;
  }

  return (
    readAssociatedProductReleaseVersion({ env, rootDir }) ??
    readProductVersionFile({ rootDir }) ??
    readLatestProductReleaseTagVersion({ rootDir })
  );
}

export function readWorkspacePackages({ rootDir = rootPath } = {}) {
  const repoRoot = toRootPath(rootDir);
  const packages = [];

  for (const workspaceDirName of ['apps', 'packages']) {
    const workspaceDir = path.join(repoRoot, workspaceDirName);
    if (!existsSync(workspaceDir)) {
      continue;
    }

    for (const entry of readdirSync(workspaceDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageJsonPath = path.join(workspaceDir, entry.name, 'package.json');
      if (!existsSync(packageJsonPath)) {
        continue;
      }

      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (typeof packageJson.name !== 'string' || typeof packageJson.version !== 'string') {
        continue;
      }

      packages.push({
        name: packageJson.name,
        packageJson,
        relativePath: path.relative(repoRoot, packageJsonPath),
      });
    }
  }

  return packages.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function productDisplayPackages({ releaseSurface, workspacePackages }) {
  const npmPublishPackageNames = new Set(
    releaseSurface.packages.filter((entry) => entry.npm_publish === true).map((entry) => entry.name)
  );

  return workspacePackages.filter(
    (packageRecord) => !npmPublishPackageNames.has(packageRecord.name)
  );
}

export function readChangedWorkspacePackagePaths({ rootDir = rootPath } = {}) {
  try {
    const output = execFileSync('git', ['diff', '--name-only', '--', 'apps', 'packages'], {
      cwd: toRootPath(rootDir),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return new Set(
      output
        .split('\n')
        .map((filePath) => filePath.trim())
        .filter((filePath) => filePath.endsWith('/package.json'))
    );
  } catch {
    return new Set();
  }
}

export function planProductDisplayVersionSync({
  changedWorkspacePackagePaths,
  releaseSurface,
  rootDir = rootPath,
  version,
  workspaceSourceScope = 'changed',
  workspacePackages = readWorkspacePackages({ rootDir }),
} = {}) {
  if (!version || !semverPattern.test(version)) {
    throw new Error(
      `product display version must be a semantic version, found ${version ?? 'missing'}`
    );
  }

  const repoRoot = toRootPath(rootDir);
  const resolvedReleaseSurface =
    releaseSurface ?? validateReleaseSurfaceOrThrow({ rootDir: pathToFileURL(`${repoRoot}/`) });
  const changedPackagePaths =
    changedWorkspacePackagePaths ?? readChangedWorkspacePackagePaths({ rootDir });
  const changes = [];

  const productVersionFilePath = path.join(repoRoot, productVersionPath);
  const currentProductVersion = existsSync(productVersionFilePath)
    ? JSON.parse(readFileSync(productVersionFilePath, 'utf8'))
    : {};
  if (currentProductVersion.version !== version) {
    changes.push({
      kind: 'product-version',
      relativePath: productVersionPath,
      write() {
        writeJson(productVersionFilePath, { version });
      },
    });
  }

  const localPackageVersion = workspacePackages.find(
    (packageRecord) => packageRecord.name === '@t3x-dev/local'
  )?.packageJson.version;
  if (localPackageVersion) {
    changes.push(
      ...planRootReadmeAlphaBadgeSync({
        localPackageVersion,
        repoRoot,
      })
    );
  }

  changes.push(
    ...planPackageReadmeReleaseStatusSync({
      changedPackagePaths,
      releaseSurface: resolvedReleaseSurface,
      repoRoot,
      workspacePackages,
      workspaceSourceScope,
    })
  );

  for (const packageRecord of productDisplayPackages({
    releaseSurface: resolvedReleaseSurface,
    workspacePackages,
  })) {
    if (
      workspaceSourceScope === 'changed' &&
      !changedPackagePaths.has(packageRecord.relativePath)
    ) {
      continue;
    }

    if (packageRecord.packageJson.version === version) {
      continue;
    }

    const packageJsonPath = path.join(repoRoot, packageRecord.relativePath);
    changes.push({
      kind: 'workspace-package',
      packageName: packageRecord.name,
      relativePath: packageRecord.relativePath,
      write() {
        writeJson(packageJsonPath, {
          ...packageRecord.packageJson,
          version,
        });
      },
    });
  }

  return changes;
}

function planRootReadmeAlphaBadgeSync({ localPackageVersion, repoRoot }) {
  const rootReadmePath = path.join(repoRoot, readmePath);
  if (!existsSync(rootReadmePath)) {
    return [];
  }

  const readme = readFileSync(rootReadmePath, 'utf8');
  if (!readmeBadgePattern.test(readme)) {
    throw new Error(`${readmePath} must contain the public alpha version badge`);
  }

  const nextBadge = `<img src="https://img.shields.io/badge/alpha-v${localPackageVersion}%20public-green" alt="public alpha v${localPackageVersion}" />`;
  const nextReadme = readme.replace(readmeBadgePattern, nextBadge);
  if (nextReadme === readme) {
    return [];
  }

  return [
    {
      kind: 'readme-badge',
      relativePath: readmePath,
      write() {
        writeFileSync(rootReadmePath, nextReadme, 'utf8');
      },
    },
  ];
}

function planPackageReadmeReleaseStatusSync({
  changedPackagePaths,
  releaseSurface,
  repoRoot,
  workspacePackages,
  workspaceSourceScope,
}) {
  const packageRecordsByName = new Map(
    workspacePackages.map((packageRecord) => [packageRecord.name, packageRecord])
  );
  const changes = [];

  for (const entry of releaseSurface.packages.filter((item) => item.npm_publish === true)) {
    const packageRecord = packageRecordsByName.get(entry.name);
    if (!packageRecord) {
      continue;
    }
    if (
      workspaceSourceScope === 'changed' &&
      !changedPackagePaths.has(packageRecord.relativePath)
    ) {
      continue;
    }
    if (!entry.path) {
      continue;
    }

    const readmePath = path.join(entry.path, 'README.md');
    const absoluteReadmePath = path.join(repoRoot, readmePath);
    if (!existsSync(absoluteReadmePath)) {
      continue;
    }

    const readme = readFileSync(absoluteReadmePath, 'utf8');
    const nextReadme = withPackageReleaseStatus({
      entry,
      readme,
      version: packageRecord.packageJson.version,
    });
    if (nextReadme === readme) {
      continue;
    }

    changes.push({
      kind: 'package-readme-release-status',
      packageName: entry.name,
      relativePath: readmePath,
      write() {
        writeFileSync(absoluteReadmePath, nextReadme, 'utf8');
      },
    });
  }

  return changes;
}

function withPackageReleaseStatus({ entry, readme, version }) {
  const expectedSentence = packageReleaseStatusSentence({ entry, version });
  if (readme.includes(expectedSentence)) {
    return readme;
  }

  const existingSentencePattern = new RegExp(
    `\\\`${escapeRegex(entry.name)}@[^\\\`]+\\\` is part of the [^\\n.]+ T3X [^\\n.]+ release surface\\.`
  );
  if (existingSentencePattern.test(readme)) {
    return readme.replace(existingSentencePattern, expectedSentence);
  }

  const releaseStatusHeadingPattern = /(## Release status\s*\n+)/i;
  if (releaseStatusHeadingPattern.test(readme)) {
    return readme.replace(releaseStatusHeadingPattern, `$1${expectedSentence}\n`);
  }

  return `${readme.trimEnd()}\n\n## Release status\n\n${expectedSentence}\n`;
}

function packageReleaseStatusSentence({ entry, version }) {
  return `\`${entry.name}@${version}\` is part of the ${entry.access} T3X ${entry.stability_tier} release surface.`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function syncProductDisplayVersions({
  changedWorkspacePackagePaths,
  dryRun = false,
  releaseSurface,
  rootDir = rootPath,
  version,
  workspaceSourceScope = 'changed',
} = {}) {
  const changes = planProductDisplayVersionSync({
    changedWorkspacePackagePaths,
    releaseSurface,
    rootDir,
    version,
    workspaceSourceScope,
  });

  if (!dryRun) {
    const repoRoot = toRootPath(rootDir);
    mkdirSync(path.join(repoRoot, 'release'), { recursive: true });
    for (const change of changes) {
      change.write();
    }
  }

  return changes.map(({ kind, packageName = null, relativePath }) => ({
    kind,
    packageName,
    relativePath,
  }));
}

function readAssociatedProductReleaseVersion({ env, rootDir }) {
  const token = env.GH_TOKEN || env.GITHUB_TOKEN || '';
  if (!token || !env.GITHUB_REPOSITORY || !env.GITHUB_SHA) {
    return null;
  }

  try {
    const pulls = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          `/repos/${env.GITHUB_REPOSITORY}/commits/${env.GITHUB_SHA}/pulls`,
          '-H',
          'Accept: application/vnd.github+json',
          '-H',
          'X-GitHub-Api-Version: 2022-11-28',
        ],
        {
          cwd: toRootPath(rootDir),
          encoding: 'utf8',
          env: { ...env, GH_TOKEN: token },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
    );
    const pull = findProductReleasePull(pulls);
    return pull ? parseProductReleaseVersion(pull.body ?? '') : null;
  } catch {
    return null;
  }
}

function readLatestProductReleaseTagVersion({ rootDir }) {
  try {
    const output = execFileSync('git', ['tag', '--list', 't3x-v*'], {
      cwd: toRootPath(rootDir),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const versions = output
      .split('\n')
      .map((tag) => tag.match(/^t3x-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/)?.[1])
      .filter(Boolean)
      .sort(compareVersions);

    return versions.at(-1) ?? null;
  } catch {
    return null;
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return left.localeCompare(right);
}

function toRootPath(rootDir) {
  return rootDir instanceof URL ? fileURLToPath(rootDir) : path.resolve(rootDir);
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = resolveProductDisplayVersion({
    requestedVersion: options.version,
    rootDir: rootPath,
  });

  if (!version) {
    throw new Error(
      'could not resolve product display version; pass --version x.y.z or run from a product release workflow'
    );
  }

  const changes = syncProductDisplayVersions({
    dryRun: options.dryRun,
    rootDir: rootPath,
    version,
    workspaceSourceScope: options.workspaceSourceScope,
  });

  if (changes.length === 0) {
    console.log(`Product display versions already match ${version}.`);
    return;
  }

  const lines = changes.map((change) =>
    change.packageName
      ? `- ${change.relativePath}: ${change.packageName}`
      : `- ${change.relativePath}`
  );

  if (options.check) {
    throw new Error(
      `Product display versions are not synchronized to ${version}.\n${lines.join('\n')}`
    );
  }

  console.log(
    `${options.dryRun ? 'Would sync' : 'Synced'} ${changes.length} product display version file(s) to ${version}.`
  );
  for (const line of lines) {
    console.log(line);
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
