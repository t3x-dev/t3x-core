import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUPPORTED_RUNTIME_PATHS = [
  path.join('api', 'dist', 'index.js'),
  path.join('cli', 'dist', 'index.js'),
  path.join('mcp', 'dist', 'index.js'),
  path.join('web', 'standalone', 'apps', 'web', 'server.js'),
  path.join('web', 'static'),
  path.join('web', 'public'),
];

export function getLocalPackageDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function getRepoRoot() {
  return path.resolve(getLocalPackageDir(), '../..');
}

export async function findWorkspaceRepoRoot(startDir) {
  let current = path.resolve(startDir);

  while (current !== path.dirname(current)) {
    if (await fileExists(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }

  return null;
}

export function getPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

export function getRuntimeArtifactFileName(packageVersion, platformKey) {
  return `t3x-local-runtime-${packageVersion}-${platformKey}.tar.gz`;
}

export function getRuntimeArtifactsDir(packageDir = getLocalPackageDir()) {
  return path.join(packageDir, 'runtime-artifacts');
}

export function getRuntimeManifestPath(packageDir = getLocalPackageDir()) {
  return path.join(packageDir, 'runtime-manifest.json');
}

export function getDefaultInstalledRuntimeDir(packageDir = getLocalPackageDir()) {
  return path.join(packageDir, 'runtime', getPlatformKey());
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const file = await fs.readFile(filePath);
  hash.update(file);
  return hash.digest('hex');
}

export async function statSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

export async function assertRuntimeLayout(rootDir) {
  const missing = [];

  for (const relativePath of SUPPORTED_RUNTIME_PATHS) {
    const absolutePath = path.join(rootDir, relativePath);
    try {
      await fs.access(absolutePath);
    } catch {
      missing.push(absolutePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Runtime directory is missing required files:\n${missing.join('\n')}`);
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function resolveMirrorArtifactLocation(mirror, fileName) {
  if (
    mirror.startsWith('http://') ||
    mirror.startsWith('https://') ||
    mirror.startsWith('file://')
  ) {
    const base = mirror.endsWith('/') ? mirror : `${mirror}/`;
    return new URL(fileName, base).toString();
  }

  return path.resolve(mirror, fileName);
}
