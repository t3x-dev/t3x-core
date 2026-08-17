import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimePackagePaths = [
  'apps/api/package.json',
  'apps/cli/package.json',
  'apps/local/package.json',
  'apps/mcp/package.json',
  'packages/core/package.json',
];

test('runtime packages pin the complete json-canonicalize artifact', () => {
  for (const packagePath of runtimePackagePaths) {
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));

    assert.equal(
      manifest.dependencies?.['json-canonicalize'],
      '2.0.0',
      `${packagePath} must not resolve the incomplete json-canonicalize 2.0.1 artifact`
    );
  }
});
