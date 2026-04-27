#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertRuntimeLayout,
  ensureDir,
  fileExists,
  findWorkspaceRepoRoot,
  getDefaultInstalledRuntimeDir,
  getLocalPackageDir,
  getPlatformKey,
  getRuntimeManifestPath,
  readJson,
  resolveMirrorArtifactLocation,
} from './runtime-helpers.mjs';

const FIXED_VERSION_PACKAGES = [
  '@t3x-dev/yops',
  '@t3x-dev/yschema',
  '@t3x-dev/core',
  '@t3x-dev/storage',
  '@t3x-dev/api',
  '@t3x-dev/api-client',
  '@t3x-dev/cli',
  '@t3x-dev/mcp',
  '@t3x-dev/local',
];
const LOCAL_DIRECT_FIXED_DEPENDENCIES = [
  '@t3x-dev/api',
  '@t3x-dev/cli',
  '@t3x-dev/mcp',
  '@t3x-dev/storage',
];
const GITHUB_TOKEN_ENV_NAMES = ['T3X_LOCAL_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

if (process.env.T3X_LOCAL_SKIP_DOWNLOAD === '1' || process.env.T3X_LOCAL_SKIP_DOWNLOAD === 'true') {
  console.log(
    '[t3x-local:postinstall] Skipping runtime download because T3X_LOCAL_SKIP_DOWNLOAD is set.'
  );
  process.exit(0);
}

const packageDir = getLocalPackageDir();
const manifestPath = getRuntimeManifestPath(packageDir);
const workspaceRepoRoot = await findWorkspaceRepoRoot(packageDir);

if (workspaceRepoRoot) {
  console.log(
    `[t3x-local:postinstall] Detected workspace install at ${workspaceRepoRoot}. Skipping runtime download.`
  );
  process.exit(0);
}

if (!(await fileExists(manifestPath))) {
  console.log('[t3x-local:postinstall] No runtime manifest found. Skipping runtime download.');
  process.exit(0);
}

const manifest = await readJson(manifestPath);
await verifyInstalledVersionLock(packageDir, manifest);
const platformKey = getPlatformKey();
const artifact = manifest.platforms?.[platformKey];

if (!artifact) {
  throw new Error(`[t3x-local:postinstall] No runtime artifact configured for ${platformKey}`);
}

const runtimeDir = path.resolve(
  process.env.T3X_LOCAL_RUNTIME_DIR ?? getDefaultInstalledRuntimeDir(packageDir)
);
const downloadSource = process.env.T3X_LOCAL_RUNTIME_MIRROR
  ? resolveMirrorArtifactLocation(process.env.T3X_LOCAL_RUNTIME_MIRROR, artifact.fileName)
  : artifact.url;

if (!downloadSource) {
  throw new Error(
    '[t3x-local:postinstall] Runtime manifest did not contain a URL and no T3X_LOCAL_RUNTIME_MIRROR was provided.'
  );
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 't3x-local-postinstall-'));
const archivePath = path.join(tempDir, artifact.fileName);

try {
  await downloadArtifact(downloadSource, archivePath);
  await verifyArchiveSha(archivePath, artifact.sha256);

  await fs.rm(runtimeDir, { recursive: true, force: true });
  await ensureDir(runtimeDir);

  const extractResult = spawnSync('tar', ['-xzf', archivePath, '-C', runtimeDir], {
    stdio: 'inherit',
  });

  if (extractResult.status !== 0) {
    throw new Error(
      `[t3x-local:postinstall] tar extraction failed with exit code ${String(extractResult.status)}`
    );
  }

  await assertRuntimeLayout(runtimeDir);
  await ensurePackageNodeModulesLink(runtimeDir, packageDir);
  await fs.writeFile(
    path.join(runtimeDir, '.runtime-download.json'),
    `${JSON.stringify(
      {
        packageVersion: manifest.packageVersion,
        platform: platformKey,
        source: downloadSource,
        sha256: artifact.sha256,
        installedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(`[t3x-local:postinstall] Runtime ready at ${runtimeDir}`);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function downloadArtifact(source, destinationPath) {
  if (source.startsWith('file://')) {
    await fs.copyFile(new URL(source), destinationPath);
    return;
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetchRuntimeArtifact(source);

    if (!response.ok) {
      throw new Error(
        `[t3x-local:postinstall] Failed to download runtime: HTTP ${response.status}${getDownloadHint(source)}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(destinationPath, new Uint8Array(arrayBuffer));
    return;
  }

  await fs.copyFile(source, destinationPath);
}

async function fetchRuntimeArtifact(source) {
  const response = await fetch(source, { headers: getDownloadHeaders(source) });
  const token = getGitHubToken();

  if (
    response.ok ||
    !token ||
    !isGitHubReleaseDownloadUrl(source) ||
    !isAuthRetryStatus(response.status)
  ) {
    return response;
  }

  const apiResponse = await fetchGitHubReleaseAsset(source, token);
  return apiResponse ?? response;
}

function getDownloadHeaders(source) {
  if (!isGitHubUrl(source)) {
    return undefined;
  }

  const token = getGitHubToken();
  if (!token) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': '@t3x-dev/local postinstall',
  };
}

function getDownloadHint(source) {
  if (!isGitHubUrl(source) || getGitHubToken()) {
    return '';
  }

  return `; set ${GITHUB_TOKEN_ENV_NAMES[0]}, GH_TOKEN, or GITHUB_TOKEN if the runtime release is private`;
}

function getGitHubToken() {
  for (const envName of GITHUB_TOKEN_ENV_NAMES) {
    const token = process.env[envName]?.trim();
    if (token) {
      return token;
    }
  }

  return null;
}

async function fetchGitHubReleaseAsset(source, token) {
  const releaseAsset = parseGitHubReleaseDownloadUrl(source);
  if (!releaseAsset) {
    return null;
  }

  const releaseUrl = `https://api.github.com/repos/${releaseAsset.owner}/${releaseAsset.repo}/releases/tags/${releaseAsset.tag}`;
  const releaseResponse = await fetch(releaseUrl, {
    headers: getGitHubApiHeaders(token),
  });

  if (!releaseResponse.ok) {
    return releaseResponse;
  }

  const release = await releaseResponse.json();
  const asset = release.assets?.find((candidate) => candidate.name === releaseAsset.assetName);

  if (!asset?.url) {
    return new Response(null, {
      status: 404,
      statusText: `Release asset ${releaseAsset.assetName} not found`,
    });
  }

  return fetch(asset.url, {
    headers: {
      ...getGitHubApiHeaders(token),
      Accept: 'application/octet-stream',
    },
  });
}

function getGitHubApiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': '@t3x-dev/local postinstall',
  };
}

function isGitHubUrl(source) {
  try {
    const { hostname } = new URL(source);
    return hostname === 'github.com' || hostname === 'api.github.com';
  } catch {
    return false;
  }
}

function isGitHubReleaseDownloadUrl(source) {
  return parseGitHubReleaseDownloadUrl(source) !== null;
}

function parseGitHubReleaseDownloadUrl(source) {
  try {
    const url = new URL(source);
    if (url.hostname !== 'github.com') {
      return null;
    }

    const [, owner, repo, releases, download, tag, ...assetParts] = url.pathname.split('/');
    if (!owner || !repo || releases !== 'releases' || download !== 'download' || !tag) {
      return null;
    }

    const assetName = assetParts.join('/');
    if (!assetName) {
      return null;
    }

    return {
      owner: encodeURIComponent(owner),
      repo: encodeURIComponent(repo),
      tag: encodeURIComponent(decodeURIComponent(tag)),
      assetName: decodeURIComponent(assetName),
    };
  } catch {
    return null;
  }
}

function isAuthRetryStatus(status) {
  return status === 403 || status === 404;
}

async function verifyArchiveSha(archivePath, expectedSha) {
  const file = await fs.readFile(archivePath);
  const actualSha = crypto.createHash('sha256').update(file).digest('hex');

  if (actualSha !== expectedSha) {
    throw new Error(
      `[t3x-local:postinstall] SHA256 mismatch for runtime archive. Expected ${expectedSha}, got ${actualSha}`
    );
  }
}

async function ensurePackageNodeModulesLink(runtimeDir, packageDir) {
  const runtimeNodeModulesPath = path.join(runtimeDir, 'node_modules');
  const packageNodeModulesPath = path.join(packageDir, 'node_modules');

  if (!(await fileExists(packageNodeModulesPath))) {
    return;
  }

  await fs.rm(runtimeNodeModulesPath, { recursive: true, force: true });
  await fs.symlink(packageNodeModulesPath, runtimeNodeModulesPath, 'junction');
}

async function verifyInstalledVersionLock(packageDir, manifest) {
  const packageJson = await readJson(path.join(packageDir, 'package.json'));
  const expectedVersion = packageJson.version;
  const problems = [];

  for (const dependencyName of LOCAL_DIRECT_FIXED_DEPENDENCIES) {
    const actual = packageJson.dependencies?.[dependencyName];

    if (actual !== expectedVersion && actual !== `workspace:${expectedVersion}`) {
      problems.push(
        `package.json dependency ${dependencyName} must pin ${expectedVersion}, found ${actual ?? 'missing'}`
      );
    }
  }

  if (manifest.packageVersion !== expectedVersion) {
    problems.push(
      `runtime-manifest.json packageVersion must be ${expectedVersion}, found ${manifest.packageVersion ?? 'missing'}`
    );
  }

  for (const packageName of FIXED_VERSION_PACKAGES) {
    const manifestVersion = manifest.dependencies?.[packageName];
    if (manifestVersion !== expectedVersion) {
      problems.push(
        `runtime-manifest.json dependency ${packageName} must be ${expectedVersion}, found ${manifestVersion ?? 'missing'}`
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      '[t3x-local:postinstall] Fixed version verification failed.\n' +
        problems.map((problem) => `- ${problem}`).join('\n')
    );
  }
}
