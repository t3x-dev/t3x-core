#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

const packageDirs = [
  path.join('packages', 'yops'),
  path.join('packages', 'yschema'),
  path.join('packages', 'core'),
  path.join('packages', 'api-client'),
  path.join('apps', 'runner'),
  path.join('packages', 'storage'),
  path.join('packages', 'api'),
  path.join('packages', 'mcp'),
  path.join('apps', 'cli'),
  path.join('apps', 'mcp'),
  path.join('apps', 'local'),
];

try {
  for (const relativeDir of packageDirs) {
    const packageDir = path.join(repoRoot, relativeDir);
    const packageJson = JSON.parse(
      await fs.readFile(path.join(packageDir, 'package.json'), 'utf8')
    );
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

    if (registry) {
      publishArgs.push('--registry', registry);
    }

    if (tag) {
      publishArgs.push('--tag', tag);
    }

    if (otp) {
      publishArgs.push('--otp', otp);
    }

    console.log(`[publish-package-tarballs] Publishing ${tarball}`);
    execFileSync('npm', publishArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  }
} finally {
  if (process.env.T3X_KEEP_PUBLISH_PACKS === '1') {
    console.log(`[publish-package-tarballs] Kept packed tarballs at ${packDir}`);
  } else {
    await fs.rm(packDir, { recursive: true, force: true });
  }
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
