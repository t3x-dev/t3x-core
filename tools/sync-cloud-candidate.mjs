#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyCloudArtifactPins,
  CLOUD_PACKAGE_SPECS,
  createCloudArtifactManifest,
} from './lib/cloudSyncCandidate.mjs';

const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreRoot = resolveCoreRoot();
const cloudRoot = resolveCloudRoot();
const vendorDir = path.join(cloudRoot, 'vendor', 't3x');
const manifestPath = path.join(vendorDir, 'manifest.json');
const packDir = await fs.mkdtemp(path.join(os.tmpdir(), 't3x-cloud-sync-'));

try {
  await assertRepositoryRoot(cloudRoot, 't3x-cloud');
  assertCleanCheckout(coreRoot, 'Core');
  assertCleanCheckout(cloudRoot, 'Cloud');

  const sourceSha = git(coreRoot, ['rev-parse', 'HEAD']);
  const currentManifest = await readJson(manifestPath);
  if (currentManifest.source?.sha === sourceSha) {
    console.log(`Cloud already pins Core ${sourceSha}; no sync candidate is required.`);
    await fs.rm(packDir, { recursive: true, force: true });
    process.exit(0);
  }

  const artifacts = [];
  for (const packageSpec of CLOUD_PACKAGE_SPECS) {
    artifacts.push(await packPackage(packageSpec));
  }

  await replaceVendoredTarballs(artifacts);

  const rootPackagePath = path.join(cloudRoot, 'package.json');
  const rootPackage = await readJson(rootPackagePath);
  const workspacePackagePaths = await findWorkspacePackageJsonPaths();
  const workspacePackages = await Promise.all(workspacePackagePaths.map(readJson));
  applyCloudArtifactPins({ rootPackage, workspacePackages, artifacts });

  await writeJson(rootPackagePath, rootPackage);
  await Promise.all(
    workspacePackagePaths.map((packagePath, index) =>
      writeJson(packagePath, workspacePackages[index])
    )
  );

  const manifest = createCloudArtifactManifest({
    sourceSha,
    generatedAt: new Date().toISOString(),
    artifacts,
  });
  await writeJson(manifestPath, manifest);

  execFileSync('node', [path.join(cloudRoot, 'scripts', 'sync-core-web.mjs'), '--write'], {
    cwd: cloudRoot,
    env: { ...process.env, T3X_CORE_ROOT: coreRoot },
    stdio: 'inherit',
  });
  execFileSync(
    'node',
    [path.join(cloudRoot, 'scripts', 'sync-core-database-contract.mjs'), '--write'],
    {
      cwd: cloudRoot,
      env: { ...process.env, T3X_CORE_ROOT: coreRoot },
      stdio: 'inherit',
    }
  );

  console.log(`Prepared Cloud artifacts and shared Web baseline from Core ${sourceSha}.`);
} finally {
  await fs.rm(packDir, { recursive: true, force: true });
}

async function packPackage(packageSpec) {
  const packageDir = path.join(coreRoot, packageSpec.path);
  const packageJson = await readJson(path.join(packageDir, 'package.json'));
  if (packageJson.name !== packageSpec.name) {
    throw new Error(
      `Expected ${packageSpec.name} at ${packageSpec.path}, received ${packageJson.name ?? 'unknown'}.`
    );
  }

  const rewriteTool = path.join(coreRoot, 'tools', 'rewrite-workspace-package-json.mjs');
  const restoreTool = path.join(coreRoot, 'tools', 'restore-package-json.mjs');
  execFileSync('node', [rewriteTool], { cwd: packageDir, stdio: 'inherit' });

  let fileName;
  try {
    const packArgs = [
      'pack',
      '--json',
      '--silent',
      '--ignore-scripts',
      '--pack-destination',
      packDir,
    ];
    const command = npmCommand(packArgs);
    const output = execFileSync(command.file, command.args, {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    fileName = parsePackFilename(output, packageSpec.name);
  } finally {
    execFileSync('node', [restoreTool], { cwd: packageDir, stdio: 'inherit' });
  }

  const bytes = await fs.readFile(path.join(packDir, fileName));
  return {
    package: packageJson.name,
    version: packageJson.version,
    file: fileName,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function replaceVendoredTarballs(artifacts) {
  await fs.mkdir(vendorDir, { recursive: true });
  const expectedFiles = new Set(artifacts.map((artifact) => artifact.file));

  for (const entry of await fs.readdir(vendorDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.tgz') && !expectedFiles.has(entry.name)) {
      await fs.rm(path.join(vendorDir, entry.name));
    }
  }

  await Promise.all(
    artifacts.map((artifact) =>
      fs.copyFile(path.join(packDir, artifact.file), path.join(vendorDir, artifact.file))
    )
  );
}

async function findWorkspacePackageJsonPaths() {
  const appsDir = path.join(cloudRoot, 'apps');
  const paths = [];
  for (const entry of await fs.readdir(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = path.join(appsDir, entry.name, 'package.json');
    try {
      await fs.access(packagePath);
      paths.push(packagePath);
    } catch {}
  }
  return paths.sort();
}

async function assertRepositoryRoot(root, expectedName) {
  const packageJson = await readJson(path.join(root, 'package.json'));
  if (packageJson.name !== expectedName) {
    throw new Error(`Expected ${expectedName} checkout at ${root}.`);
  }
}

function assertCleanCheckout(root, label) {
  const status = git(root, ['status', '--short']);
  if (status) throw new Error(`${label} checkout must be clean before synchronization.`);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function parsePackFilename(output, packageName) {
  const trimmed = output.trim();
  const match = trimmed.match(/(\[\s*{[\s\S]*\])\s*$/);
  let parsed;
  try {
    parsed = JSON.parse(match ? match[1] : trimmed);
  } catch (error) {
    throw new Error(`Failed to parse npm pack output for ${packageName}: ${String(error)}`);
  }

  if (!Array.isArray(parsed) || typeof parsed[0]?.filename !== 'string') {
    throw new Error(`npm pack did not return a tarball filename for ${packageName}.`);
  }
  return parsed[0].filename;
}

function npmCommand(args) {
  if (process.platform !== 'win32') return { file: 'npm', args };
  return {
    file: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm.cmd', ...args],
  };
}

function resolveCloudRoot() {
  const index = process.argv.indexOf('--cloud-root');
  const value = index === -1 ? path.join(coreRoot, '..', 't3x-cloud') : process.argv[index + 1];
  if (!value) throw new Error('--cloud-root requires a path.');
  return path.resolve(value);
}

function resolveCoreRoot() {
  const index = process.argv.indexOf('--core-root');
  const value = index === -1 ? toolRoot : process.argv[index + 1];
  if (!value) throw new Error('--core-root requires a path.');
  return path.resolve(value);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
