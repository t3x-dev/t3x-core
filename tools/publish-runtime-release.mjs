#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localPackageJsonPath = path.join(repoRoot, 'apps', 'local', 'package.json');
const runtimeArtifactsDir = path.join(repoRoot, 'apps', 'local', 'runtime-artifacts');
const runtimeManifestPath = path.join(repoRoot, 'apps', 'local', 'runtime-manifest.json');

if (!fs.existsSync(localPackageJsonPath)) {
  throw new Error(`Could not find ${localPackageJsonPath}`);
}

if (!fs.existsSync(runtimeArtifactsDir)) {
  throw new Error(`Could not find ${runtimeArtifactsDir}. Build runtime artifacts first.`);
}

if (!fs.existsSync(runtimeManifestPath)) {
  throw new Error(`Could not find ${runtimeManifestPath}. Generate the runtime manifest first.`);
}

const { version } = JSON.parse(fs.readFileSync(localPackageJsonPath, 'utf8'));
if (typeof version !== 'string' || version.length === 0) {
  throw new Error(`Could not resolve @t3x-dev/local version from ${localPackageJsonPath}`);
}

const artifactPaths = fs
  .readdirSync(runtimeArtifactsDir)
  .filter((fileName) => fileName.endsWith('.tar.gz'))
  .sort()
  .map((fileName) => path.join(runtimeArtifactsDir, fileName));

if (artifactPaths.length === 0) {
  throw new Error(`No runtime tarballs found in ${runtimeArtifactsDir}`);
}

const releaseTag = `t3x-local-v${version}`;
const releaseTitle = `t3x-local v${version}`;
const ghEnv = {
  ...process.env,
  GH_TOKEN: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
};

if (!ghEnv.GH_TOKEN) {
  throw new Error('GH_TOKEN or GITHUB_TOKEN is required to publish runtime release assets.');
}

const assetArgs = [...artifactPaths, runtimeManifestPath];

if (releaseExists(releaseTag, ghEnv)) {
  console.log(`[publish-runtime-release] Uploading assets to existing release ${releaseTag}`);
  execFileSync('gh', ['release', 'upload', releaseTag, ...assetArgs, '--clobber'], {
    cwd: repoRoot,
    env: ghEnv,
    stdio: 'inherit',
  });
} else {
  console.log(`[publish-runtime-release] Creating release ${releaseTag}`);
  execFileSync('gh', ['release', 'create', releaseTag, '--title', releaseTitle, ...assetArgs], {
    cwd: repoRoot,
    env: ghEnv,
    stdio: 'inherit',
  });
}

function releaseExists(releaseTag, env) {
  try {
    execFileSync('gh', ['release', 'view', releaseTag], {
      cwd: repoRoot,
      env,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}
