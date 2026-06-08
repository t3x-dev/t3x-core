import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
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

  assert.match(readme, /The current npm release surface is intentionally narrow/);
  assert.match(readme, /\| \[`@t3x-dev\/local`\]\(apps\/local\/\) \| restricted alpha \|/);
  assert.match(readme, /\| \[`@t3x-dev\/yops`\]\(packages\/yops\/\) \| restricted alpha \|/);
  assert.match(readme, /npx -p @t3x-dev\/local t3x-local start/);
  assert.doesNotMatch(readme, /public npm surface is centered on `@t3x-dev\/core`/);
});

test('CODEOWNERS protects release surface files', () => {
  const codeowners = readText('.github/CODEOWNERS');

  assert.match(codeowners, /^RELEASE\.md\s+@etht3x$/m);
  assert.match(codeowners, /^docs\/stability\.md\s+@etht3x$/m);
  assert.match(codeowners, /^release\/surface\.yaml\s+@etht3x$/m);
  assert.match(codeowners, /^release\/surface\.schema\.json\s+@etht3x$/m);
  assert.match(codeowners, /^docs\/release\/\s+@etht3x$/m);
  assert.match(codeowners, /^docs\/contributing\/branch-protection\.md\s+@etht3x$/m);
});

test('release surface requires README files for readme_required packages', () => {
  const rootDir = makeTempReleaseRoot({
    readme: null,
  });

  const result = validateReleaseSurface({ rootDir });

  assert.deepEqual(result.errors, [
    '@t3x-dev/sample requires a README at packages/sample/README.md',
  ]);
});

test('release surface reports package README missing required sections case-insensitively', () => {
  const rootDir = makeTempReleaseRoot({
    readme: `# Sample

## WHAT

Sample package.

## install

\`\`\`bash
npm install @t3x-dev/sample
\`\`\`
`,
  });

  const result = validateReleaseSurface({ rootDir });

  assert.deepEqual(result.errors, [
    '@t3x-dev/sample README missing required sections: why, sample',
  ]);
});

test('release surface warns for pending access mismatches', () => {
  const rootDir = makeTempReleaseRoot({
    entry: {
      publish_state: 'pending',
      access: 'public',
    },
    packageJson: {
      publishConfig: {
        access: 'restricted',
      },
    },
  });

  const result = validateReleaseSurface({ rootDir });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    '@t3x-dev/sample publishConfig.access is restricted, pending target is public',
  ]);
});

test('release surface fails for applied access mismatches', () => {
  const rootDir = makeTempReleaseRoot({
    entry: {
      publish_state: 'applied',
      access: 'public',
    },
    packageJson: {
      publishConfig: {
        access: 'restricted',
      },
    },
  });

  const result = validateReleaseSurface({ rootDir });

  assert.deepEqual(result.errors, [
    '@t3x-dev/sample publishConfig.access is restricted, expected public because publish_state is applied',
  ]);
});

function makeTempReleaseRoot({ entry = {}, packageJson = {}, readme = defaultReadme() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 't3x-release-surface-'));
  const packageDir = join(dir, 'packages/sample');
  mkdirSync(packageDir, { recursive: true });
  mkdirSync(join(dir, 'release'), { recursive: true });

  const packageName = '@t3x-dev/sample';
  const surfaceEntry = {
    name: packageName,
    path: 'packages/sample',
    access: 'restricted',
    publish_state: 'applied',
    npm_publish: true,
    stability_tier: 'alpha',
    readme_required: true,
    api_extractor: false,
    why: 'Fixture package.',
    ...entry,
  };

  writeFileSync(
    join(packageDir, 'package.json'),
    `${JSON.stringify(
      {
        name: packageName,
        publishConfig: {
          access: 'restricted',
        },
        ...packageJson,
      },
      null,
      2
    )}\n`
  );

  if (readme !== null) {
    writeFileSync(join(packageDir, 'README.md'), readme);
  }

  writeFileSync(
    join(dir, 'release/surface.yaml'),
    `version: 1
packages:
  - name: "${surfaceEntry.name}"
    path: ${surfaceEntry.path}
    access: ${surfaceEntry.access}
    publish_state: ${surfaceEntry.publish_state}
    npm_publish: ${surfaceEntry.npm_publish}
    stability_tier: ${surfaceEntry.stability_tier}
    readme_required: ${surfaceEntry.readme_required}
    api_extractor: ${surfaceEntry.api_extractor}
    why: ${surfaceEntry.why}
`
  );
  writeFileSync(
    join(dir, 'RELEASE.md'),
    `# Release

## NPM Release Packages

| Package | Path | Access | Tier | Publish State | Why Published |
|---|---|---|---|---|---|
| \`${packageName}\` | \`packages/sample\` | restricted | alpha | applied | Fixture package. |
`
  );

  return pathToFileURL(`${dir}/`);
}

function defaultReadme() {
  return `# Sample

## What

Sample package.

## Why

It is used by release surface tests.

## Install

\`\`\`bash
npm install @t3x-dev/sample
\`\`\`

## Sample

\`\`\`bash
node sample.js
\`\`\`
`;
}
