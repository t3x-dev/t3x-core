import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  planProductDisplayVersionSync,
  syncProductDisplayVersions,
} from '../sync-product-display-versions.mjs';

const releaseSurface = {
  packages: [
    { name: '@t3x-dev/local', npm_publish: true },
    { name: '@t3x-dev/yops', npm_publish: true },
    { name: '@t3x-dev/transition', npm_publish: true },
    { name: '@t3x-dev/yschema', npm_publish: true },
  ],
};

test('syncProductDisplayVersions updates changed internal workspace source versions', () => {
  const repoRoot = makeTempRoot();

  writePackageJson(repoRoot, 'apps/local', '@t3x-dev/local', '1.0.0');
  writePackageJson(repoRoot, 'packages/yops', '@t3x-dev/yops', '1.1.0');
  writePackageJson(repoRoot, 'packages/transition', '@t3x-dev/transition', '0.1.0');
  writePackageJson(repoRoot, 'packages/yschema', '@t3x-dev/yschema', '1.1.0');
  writePackageJson(repoRoot, 'packages/core', '@t3x-dev/core', '1.0.1');
  writePackageJson(repoRoot, 'apps/web', 't3x-webui', '0.1.0', { private: true });
  writeJson(join(repoRoot, 'release', 'product-version.json'), { version: '1.0.0' });
  writeFileSync(
    join(repoRoot, 'README.md'),
    '<img src="https://img.shields.io/badge/alpha-v1.0.0%20public-green" alt="public alpha v1.0.0" />\n',
    'utf8'
  );

  const changes = syncProductDisplayVersions({
    changedWorkspacePackagePaths: new Set(['packages/core/package.json']),
    releaseSurface,
    rootDir: repoRoot,
    version: '1.1.0',
  });

  assert.deepEqual(
    changes.map((change) => change.relativePath),
    ['release/product-version.json', 'README.md', 'packages/core/package.json']
  );
  assert.equal(readPackageVersion(repoRoot, 'apps/local'), '1.0.0');
  assert.equal(readPackageVersion(repoRoot, 'packages/yops'), '1.1.0');
  assert.equal(readPackageVersion(repoRoot, 'packages/transition'), '0.1.0');
  assert.equal(readPackageVersion(repoRoot, 'packages/yschema'), '1.1.0');
  assert.equal(readPackageVersion(repoRoot, 'apps/web'), '0.1.0');
  assert.equal(readPackageVersion(repoRoot, 'packages/core'), '1.1.0');
  assert.equal(
    JSON.parse(readFileSync(join(repoRoot, 'release/product-version.json'))).version,
    '1.1.0'
  );
  assert.match(readFileSync(join(repoRoot, 'README.md'), 'utf8'), /alpha-v1\.1\.0/);
});

test('syncProductDisplayVersions can intentionally update all internal workspace source versions', () => {
  const repoRoot = makeTempRoot();

  writePackageJson(repoRoot, 'packages/yops', '@t3x-dev/yops', '1.1.0');
  writePackageJson(repoRoot, 'packages/core', '@t3x-dev/core', '1.0.1');
  writePackageJson(repoRoot, 'apps/web', 't3x-webui', '0.1.0', { private: true });
  writeFileSync(
    join(repoRoot, 'README.md'),
    '<img src="https://img.shields.io/badge/alpha-v1.0.0%20public-green" alt="public alpha v1.0.0" />\n',
    'utf8'
  );

  const changes = syncProductDisplayVersions({
    releaseSurface,
    rootDir: repoRoot,
    version: '1.1.0',
    workspaceSourceScope: 'all',
  });

  assert.deepEqual(
    changes.map((change) => change.relativePath),
    [
      'release/product-version.json',
      'README.md',
      'apps/web/package.json',
      'packages/core/package.json',
    ]
  );
  assert.equal(readPackageVersion(repoRoot, 'packages/yops'), '1.1.0');
  assert.equal(readPackageVersion(repoRoot, 'apps/web'), '1.1.0');
  assert.equal(readPackageVersion(repoRoot, 'packages/core'), '1.1.0');
});

test('planProductDisplayVersionSync is read-only', () => {
  const repoRoot = makeTempRoot();
  writePackageJson(repoRoot, 'packages/core', '@t3x-dev/core', '1.0.1');
  writeFileSync(
    join(repoRoot, 'README.md'),
    '<img src="https://img.shields.io/badge/alpha-v1.0.0%20public-green" alt="public alpha v1.0.0" />\n',
    'utf8'
  );

  const changes = planProductDisplayVersionSync({
    changedWorkspacePackagePaths: new Set(['packages/core/package.json']),
    releaseSurface,
    rootDir: repoRoot,
    version: '1.1.0',
  });

  assert.equal(changes.length, 3);
  assert.equal(readPackageVersion(repoRoot, 'packages/core'), '1.0.1');
});

function makeTempRoot() {
  const repoRoot = mkdtempSync(join(tmpdir(), 't3x-product-display-versions-'));
  mkdirSync(join(repoRoot, 'release'), { recursive: true });
  return repoRoot;
}

function writePackageJson(repoRoot, packagePath, name, version, extra = {}) {
  const packageDir = join(repoRoot, packagePath);
  mkdirSync(packageDir, { recursive: true });
  writeJson(join(packageDir, 'package.json'), {
    name,
    version,
    ...extra,
  });
}

function readPackageVersion(repoRoot, packagePath) {
  return JSON.parse(readFileSync(join(repoRoot, packagePath, 'package.json'), 'utf8')).version;
}

function writeJson(filePath, value) {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
