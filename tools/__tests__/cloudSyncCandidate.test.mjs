import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import {
  applyCloudArtifactPins,
  cloudSyncBranchName,
  createCloudArtifactManifest,
} from '../lib/cloudSyncCandidate.mjs';

const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const artifacts = [
  {
    package: '@t3x-dev/core',
    version: '1.3.0',
    file: 't3x-dev-core-1.3.0.tgz',
    sha256: 'abc123',
  },
  {
    package: '@t3x-dev/transition',
    version: '0.1.0',
    file: 't3x-dev-transition-0.1.0.tgz',
    sha256: 'def456',
  },
];

test('builds an exact Core artifact manifest', () => {
  assert.deepEqual(
    createCloudArtifactManifest({
      sourceSha,
      generatedAt: '2026-08-26T00:00:00.000Z',
      artifacts,
    }),
    {
      schemaVersion: 1,
      source: {
        repository: 'https://github.com/t3x-dev/t3x-core.git',
        sha: sourceSha,
      },
      generatedAt: '2026-08-26T00:00:00.000Z',
      artifacts,
    }
  );
});

test('updates Cloud overrides and workspace dependency pins without removing unrelated overrides', () => {
  const rootPackage = {
    pnpm: {
      overrides: {
        ajv: '8.20.0',
        '@t3x-dev/old': 'file:vendor/t3x/old.tgz',
      },
    },
  };
  const apiPackage = {
    dependencies: {
      '@t3x-dev/core': '1.2.0',
      hono: '^4.0.0',
    },
  };
  const webPackage = {
    dependencies: {
      '@t3x-dev/transition': '0.0.9',
    },
  };

  applyCloudArtifactPins({
    rootPackage,
    workspacePackages: [apiPackage, webPackage],
    artifacts,
  });

  assert.deepEqual(rootPackage.pnpm.overrides, {
    ajv: '8.20.0',
    '@t3x-dev/core': 'file:vendor/t3x/t3x-dev-core-1.3.0.tgz',
    '@t3x-dev/transition': 'file:vendor/t3x/t3x-dev-transition-0.1.0.tgz',
  });
  assert.equal(apiPackage.dependencies['@t3x-dev/core'], '1.3.0');
  assert.equal(apiPackage.dependencies.hono, '^4.0.0');
  assert.equal(webPackage.dependencies['@t3x-dev/transition'], '0.1.0');
});

test('uses immutable Core SHA sync branch names', () => {
  assert.equal(cloudSyncBranchName(sourceSha), 'sync/core-0123456789ab');
});

test('rejects abbreviated Core SHAs in manifests and branch names', () => {
  assert.throws(
    () =>
      createCloudArtifactManifest({
        sourceSha: '0123456',
        generatedAt: '2026-08-26T00:00:00.000Z',
        artifacts,
      }),
    /full 40-character Git SHA/
  );
  assert.throws(() => cloudSyncBranchName('0123456'), /full 40-character Git SHA/);
});

test('Cloud sync workflow prepares a branch without creating a PR or deploying', () => {
  const root = new URL('../..', import.meta.url);
  const source = readFileSync(new URL('.github/workflows/cloud-sync-candidate.yml', root), 'utf8');
  const workflow = yaml.load(source);

  assert.deepEqual(workflow.on.push.branches, ['dev']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.match(source, /secrets\.CLOUD_SYNC_TOKEN/);
  assert.match(source, /ref: dev/);
  assert.doesNotMatch(source, /ref: main/);
  assert.match(source, /compare\/dev\.\.\./);
  assert.match(source, /git add apps database package\.json pnpm-lock\.yaml vendor\/t3x/);
  assert.match(source, /git push origin/);
  assert.doesNotMatch(source, /gh pr create|pulls\.create|vercel deploy|railway up/i);

  const syncTool = readFileSync(new URL('tools/sync-cloud-candidate.mjs', root), 'utf8');
  assert.match(syncTool, /sync-core-database-contract\.mjs/);
});
