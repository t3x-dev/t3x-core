import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  FIXED_VERSION_PACKAGES,
  VERSION_CHECK_PACKAGE_NAMES,
  verifyVersions,
} from '../verify-versions.mjs';

const FIXED_PACKAGE_DIRS = {
  '@t3x-dev/yops': ['packages', 'yops'],
  '@t3x-dev/yschema': ['packages', 'yschema'],
  '@t3x-dev/core': ['packages', 'core'],
  '@t3x-dev/storage': ['packages', 'storage'],
  '@t3x-dev/api': ['packages', 'api'],
  '@t3x-dev/api-client': ['packages', 'api-client'],
  '@t3x-dev/cli': ['apps', 'cli'],
  '@t3x-dev/mcp': ['apps', 'mcp'],
  '@t3x-dev/local': ['apps', 'local'],
  '@t3x-dev/transition': ['packages', 'transition'],
};

function writeFixedPackageJsons(repoRoot, version = '0.3.0', versionOverrides = {}) {
  writeJson(join(repoRoot, 'pnpm-workspace.yaml'), {});

  for (const packageName of VERSION_CHECK_PACKAGE_NAMES) {
    const packageVersion = versionOverrides[packageName] ?? version;
    const packageDir = join(repoRoot, ...FIXED_PACKAGE_DIRS[packageName]);
    mkdirSync(packageDir, { recursive: true });
    writeJson(join(packageDir, 'package.json'), {
      name: packageName,
      version: packageVersion,
      dependencies:
        packageName === '@t3x-dev/local'
          ? {
              '@t3x-dev/api': `workspace:${versionOverrides['@t3x-dev/api'] ?? version}`,
              '@t3x-dev/cli': `workspace:${versionOverrides['@t3x-dev/cli'] ?? version}`,
              '@t3x-dev/mcp': `workspace:${versionOverrides['@t3x-dev/mcp'] ?? version}`,
              '@t3x-dev/storage': `workspace:${versionOverrides['@t3x-dev/storage'] ?? version}`,
            }
          : {},
    });
  }
}

test('verifyVersions allows independently versioned packages without manifest checks', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 't3x-verify-versions-independent-'));
  writeFixedPackageJsons(repoRoot, '1.0.0', {
    '@t3x-dev/yops': '1.0.1',
    '@t3x-dev/yschema': '1.1.0',
  });

  const result = await verifyVersions({ repoRoot, verifyManifest: false });

  assert.deepEqual(result.problems, []);
});

test('verifyVersions skips stale local runtime manifest when selected packages exclude local', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 't3x-verify-versions-selected-package-'));
  writeFixedPackageJsons(repoRoot, '1.0.0', {
    '@t3x-dev/yops': '1.0.1',
  });

  writeJson(join(repoRoot, 'apps', 'local', 'runtime-manifest.json'), {
    manifestVersion: 1,
    packageVersion: '0.3.0',
    fixedVersion: '0.3.0',
    dependencies: Object.fromEntries(FIXED_VERSION_PACKAGES.map((name) => [name, '0.3.0'])),
    platforms: {},
  });

  const result = await verifyVersions({
    repoRoot,
    selectedPackages: ['@t3x-dev/yops'],
    verifyManifest: true,
  });

  assert.deepEqual(result.problems, []);
});

test('verifyVersions rejects runtime manifests with stale runtime artifact metadata', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 't3x-verify-versions-'));
  writeFixedPackageJsons(repoRoot);

  writeJson(join(repoRoot, 'apps', 'local', 'runtime-manifest.json'), {
    manifestVersion: 1,
    packageVersion: '0.3.0',
    fixedVersion: '0.1.2',
    dependencies: Object.fromEntries(FIXED_VERSION_PACKAGES.map((name) => [name, '0.3.0'])),
    platforms: {
      'darwin-arm64': {
        fileName: 't3x-local-runtime-0.1.2-darwin-arm64.tar.gz',
        url: 'https://github.com/t3x-dev/t3x-core/releases/download/t3x-local-v0.1.2/t3x-local-runtime-0.1.2-darwin-arm64.tar.gz',
        sha256: 'abc',
        size: 123,
      },
    },
  });

  const result = await verifyVersions({ repoRoot });

  assert.ok(
    result.problems.includes(
      'apps/local/runtime-manifest.json fixedVersion must be 0.3.0, found 0.1.2'
    )
  );
  assert.ok(
    result.problems.includes(
      'apps/local/runtime-manifest.json platform darwin-arm64 fileName must include 0.3.0, found t3x-local-runtime-0.1.2-darwin-arm64.tar.gz'
    )
  );
  assert.ok(
    result.problems.includes(
      'apps/local/runtime-manifest.json platform darwin-arm64 url must reference t3x-local-v0.3.0, found https://github.com/t3x-dev/t3x-core/releases/download/t3x-local-v0.1.2/t3x-local-runtime-0.1.2-darwin-arm64.tar.gz'
    )
  );
});

test('verifyVersions rejects runtime manifests without platform artifacts', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 't3x-verify-versions-empty-platforms-'));
  writeFixedPackageJsons(repoRoot);

  writeJson(join(repoRoot, 'apps', 'local', 'runtime-manifest.json'), {
    manifestVersion: 1,
    packageVersion: '0.3.0',
    fixedVersion: '0.3.0',
    dependencies: Object.fromEntries(FIXED_VERSION_PACKAGES.map((name) => [name, '0.3.0'])),
    platforms: {},
  });

  const result = await verifyVersions({ repoRoot });

  assert.ok(
    result.problems.includes(
      'apps/local/runtime-manifest.json must declare at least one runtime platform artifact'
    )
  );
});

test('verifyVersions rejects hard-coded source version literals', async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 't3x-verify-versions-source-literals-'));
  writeFixedPackageJsons(repoRoot);

  mkdirSync(join(repoRoot, 'apps', 'cli', 'src'), { recursive: true });
  writeFileSync(
    join(repoRoot, 'apps', 'cli', 'src', 'index.ts'),
    "program.version('0.1.1');\n",
    'utf8'
  );

  mkdirSync(join(repoRoot, 'apps', 'local', 'src', 'bin'), { recursive: true });
  writeFileSync(
    join(repoRoot, 'apps', 'local', 'src', 'bin', 't3x-local.ts'),
    "program.version('0.1.1');\n",
    'utf8'
  );

  mkdirSync(join(repoRoot, 'packages', 'mcp', 'src'), { recursive: true });
  writeJson(join(repoRoot, 'packages', 'mcp', 'package.json'), {
    name: '@t3x-dev/mcp-lib',
    version: '0.1.7',
  });
  writeFileSync(
    join(repoRoot, 'packages', 'mcp', 'src', 'server.ts'),
    "new Server({ name: 't3x-mcp', version: '0.1.1' });\n",
    'utf8'
  );

  const result = await verifyVersions({ repoRoot, verifyManifest: false });

  assert.ok(
    result.problems.includes(
      'apps/cli/src/index.ts must read @t3x-dev/cli version from package.json, found hard-coded 0.1.1'
    )
  );
  assert.ok(
    result.problems.includes(
      'apps/local/src/bin/t3x-local.ts must read @t3x-dev/local version from package.json, found hard-coded 0.1.1'
    )
  );
  assert.ok(
    result.problems.includes(
      'packages/mcp/src/server.ts must read @t3x-dev/mcp-lib version from package.json, found hard-coded 0.1.1'
    )
  );
});

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
