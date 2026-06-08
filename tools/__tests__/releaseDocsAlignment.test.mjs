import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateReleaseDocsAlignment } from '../lib/releaseDocsAlignment.mjs';

test('release-facing docs stay aligned with fixed package version and release surface', async () => {
  const result = await validateReleaseDocsAlignment();
  const packageJson = JSON.parse(await readFile('packages/yops/package.json', 'utf8'));

  assert.deepEqual(result.errors, []);
  assert.equal(result.expectedVersion, packageJson.version);
});
