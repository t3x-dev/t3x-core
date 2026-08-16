import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LocalPaths } from '../paths.js';
import { getVersionLockReport } from '../version-check.js';

const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
const runtimePackagePaths = {
  '@t3x-dev/yops': 'packages/yops/package.json',
  '@t3x-dev/yschema': 'packages/yschema/package.json',
  '@t3x-dev/core': 'packages/core/package.json',
  '@t3x-dev/storage': 'packages/storage/package.json',
  '@t3x-dev/api': 'packages/api/package.json',
  '@t3x-dev/api-client': 'packages/api-client/package.json',
  '@t3x-dev/cli': 'apps/cli/package.json',
  '@t3x-dev/mcp': 'apps/mcp/package.json',
  '@t3x-dev/local': 'apps/local/package.json',
} as const;

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('local runtime version lock', () => {
  it('accepts independently versioned packages recorded by the runtime manifest', () => {
    const { paths } = createFixture();

    expect(getVersionLockReport(paths).problems).toEqual([]);
  });

  it('rejects an installed package that differs from the runtime manifest lock', () => {
    const { paths, manifestPath, manifest } = createFixture();
    manifest.dependencies['@t3x-dev/yops'] = '0.0.0';
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    expect(getVersionLockReport(paths).problems).toContain(
      `@t3x-dev/yops must use runtime-manifest version 0.0.0, found ${readPackageVersion('packages/yops/package.json')}`
    );
  });
});

function createFixture() {
  const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 't3x-version-lock-'));
  tempDirs.push(packageDir);
  const localVersion = readPackageVersion('apps/local/package.json');
  const dependencies = Object.fromEntries(
    Object.entries(runtimePackagePaths).map(([packageName, packageJsonPath]) => [
      packageName,
      readPackageVersion(packageJsonPath),
    ])
  );
  const manifest = {
    packageVersion: localVersion,
    fixedVersion: localVersion,
    dependencies,
    platforms: {
      'darwin-arm64': {
        fileName: `t3x-local-runtime-${localVersion}-darwin-arm64.tar.gz`,
        url: `https://example.test/t3x-local-v${localVersion}/runtime.tar.gz`,
      },
    },
  };
  const manifestPath = path.join(packageDir, 'runtime-manifest.json');
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify({ name: '@t3x-dev/local', version: localVersion }, null, 2)}\n`
  );
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return {
    manifest,
    manifestPath,
    paths: {
      packageDir,
      repoRoot,
      runtimeManifestPath: manifestPath,
    } as LocalPaths,
  };
}

function readPackageVersion(relativePath: string): string {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')).version as string;
}
