import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPackageReleaseAssetUploadPlan,
  buildReleaseAssetUploadPlan,
} from '../lib/packageReleaseAssets.mjs';

const root = new URL('../..', import.meta.url);

test('builds a product release asset upload plan from product release notes', () => {
  const plan = buildReleaseAssetUploadPlan({
    packageRecords: [
      { name: '@t3x-dev/local', version: '0.4.2' },
      { name: '@t3x-dev/yops', version: '0.4.3' },
      { name: '@t3x-dev/yschema', version: '0.4.3' },
    ],
    assetPaths: [
      '/tmp/t3x-dev-local-0.4.2.tgz',
      '/tmp/t3x-dev-yops-0.4.3.tgz',
      '/tmp/t3x-dev-yschema-0.4.3.tgz',
    ],
    releaseRecords: [
      {
        tagName: 't3x-v0.5.0',
        body: `# T3X v0.5.0

## Package Releases

- \`@t3x-dev/local\`: 0.4.2
- \`@t3x-dev/yops\`: 0.4.3
- \`@t3x-dev/yschema\`: 0.4.3
`,
      },
    ],
    env: {
      GITHUB_TOKEN: 'github-token',
    },
  });

  assert.deepEqual(plan, {
    releaseTag: 't3x-v0.5.0',
    assetPaths: [
      '/tmp/t3x-dev-local-0.4.2.tgz',
      '/tmp/t3x-dev-yops-0.4.3.tgz',
      '/tmp/t3x-dev-yschema-0.4.3.tgz',
    ],
    args: [
      'release',
      'upload',
      't3x-v0.5.0',
      '/tmp/t3x-dev-local-0.4.2.tgz',
      '/tmp/t3x-dev-yops-0.4.3.tgz',
      '/tmp/t3x-dev-yschema-0.4.3.tgz',
      '--clobber',
    ],
    env: {
      GITHUB_TOKEN: 'github-token',
      GH_TOKEN: 'github-token',
    },
    skippedReason: null,
  });
});

test('prefers GH_TOKEN when uploading package release assets', () => {
  const plan = buildReleaseAssetUploadPlan({
    packageRecords: [{ name: '@t3x-dev/yops', version: '0.4.2' }],
    assetPaths: ['/tmp/t3x-dev-yops-0.4.2.tgz'],
    releaseRecords: [
      {
        tagName: 't3x-v0.5.0',
        body: `## Package Releases

- \`@t3x-dev/yops\`: 0.4.2
`,
      },
    ],
    env: {
      GH_TOKEN: 'gh-token',
      GITHUB_TOKEN: 'github-token',
    },
  });

  assert.equal(plan.env.GH_TOKEN, 'gh-token');
});

test('fails package release asset upload plans when no GitHub token is available', () => {
  assert.throws(
    () =>
      buildReleaseAssetUploadPlan({
        packageRecords: [{ name: '@t3x-dev/yops', version: '0.4.2' }],
        assetPaths: ['/tmp/t3x-dev-yops-0.4.2.tgz'],
        env: {},
      }),
    /GH_TOKEN or GITHUB_TOKEN is required/
  );
});

test('builds a yops package release asset upload plan', () => {
  const plan = buildPackageReleaseAssetUploadPlan({
    packageRecord: { name: '@t3x-dev/yops', version: '0.4.2' },
    assetPaths: ['/tmp/t3x-dev-yops-0.4.2.tgz', '/tmp/checksums.txt'],
    env: {
      GITHUB_TOKEN: 'github-token',
    },
  });

  assert.deepEqual(plan, {
    releaseTag: 't3x-yops-v0.4.2',
    releaseTitle: 't3x-yops v0.4.2',
    releaseNotes: 'Package release for @t3x-dev/yops@0.4.2.',
    assetPaths: ['/tmp/t3x-dev-yops-0.4.2.tgz', '/tmp/checksums.txt'],
    createArgs: [
      'release',
      'create',
      't3x-yops-v0.4.2',
      '--title',
      't3x-yops v0.4.2',
      '--notes',
      'Package release for @t3x-dev/yops@0.4.2.',
    ],
    uploadArgs: [
      'release',
      'upload',
      't3x-yops-v0.4.2',
      '/tmp/t3x-dev-yops-0.4.2.tgz',
      '/tmp/checksums.txt',
      '--clobber',
    ],
    env: {
      GITHUB_TOKEN: 'github-token',
      GH_TOKEN: 'github-token',
    },
  });
});

test('builds a yschema package release asset upload plan', () => {
  const plan = buildPackageReleaseAssetUploadPlan({
    packageRecord: { name: '@t3x-dev/yschema', version: '0.4.2' },
    assetPaths: ['/tmp/t3x-dev-yschema-0.4.2.tgz', '/tmp/checksums.txt'],
    env: {
      GITHUB_TOKEN: 'github-token',
    },
  });

  assert.equal(plan.releaseTag, 't3x-yschema-v0.4.2');
  assert.equal(plan.releaseTitle, 't3x-yschema v0.4.2');
  assert.deepEqual(plan.uploadArgs, [
    'release',
    'upload',
    't3x-yschema-v0.4.2',
    '/tmp/t3x-dev-yschema-0.4.2.tgz',
    '/tmp/checksums.txt',
    '--clobber',
  ]);
});

test('builds a local package release asset upload plan', () => {
  const plan = buildPackageReleaseAssetUploadPlan({
    packageRecord: { name: '@t3x-dev/local', version: '0.4.2' },
    assetPaths: ['/tmp/t3x-dev-local-0.4.2.tgz'],
    env: {
      GH_TOKEN: 'gh-token',
    },
  });

  assert.equal(plan.releaseTag, 't3x-local-v0.4.2');
  assert.equal(plan.releaseTitle, 't3x-local v0.4.2');
  assert.deepEqual(plan.uploadArgs, [
    'release',
    'upload',
    't3x-local-v0.4.2',
    '/tmp/t3x-dev-local-0.4.2.tgz',
    '--clobber',
  ]);
});

test('rejects package release assets when no product release declares the package versions', () => {
  assert.throws(
    () =>
      buildReleaseAssetUploadPlan({
        packageRecords: [
          { name: '@t3x-dev/local', version: '0.4.2' },
          { name: '@t3x-dev/yops', version: '0.4.3' },
          { name: '@t3x-dev/yschema', version: '0.4.3' },
        ],
        assetPaths: [
          '/tmp/t3x-dev-local-0.4.2.tgz',
          '/tmp/t3x-dev-yops-0.4.3.tgz',
          '/tmp/t3x-dev-yschema-0.4.3.tgz',
        ],
        releaseRecords: [
          {
            tagName: 't3x-v0.5.0',
            body: `## Package Releases

- \`@t3x-dev/local\`: 0.4.2
- \`@t3x-dev/yops\`: 0.4.2
- \`@t3x-dev/yschema\`: 0.4.3
`,
          },
        ],
        env: {
          GH_TOKEN: 'gh-token',
        },
      }),
    /no product GitHub Release declares package releases/
  );
});

test('release workflow waits for the product release before uploading package assets', () => {
  const workflow = readText('.github/workflows/release.yml');

  assert.match(
    workflow,
    /needs:\n\s+- changeset-state\n\s+- product-release-record\n\s+- build-runtime/
  );
  assert.match(workflow, /needs\.product-release-record\.result == 'success'/);
});

function readText(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8');
}
