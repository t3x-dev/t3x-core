#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(
    'Usage: node tools/publish-package-tarballs.mjs [--registry <url>] [--tag <name>] [--otp <code>]'
  );
  process.exit(0);
}

const packDir = await fs.mkdtemp(path.join(os.tmpdir(), 't3x-publish-packs-'));
const registry = getArgValue('--registry') ?? process.env.NPM_CONFIG_REGISTRY;
const tag = getArgValue('--tag') ?? process.env.NPM_DIST_TAG;
const otp = getArgValue('--otp') ?? process.env.NPM_OTP;
const maxPublishAttempts = parsePositiveInt(process.env.T3X_PUBLISH_MAX_ATTEMPTS, 6);
const publishRetryDelayMs = parsePositiveInt(process.env.T3X_PUBLISH_RETRY_DELAY_MS, 15000);

const packageDirs = await getPublishPackageDirs();

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

    if (isPackageVersionPublished(packageJson.name, packageJson.version)) {
      console.log(
        `[publish-package-tarballs] Skipping ${packageJson.name}@${packageJson.version}; already published.`
      );
      continue;
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
} finally {
  if (process.env.T3X_KEEP_PUBLISH_PACKS === '1') {
    console.log(`[publish-package-tarballs] Kept packed tarballs at ${packDir}`);
  } else {
    await fs.rm(packDir, { recursive: true, force: true });
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
