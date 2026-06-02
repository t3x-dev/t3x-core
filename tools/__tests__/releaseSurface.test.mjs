import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateReleaseSurface } from '../lib/releaseSurface.mjs';

const root = new URL('../..', import.meta.url);

function readText(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8');
}

test('release surface declares local and yops as the restricted alpha npm packages', () => {
  const result = validateReleaseSurface({ rootDir: root });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.npmPublishPackages, ['@t3x-dev/local', '@t3x-dev/yops']);
  assert.deepEqual(result.releaseMarkdownNpmPackages, ['@t3x-dev/local', '@t3x-dev/yops']);
  assert.equal(result.packagesByName.get('@t3x-dev/local')?.publish_state, 'applied');
  assert.equal(result.packagesByName.get('@t3x-dev/yops')?.publish_state, 'applied');
});

test('release surface keeps candidate packages restricted until promoted', () => {
  const result = validateReleaseSurface({ rootDir: root });

  assert.deepEqual(result.errors, []);
  assert.equal(result.packagesByName.get('@t3x-dev/local')?.access, 'restricted');
  assert.equal(result.packagesByName.get('@t3x-dev/yops')?.access, 'restricted');
  assert.equal(result.packagesByName.get('@t3x-dev/core')?.access, 'restricted');
  assert.equal(result.packagesByName.get('@t3x-dev/yschema')?.access, 'restricted');
  assert.equal(result.packagesByName.get('@t3x-dev/api-client')?.access, 'restricted');
  assert.equal(result.packagesByName.get('@t3x-dev/cli')?.access, 'restricted');
  assert.equal(result.packagesByName.get('@t3x-dev/mcp')?.access, 'restricted');
});

test('README mirrors the restricted alpha surface instead of the old broad package list', () => {
  const readme = readText('README.md');

  assert.match(
    readme,
    /restricted alpha npm release surface is limited to `@t3x-dev\/local`\s+and `@t3x-dev\/yops`/
  );
  assert.match(readme, /npx -p @t3x-dev\/local t3x-local start/);
  assert.doesNotMatch(readme, /public npm surface is centered on `@t3x-dev\/core`/);
});

test('CODEOWNERS protects release surface files', () => {
  const codeowners = readText('.github/CODEOWNERS');

  assert.match(codeowners, /^RELEASE\.md\s+@etht3x$/m);
  assert.match(codeowners, /^release\/surface\.yaml\s+@etht3x$/m);
  assert.match(codeowners, /^release\/surface\.schema\.json\s+@etht3x$/m);
  assert.match(codeowners, /^docs\/release\/\s+@etht3x$/m);
  assert.match(codeowners, /^docs\/contributing\/branch-protection\.md\s+@etht3x$/m);
});
