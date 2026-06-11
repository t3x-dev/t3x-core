#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  buildPackageReleaseAssetUploadPlan,
  buildReleaseAssetUploadPlan,
  resolveProductReleaseTag,
} from './lib/packageReleaseAssets.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    'Usage: node tools/publish-package-tarballs.mjs [--registry <url>] [--tag <name>] [--otp <code>]'
  );
  process.exit(0);
}

const packDir = await fs.mkdtemp(path.join(os.tmpdir(), 't3x-publish-packs-'));
const releaseAssetDir = await fs.mkdtemp(path.join(os.tmpdir(), 't3x-release-assets-'));
const registry = getArgValue('--registry') ?? process.env.NPM_CONFIG_REGISTRY;
const tag = getArgValue('--tag') ?? process.env.NPM_DIST_TAG;
const otp = getArgValue('--otp') ?? process.env.NPM_OTP;
const maxPublishAttempts = parsePositiveInt(process.env.T3X_PUBLISH_MAX_ATTEMPTS, 6);
const publishRetryDelayMs = parsePositiveInt(process.env.T3X_PUBLISH_RETRY_DELAY_MS, 15000);

const packageDirs = await getPublishPackageDirs();
const packedPackages = [];

try {
  for (const relativeDir of packageDirs) {
    const packageDir = path.join(repoRoot, relativeDir);
    const packageJson = JSON.parse(
      await fs.readFile(path.join(packageDir, 'package.json'), 'utf8')
    );

    if (packageJson.private === true) {
      throw new Error(
        `[publish-package-tarballs] Refusing to publish private package ${packageJson.name} from ${relativeDir}`
      );
    }

    console.log(`[publish-package-tarballs] Packing ${packageJson.name}@${packageJson.version}`);
    const packOutput = execFileSync(
      'npm',
      ['pack', '--json', '--silent', '--pack-destination', packDir],
      {
        cwd: packageDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      }
    );
    const tarball = parsePackFilename(packOutput, packageDir);
    const tarballPath = path.join(packDir, tarball);
    packedPackages.push({
      name: packageJson.name,
      version: packageJson.version,
      tarballPath,
    });

    if (isPackageVersionPublished(packageJson.name, packageJson.version)) {
      console.log(
        `[publish-package-tarballs] Skipping ${packageJson.name}@${packageJson.version}; already published.`
      );
      continue;
    }

    const publishArgs = ['publish', tarballPath];
    const access = packageJson.publishConfig?.access;

    if (registry) {
      publishArgs.push('--registry', registry);
    }

    if (access === 'public' || access === 'restricted') {
      publishArgs.push('--access', access);
    }

    if (tag) {
      publishArgs.push('--tag', tag);
    }

    if (otp) {
      publishArgs.push('--otp', otp);
    }

    console.log(`[publish-package-tarballs] Publishing ${tarball}`);
    await publishWithRetry({
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      publishArgs,
    });
  }

  await uploadPackageReleaseAssets(packedPackages);
} finally {
  if (process.env.T3X_KEEP_PUBLISH_PACKS === '1') {
    console.log(`[publish-package-tarballs] Kept packed tarballs at ${packDir}`);
    console.log(`[publish-package-tarballs] Kept release assets at ${releaseAssetDir}`);
  } else {
    await fs.rm(packDir, { recursive: true, force: true });
    await fs.rm(releaseAssetDir, { recursive: true, force: true });
  }
}

async function getPublishPackageDirs() {
  const { validateReleaseSurfaceOrThrow } = await import('./lib/releaseSurface.mjs');
  const surface = validateReleaseSurfaceOrThrow({ rootDir: new URL('..', import.meta.url) });
  const publishEntries = surface.packages.filter((entry) => entry.npm_publish === true);

  if (publishEntries.length === 0) {
    throw new Error('release/surface.yaml does not declare any packages with npm_publish: true');
  }

  const publishDirs = publishEntries.map((entry) => entry.path);
  console.log(
    `[publish-package-tarballs] Publishing npm surface: ${publishEntries
      .map((entry) => entry.name)
      .join(', ')}`
  );

  return publishDirs;
}

async function uploadPackageReleaseAssets(packageRecords) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required to upload package release assets.');
  }

  const releaseRecords = getProductReleaseRecords(token);
  const productReleaseTag = resolveProductReleaseTag(packageRecords, releaseRecords);
  const productAssetPaths = await createProductReleaseAssets({
    packageRecords,
    productReleaseTag,
  });
  const uploadPlan = buildReleaseAssetUploadPlan({
    packageRecords,
    assetPaths: productAssetPaths,
    env: process.env,
    releaseRecords,
  });

  console.log(
    `[publish-package-tarballs] Uploading product release package assets to ${uploadPlan.releaseTag}: ${productAssetPaths
      .map((assetPath) => path.basename(assetPath))
      .join(', ')}`
  );
  runGh(uploadPlan.args, uploadPlan.env);

  for (const packageRecord of packageRecords) {
    await uploadSinglePackageReleaseAssets(packageRecord);
  }
}

async function createProductReleaseAssets({ packageRecords, productReleaseTag }) {
  const productDir = path.join(releaseAssetDir, 'product');
  await fs.mkdir(productDir, { recursive: true });

  const packageFileRecords = await buildFileRecords(
    packageRecords.map((record) => record.tarballPath)
  );
  const manifestPath = path.join(productDir, 'manifest.json');
  const manifest = {
    schema: 't3x.product-release-packages.v1',
    productRelease: productReleaseTag,
    generatedAt: new Date().toISOString(),
    gitSha: process.env.GITHUB_SHA ?? null,
    npmRegistry: registry ?? 'https://registry.npmjs.org/',
    packages: packageFileRecords.map((fileRecord) => {
      const packageRecord = packageRecords.find((record) => record.tarballPath === fileRecord.path);
      if (!packageRecord) {
        throw new Error(`Could not resolve package record for ${fileRecord.path}`);
      }
      return {
        name: packageRecord.name,
        version: packageRecord.version,
        npmUrl: packageVersionUrl(packageRecord),
        packageRelease: packageReleaseTag(packageRecord),
        assetName: fileRecord.fileName,
        sha256: fileRecord.sha256,
        size: fileRecord.size,
      };
    }),
  };
  await writeJson(manifestPath, manifest);

  const archivePath = path.join(productDir, `${productReleaseTag}-packages.zip`);
  createZipArchive(archivePath, [
    ...packageRecords.map((record) => record.tarballPath),
    manifestPath,
  ]);

  const checksumPath = path.join(productDir, 'checksums.txt');
  const checksumRecords = await buildFileRecords([
    ...packageRecords.map((record) => record.tarballPath),
    manifestPath,
    archivePath,
  ]);
  await writeChecksums(checksumPath, checksumRecords);

  return [
    ...packageRecords.map((record) => record.tarballPath),
    archivePath,
    manifestPath,
    checksumPath,
  ];
}

async function uploadSinglePackageReleaseAssets(packageRecord) {
  const assetPaths = await packageReleaseAssetPaths(packageRecord);
  const packageAssetDir = path.join(releaseAssetDir, packageRecord.name.replace('@t3x-dev/', ''));
  await fs.mkdir(packageAssetDir, { recursive: true });
  const checksumPath = path.join(packageAssetDir, 'checksums.txt');
  await writeChecksums(checksumPath, await buildFileRecords(assetPaths));
  const uploadPlan = buildPackageReleaseAssetUploadPlan({
    packageRecord,
    assetPaths: [...assetPaths, checksumPath],
    env: process.env,
  });

  ensureRelease(uploadPlan);

  console.log(
    `[publish-package-tarballs] Uploading ${packageRecord.name} assets to ${uploadPlan.releaseTag}: ${uploadPlan.assetPaths
      .map((assetPath) => path.basename(assetPath))
      .join(', ')}`
  );
  runGh(uploadPlan.uploadArgs, uploadPlan.env);
}

async function packageReleaseAssetPaths(packageRecord) {
  if (packageRecord.name === '@t3x-dev/yops') {
    return [packageRecord.tarballPath];
  }

  if (packageRecord.name !== '@t3x-dev/local') {
    throw new Error(`Unsupported package release asset package: ${packageRecord.name}`);
  }

  const runtimeArtifactsDir = path.join(repoRoot, 'apps', 'local', 'runtime-artifacts');
  const runtimeManifestPath = path.join(repoRoot, 'apps', 'local', 'runtime-manifest.json');
  const artifactNames = (await fs.readdir(runtimeArtifactsDir))
    .filter((fileName) => fileName.endsWith('.tar.gz'))
    .sort();

  if (artifactNames.length === 0) {
    throw new Error(`No runtime tarballs found in ${runtimeArtifactsDir}`);
  }

  await fs.access(runtimeManifestPath);
  return [
    packageRecord.tarballPath,
    ...artifactNames.map((fileName) => path.join(runtimeArtifactsDir, fileName)),
    runtimeManifestPath,
  ];
}

function ensureRelease(uploadPlan) {
  if (releaseExists(uploadPlan.releaseTag, uploadPlan.env)) {
    return;
  }

  console.log(`[publish-package-tarballs] Creating package release ${uploadPlan.releaseTag}`);
  runGh(uploadPlan.createArgs, uploadPlan.env);
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

function runGh(args, env) {
  execFileSync('gh', args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
}

async function buildFileRecords(filePaths) {
  return Promise.all(
    filePaths.map(async (filePath) => {
      const bytes = await fs.readFile(filePath);
      return {
        path: filePath,
        fileName: path.basename(filePath),
        size: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    })
  );
}

async function writeChecksums(filePath, fileRecords) {
  const lines = fileRecords.map((record) => `${record.sha256}  ${record.fileName}`);
  await fs.writeFile(filePath, `${lines.join('\n')}\n`);
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createZipArchive(archivePath, filePaths) {
  execFileSync('zip', ['-j', archivePath, ...filePaths], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function packageVersionUrl(packageRecord) {
  if (
    registry &&
    registry !== 'https://registry.npmjs.org/' &&
    registry !== 'https://registry.npmjs.org'
  ) {
    return null;
  }

  return `https://www.npmjs.com/package/${packageRecord.name}/v/${packageRecord.version}`;
}

function packageReleaseTag(packageRecord) {
  if (packageRecord.name === '@t3x-dev/local') {
    return `t3x-local-v${packageRecord.version}`;
  }
  if (packageRecord.name === '@t3x-dev/yops') {
    return `t3x-yops-v${packageRecord.version}`;
  }
  return null;
}

function getProductReleaseRecords(token) {
  const repository = getGitHubRepository(token);
  const releases = JSON.parse(
    execFileSync('gh', ['api', `/repos/${repository}/releases?per_page=100`], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_TOKEN: token,
      },
    })
  );

  return releases.map((release) => ({
    tagName: release.tag_name,
    body: release.body,
  }));
}

function getGitHubRepository(token) {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_TOKEN: token,
    },
  }).trim();
}

function parsePackFilename(output, packageDir) {
  const trimmedOutput = output.trim();
  const match = trimmedOutput.match(/(\[\s*{[\s\S]*\])\s*$/);
  let parsed;

  try {
    parsed = JSON.parse(match ? match[1] : trimmedOutput);
  } catch (error) {
    throw new Error(`Failed to parse npm pack output for ${packageDir}: ${String(error)}`);
  }

  if (!Array.isArray(parsed) || typeof parsed[0]?.filename !== 'string') {
    throw new Error(`npm pack did not return a tarball filename for ${packageDir}`);
  }

  return parsed[0].filename;
}

function getArgValue(flagName) {
  const index = process.argv.indexOf(flagName);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function isPackageVersionPublished(packageName, packageVersion) {
  const viewArgs = ['view', `${packageName}@${packageVersion}`, 'version', '--json'];

  if (registry) {
    viewArgs.push('--registry', registry);
  }

  const result = spawnSync('npm', viewArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status === 0) {
    return true;
  }

  const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (combinedOutput.includes('E404') || combinedOutput.includes('404 Not Found')) {
    return false;
  }

  throw new Error(
    `Failed to query ${packageName}@${packageVersion} publication status.\n${combinedOutput.trim()}`
  );
}

async function publishWithRetry({ packageName, packageVersion, publishArgs }) {
  for (let attempt = 1; attempt <= maxPublishAttempts; attempt += 1) {
    const result = spawnSync('npm', publishArgs, {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.status === 0) {
      return;
    }

    if (isPackageVersionPublished(packageName, packageVersion)) {
      console.log(
        `[publish-package-tarballs] ${packageName}@${packageVersion} is now visible on the registry; continuing.`
      );
      return;
    }

    const retryableConflict =
      result.status === 1 &&
      (containsConflictText(result.stderr) || containsConflictText(result.stdout));

    if (!retryableConflict || attempt === maxPublishAttempts) {
      throw new Error(
        `Failed to publish ${packageName}@${packageVersion} after ${attempt} attempt(s).`
      );
    }

    console.log(
      `[publish-package-tarballs] Registry conflict while publishing ${packageName}@${packageVersion}; retrying in ${publishRetryDelayMs}ms (attempt ${attempt + 1}/${maxPublishAttempts}).`
    );
    await sleep(publishRetryDelayMs);
  }
}

function containsConflictText(text) {
  if (typeof text !== 'string') {
    return false;
  }

  return text.includes('E409') || text.includes('409 Conflict') || text.includes('fully processed');
}

function parsePositiveInt(value, fallbackValue) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue;
}
