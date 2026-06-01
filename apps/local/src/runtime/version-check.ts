import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { LocalPaths } from './paths.js';

const require = createRequire(import.meta.url);

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
] as const;

const FIXED_PACKAGE_WORKSPACE_PATHS: Record<(typeof FIXED_VERSION_PACKAGES)[number], string> = {
  '@t3x-dev/yops': path.join('packages', 'yops', 'package.json'),
  '@t3x-dev/yschema': path.join('packages', 'yschema', 'package.json'),
  '@t3x-dev/core': path.join('packages', 'core', 'package.json'),
  '@t3x-dev/storage': path.join('packages', 'storage', 'package.json'),
  '@t3x-dev/api': path.join('packages', 'api', 'package.json'),
  '@t3x-dev/api-client': path.join('packages', 'api-client', 'package.json'),
  '@t3x-dev/cli': path.join('apps', 'cli', 'package.json'),
  '@t3x-dev/mcp': path.join('apps', 'mcp', 'package.json'),
  '@t3x-dev/local': path.join('apps', 'local', 'package.json'),
};

export interface VersionSnapshot {
  node: string;
  platform: string;
  local: string;
  api: string;
  web: string;
  cli: string;
  mcp: string;
  fixedVersion: string;
}

export interface VersionLockReport {
  expectedVersion: string;
  resolvedVersions: Record<string, string>;
  problems: string[];
}

export function getVersionSnapshot(paths: LocalPaths): VersionSnapshot {
  const report = getVersionLockReport(paths);
  const manifestVersions = readManifestDependencyVersions(paths);

  return {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    local: report.resolvedVersions['@t3x-dev/local'] ?? 'unknown',
    api: report.resolvedVersions['@t3x-dev/api'] ?? 'unknown',
    web:
      manifestVersions.web ??
      (paths.repoRoot
        ? readPackageVersion(path.join(paths.repoRoot, 'apps', 'web', 'package.json'))
        : 'runtime-only'),
    cli: report.resolvedVersions['@t3x-dev/cli'] ?? 'unknown',
    mcp: report.resolvedVersions['@t3x-dev/mcp'] ?? 'unknown',
    fixedVersion: report.expectedVersion,
  };
}

export function getVersionLockReport(paths: LocalPaths): VersionLockReport {
  const localPackageJsonPath = path.join(paths.packageDir, 'package.json');
  const localPackageJson = readPackageJson(localPackageJsonPath);
  const manifest = readRuntimeManifest(paths);
  const expectedVersion = localPackageJson.version ?? 'unknown';
  const problems: string[] = [];
  const resolvedVersions: Record<string, string> = {};

  if (manifest) {
    if (manifest.packageVersion !== expectedVersion) {
      problems.push(
        `runtime-manifest.json packageVersion must be ${expectedVersion}, found ${manifest.packageVersion ?? 'missing'}`
      );
    }

    if (manifest.fixedVersion !== expectedVersion) {
      problems.push(
        `runtime-manifest.json fixedVersion must be ${expectedVersion}, found ${manifest.fixedVersion ?? 'missing'}`
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

    const platformEntries = Object.entries(manifest.platforms ?? {});
    if (platformEntries.length === 0) {
      problems.push('runtime-manifest.json must declare at least one runtime platform artifact');
    }

    for (const [platformKey, platform] of platformEntries) {
      const expectedFileNamePrefix = `t3x-local-runtime-${expectedVersion}-`;
      if (!platform.fileName?.startsWith(expectedFileNamePrefix)) {
        problems.push(
          `runtime-manifest.json platform ${platformKey} fileName must include ${expectedVersion}, found ${platform.fileName ?? 'missing'}`
        );
      }

      const expectedReleaseTag = `t3x-local-v${expectedVersion}`;
      if (!platform.url?.includes(expectedReleaseTag)) {
        problems.push(
          `runtime-manifest.json platform ${platformKey} url must reference ${expectedReleaseTag}, found ${platform.url ?? 'missing'}`
        );
      }
    }
  }

  for (const packageName of FIXED_VERSION_PACKAGES) {
    const actualVersion =
      packageName === '@t3x-dev/local'
        ? expectedVersion
        : resolveFixedPackageVersion(packageName, paths, manifest);

    resolvedVersions[packageName] = actualVersion ?? 'unknown';

    if (!actualVersion) {
      problems.push(`Could not resolve installed version for ${packageName}`);
      continue;
    }

    if (actualVersion !== expectedVersion) {
      problems.push(
        `${packageName} must use fixed version ${expectedVersion}, found ${actualVersion}`
      );
    }
  }

  return {
    expectedVersion,
    resolvedVersions,
    problems,
  };
}

export function assertVersionLockOrThrow(paths: LocalPaths, context: string): VersionLockReport {
  const report = getVersionLockReport(paths);

  if (report.problems.length > 0) {
    throw new Error(
      `[t3x-local] Version lock check failed during ${context}.\n` +
        report.problems.map((problem) => `- ${problem}`).join('\n')
    );
  }

  return report;
}

function resolveFixedPackageVersion(
  packageName: (typeof FIXED_VERSION_PACKAGES)[number],
  paths: LocalPaths,
  manifest: RuntimeManifest | null
): string | null {
  const installedPackageJsonPath = findInstalledPackageJson(packageName);

  if (installedPackageJsonPath) {
    return readPackageVersion(installedPackageJsonPath);
  }

  if (paths.repoRoot) {
    return readPackageVersion(
      path.join(paths.repoRoot, FIXED_PACKAGE_WORKSPACE_PATHS[packageName])
    );
  }

  return manifest?.dependencies?.[packageName] ?? null;
}

function readRuntimeManifest(paths: LocalPaths): RuntimeManifest | null {
  if (!fs.existsSync(paths.runtimeManifestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(paths.runtimeManifestPath, 'utf8')) as RuntimeManifest;
}

function readManifestDependencyVersions(paths: LocalPaths): Record<string, string> {
  return readRuntimeManifest(paths)?.dependencies ?? {};
}

function findInstalledPackageJson(packageName: string): string | null {
  try {
    const entryPath = require.resolve(packageName);
    let current = path.dirname(entryPath);

    while (current !== path.dirname(current)) {
      const packageJsonPath = path.join(current, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
          name?: string;
        };
        if (packageJson.name === packageName) {
          return packageJsonPath;
        }
      }
      current = path.dirname(current);
    }

    return null;
  } catch {
    return null;
  }
}

function readPackageJson(packageJsonPath: string): {
  version?: string;
  dependencies?: Record<string, string>;
} {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    version?: string;
    dependencies?: Record<string, string>;
  };
}

function readPackageVersion(packageJsonPath: string): string {
  return readPackageJson(packageJsonPath).version ?? 'unknown';
}

interface RuntimeManifest {
  packageVersion?: string;
  fixedVersion?: string;
  dependencies?: Record<string, string>;
  platforms?: Record<string, { fileName?: string; url?: string }>;
}
