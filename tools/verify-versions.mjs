#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

export const FIXED_VERSION_PACKAGES = [
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

const FIXED_PACKAGE_PATHS = {
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

const LOCAL_DIRECT_FIXED_DEPENDENCIES = [
  '@t3x-dev/api',
  '@t3x-dev/cli',
  '@t3x-dev/mcp',
  '@t3x-dev/storage',
];

const SOURCE_VERSION_LITERAL_CHECKS = [
  {
    filePath: path.join('apps', 'cli', 'src', 'index.ts'),
    packageName: '@t3x-dev/cli',
    patterns: [/\.version\(\s*['"](\d+\.\d+\.\d+)['"]\s*\)/g],
  },
  {
    filePath: path.join('apps', 'local', 'src', 'bin', 't3x-local.ts'),
    packageName: '@t3x-dev/local',
    patterns: [/\.version\(\s*['"](\d+\.\d+\.\d+)['"]\s*\)/g],
  },
  {
    filePath: path.join('packages', 'mcp', 'src', 'server.ts'),
    packageName: '@t3x-dev/mcp-lib',
    patterns: [/version:\s*['"](\d+\.\d+\.\d+)['"]/g],
  },
];

export async function verifyVersions(options = {}) {
  const repoRoot = options.repoRoot ?? (await findRepoRoot(options.cwd ?? process.cwd()));
  const packages = await readFixedPackages(repoRoot);
  const uniqueVersions = [...new Set(packages.map((pkg) => pkg.version))];
  const expectedVersion = uniqueVersions[0] ?? null;
  const problems = [];

  if (uniqueVersions.length !== 1) {
    for (const pkg of packages) {
      problems.push(
        `${pkg.name} version mismatch: expected a single fixed version, found ${pkg.version}`
      );
    }
  }

  if (expectedVersion) {
    const localPackage = packages.find((pkg) => pkg.name === '@t3x-dev/local');

    if (!localPackage) {
      problems.push('Could not locate @t3x-dev/local in the fixed package set');
    } else {
      const localDependencies = localPackage.packageJson.dependencies ?? {};

      for (const dependencyName of LOCAL_DIRECT_FIXED_DEPENDENCIES) {
        const actual = localDependencies[dependencyName];

        if (actual !== expectedVersion && actual !== `workspace:${expectedVersion}`) {
          problems.push(
            `apps/local dependency ${dependencyName} must pin ${expectedVersion}, found ${actual ?? 'missing'}`
          );
        }
      }
    }

    if (options.verifyManifest ?? true) {
      const manifestPath = path.join(repoRoot, 'apps', 'local', 'runtime-manifest.json');
      const manifest = await tryReadJson(manifestPath);

      if (!manifest) {
        problems.push(
          'apps/local/runtime-manifest.json is missing; run `pnpm build:local-runtime` first'
        );
      } else {
        if (manifest.packageVersion !== expectedVersion) {
          problems.push(
            `apps/local/runtime-manifest.json packageVersion must be ${expectedVersion}, found ${manifest.packageVersion ?? 'missing'}`
          );
        }

        if (manifest.fixedVersion !== expectedVersion) {
          problems.push(
            `apps/local/runtime-manifest.json fixedVersion must be ${expectedVersion}, found ${manifest.fixedVersion ?? 'missing'}`
          );
        }

        const manifestDependencies = manifest.dependencies ?? {};
        for (const packageName of FIXED_VERSION_PACKAGES) {
          const actual = manifestDependencies[packageName];

          if (actual !== expectedVersion) {
            problems.push(
              `apps/local/runtime-manifest.json dependency ${packageName} must be ${expectedVersion}, found ${actual ?? 'missing'}`
            );
          }
        }

        const platformEntries = Object.entries(manifest.platforms ?? {});
        if (platformEntries.length === 0) {
          problems.push(
            'apps/local/runtime-manifest.json must declare at least one runtime platform artifact'
          );
        }

        for (const [platformKey, platform] of platformEntries) {
          const expectedFileNamePrefix = `t3x-local-runtime-${expectedVersion}-`;
          if (!platform?.fileName?.startsWith(expectedFileNamePrefix)) {
            problems.push(
              `apps/local/runtime-manifest.json platform ${platformKey} fileName must include ${expectedVersion}, found ${platform?.fileName ?? 'missing'}`
            );
          }

          const expectedReleaseTag = `t3x-local-v${expectedVersion}`;
          if (!platform?.url?.includes(expectedReleaseTag)) {
            problems.push(
              `apps/local/runtime-manifest.json platform ${platformKey} url must reference ${expectedReleaseTag}, found ${platform?.url ?? 'missing'}`
            );
          }
        }
      }
    }
  }

  if (options.verifySourceVersions ?? true) {
    await verifySourceVersionLiterals(repoRoot, problems);
  }

  return {
    expectedVersion,
    problems,
    packages,
  };
}

export async function verifyVersionsOrThrow(options = {}) {
  const result = await verifyVersions(options);

  if (result.problems.length > 0) {
    const details = result.problems.map((problem) => `- ${problem}`).join('\n');
    throw new Error(`T3X fixed-version verification failed.\n${details}`);
  }

  return result;
}

async function verifySourceVersionLiterals(repoRoot, problems) {
  for (const check of SOURCE_VERSION_LITERAL_CHECKS) {
    const sourcePath = path.join(repoRoot, check.filePath);
    const source = await tryReadText(sourcePath);
    if (!source) continue;

    for (const pattern of check.patterns) {
      pattern.lastIndex = 0;
      const matches = source.matchAll(pattern);
      for (const match of matches) {
        problems.push(
          `${check.filePath} must read ${check.packageName} version from package.json, found hard-coded ${match[1]}`
        );
      }
    }
  }
}

async function readFixedPackages(repoRoot) {
  const packages = [];

  for (const packageName of FIXED_VERSION_PACKAGES) {
    const packageJsonPath = path.join(repoRoot, FIXED_PACKAGE_PATHS[packageName]);
    const packageJson = await readJson(packageJsonPath);

    packages.push({
      name: packageName,
      version: packageJson.version,
      packageJson,
      packageJsonPath,
    });
  }

  return packages;
}

async function findRepoRoot(startDir) {
  let current = path.resolve(startDir);

  while (current !== path.dirname(current)) {
    try {
      await fs.access(path.join(current, 'pnpm-workspace.yaml'));
      return current;
    } catch {
      current = path.dirname(current);
    }
  }

  throw new Error(`Could not locate pnpm-workspace.yaml above ${startDir}`);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function tryReadJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function tryReadText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (isDirectRun) {
  try {
    const verifyManifest = !process.argv.includes('--no-manifest');
    const result = await verifyVersionsOrThrow({ verifyManifest });
    const versions = result.packages.map((pkg) => `${pkg.name}@${pkg.version}`).join(', ');
    console.log(
      `[verify-versions] Fixed version ${result.expectedVersion ?? 'unknown'} verified for ${versions}`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
