#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { FIXED_VERSION_PACKAGES, verifyVersionsOrThrow } from '../../../tools/verify-versions.mjs';
import {
  getLocalPackageDir,
  getRuntimeArtifactsDir,
  getRuntimeManifestPath,
  readJson,
  sha256File,
  statSize,
  writeJson,
} from './runtime-helpers.mjs';

const packageDir = getLocalPackageDir();
const repoRoot = path.resolve(packageDir, '../..');
await verifyVersionsOrThrow({ repoRoot, verifyManifest: false });
const localPackageJson = await readJson(path.join(packageDir, 'package.json'));
const webPackageJson = await readJson(path.join(repoRoot, 'apps', 'web', 'package.json'));
const artifactsDir = path.resolve(
  process.env.T3X_LOCAL_RUNTIME_OUTPUT_DIR ?? getRuntimeArtifactsDir(packageDir)
);
const manifestPath = getRuntimeManifestPath(packageDir);
const releaseBaseUrl =
  process.env.T3X_LOCAL_RUNTIME_BASE_URL ??
  `https://github.com/t3x-dev/t3x-core/releases/download/t3x-local-v${localPackageJson.version}`;
const versions = await readFixedPackageVersions(repoRoot);
const runtimeArtifacts = await collectRuntimeArtifacts(artifactsDir, localPackageJson.version);

const manifest = {
  manifestVersion: 1,
  packageVersion: localPackageJson.version,
  fixedVersion: localPackageJson.version,
  generatedAt: new Date().toISOString(),
  dependencies: {
    ...versions,
    web: webPackageJson.version,
  },
  platforms: runtimeArtifacts.reduce((accumulator, artifact) => {
    accumulator[artifact.platformKey] = {
      fileName: artifact.fileName,
      url: `${releaseBaseUrl.replace(/\/$/, '')}/${artifact.fileName}`,
      sha256: artifact.sha256,
      size: artifact.size,
    };
    return accumulator;
  }, {}),
};

await writeJson(manifestPath, manifest);
console.log(`[generate-runtime-manifest] Wrote ${manifestPath}`);

async function readFixedPackageVersions(rootDir) {
  const versionMap = {};

  for (const packageName of FIXED_VERSION_PACKAGES) {
    versionMap[packageName] = (
      await readJson(path.join(rootDir, getWorkspacePackagePath(packageName), 'package.json'))
    ).version;
  }

  return versionMap;
}

async function collectRuntimeArtifacts(artifactDir, packageVersion) {
  const entries = await fs.readdir(artifactDir, { withFileTypes: true });
  const prefix = `t3x-local-runtime-${packageVersion}-`;
  const suffix = '.tar.gz';
  const artifacts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith(suffix)) {
      continue;
    }

    const platformKey = entry.name.slice(prefix.length, -suffix.length);
    const artifactPath = path.join(artifactDir, entry.name);

    artifacts.push({
      platformKey,
      fileName: entry.name,
      sha256: await sha256File(artifactPath),
      size: await statSize(artifactPath),
    });
  }

  if (artifacts.length === 0) {
    throw new Error(
      `No runtime artifacts found in ${artifactDir} for @t3x-dev/local ${packageVersion}`
    );
  }

  artifacts.sort((left, right) => left.platformKey.localeCompare(right.platformKey));
  return artifacts;
}

function getWorkspacePackagePath(packageName) {
  switch (packageName) {
    case '@t3x-dev/yops':
      return path.join('packages', 'yops');
    case '@t3x-dev/yschema':
      return path.join('packages', 'yschema');
    case '@t3x-dev/core':
      return path.join('packages', 'core');
    case '@t3x-dev/storage':
      return path.join('packages', 'storage');
    case '@t3x-dev/api':
      return path.join('packages', 'api');
    case '@t3x-dev/api-client':
      return path.join('packages', 'api-client');
    case '@t3x-dev/cli':
      return path.join('apps', 'cli');
    case '@t3x-dev/mcp':
      return path.join('apps', 'mcp');
    case '@t3x-dev/local':
      return path.join('apps', 'local');
    default:
      throw new Error(`Unsupported fixed package ${packageName}`);
  }
}
