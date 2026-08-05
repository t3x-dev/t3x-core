import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { planMissingChangesets } from '../release-train/ensure-changesets.mjs';
import { buildPackagePlan, buildPullRequestBody } from '../release-train/prepare-release-pr.mjs';

const root = new URL('../..', import.meta.url);
const releaseSurface = {
  npmPublishPackages: ['@t3x-dev/local', '@t3x-dev/yops', '@t3x-dev/yschema'],
  packagesByName: new Map([
    ['@t3x-dev/local', { name: '@t3x-dev/local', path: 'apps/local' }],
    ['@t3x-dev/yops', { name: '@t3x-dev/yops', path: 'packages/yops' }],
    ['@t3x-dev/yschema', { name: '@t3x-dev/yschema', path: 'packages/yschema' }],
  ]),
};
const versionByPath = new Map([
  ['apps/local', '1.0.0'],
  ['packages/yops', '1.0.0'],
  ['packages/yschema', '1.0.0'],
]);
const changesetConfig = {
  fixed: [
    [
      '@t3x-dev/yops',
      '@t3x-dev/yschema',
      '@t3x-dev/core',
      '@t3x-dev/storage',
      '@t3x-dev/api',
      '@t3x-dev/api-client',
      '@t3x-dev/cli',
      '@t3x-dev/mcp',
      '@t3x-dev/local',
    ],
  ],
};

function changeset(name, entries) {
  return {
    name,
    entries,
  };
}

test('release train package mode requires the complete npm publish surface', () => {
  const plan = buildPackagePlan({
    changesetConfig,
    changesets: [
      changeset('.changeset/yschema-only.md', [{ packageName: '@t3x-dev/yschema', bump: 'patch' }]),
    ],
    mode: 'package',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.match(plan.diagnostics.join('\n'), /missing: @t3x-dev\/local, @t3x-dev\/yops/);
});

test('release train estimates fixed package versions from the highest surface bump', () => {
  const plan = buildPackagePlan({
    changesetConfig,
    changesets: [
      changeset('.changeset/local.md', [{ packageName: '@t3x-dev/local', bump: 'patch' }]),
      changeset('.changeset/yops.md', [{ packageName: '@t3x-dev/yops', bump: 'minor' }]),
      changeset('.changeset/yschema.md', [{ packageName: '@t3x-dev/yschema', bump: 'patch' }]),
    ],
    mode: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.equal(plan.mode, 'package');
  assert.equal(plan.bump, 'minor');
  assert.match(plan.packageReleases, /`@t3x-dev\/local`: 1\.1\.0/);
  assert.match(plan.packageReleases, /`@t3x-dev\/yops`: 1\.1\.0/);
  assert.match(plan.packageReleases, /`@t3x-dev\/yschema`: 1\.1\.0/);
});

test('release train can generate minor changesets for a full-surface 1.1.0 package release', () => {
  const changesetPlan = planMissingChangesets({
    changesetConfig,
    changesets: [],
    mode: 'package',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: '1.1.0',
  });
  const packagePlan = buildPackagePlan({
    changesetConfig,
    changesets: changesetPlan.changesets,
    mode: 'package',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.equal(changesetPlan.generatedChangesets.length, 3);
  assert.deepEqual(
    changesetPlan.generatedChangesets.map((changeset) => changeset.entries[0]),
    [
      { packageName: '@t3x-dev/local', bump: 'minor' },
      { packageName: '@t3x-dev/yops', bump: 'minor' },
      { packageName: '@t3x-dev/yschema', bump: 'minor' },
    ]
  );
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/local`: 1\.1\.0/);
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/yops`: 1\.1\.0/);
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/yschema`: 1\.1\.0/);
});

test('release train auto-generates patch changesets when dev has release changes', () => {
  const changesetPlan = planMissingChangesets({
    changesetConfig,
    changesets: [],
    hasReleaseChanges: true,
    mode: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });
  const packagePlan = buildPackagePlan({
    changesetConfig,
    changesets: changesetPlan.changesets,
    mode: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.equal(changesetPlan.generatedChangesets.length, 3);
  assert.deepEqual(
    changesetPlan.generatedChangesets.map((changeset) => changeset.entries[0]),
    [
      { packageName: '@t3x-dev/local', bump: 'patch' },
      { packageName: '@t3x-dev/yops', bump: 'patch' },
      { packageName: '@t3x-dev/yschema', bump: 'patch' },
    ]
  );
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/local`: 1\.0\.1/);
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/yops`: 1\.0\.1/);
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/yschema`: 1\.0\.1/);
});

test('release train auto mode uses an explicit target version to choose the bump', () => {
  const changesetPlan = planMissingChangesets({
    changesetConfig,
    changesets: [],
    hasReleaseChanges: true,
    mode: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: '1.1.0',
  });

  assert.equal(changesetPlan.generatedChangesets.length, 3);
  assert.deepEqual(
    changesetPlan.generatedChangesets.map((changeset) => changeset.entries[0]),
    [
      { packageName: '@t3x-dev/local', bump: 'minor' },
      { packageName: '@t3x-dev/yops', bump: 'minor' },
      { packageName: '@t3x-dev/yschema', bump: 'minor' },
    ]
  );
});

test('release train rejects target versions that cannot be produced by one bump', () => {
  assert.throws(
    () =>
      planMissingChangesets({
        changesetConfig,
        changesets: [],
        mode: 'package',
        readVersion: (packagePath) => versionByPath.get(packagePath),
        releaseSurface,
        requestedVersion: '1.0.2',
      }),
    /cannot be produced from 1\.0\.0/
  );
});

test('release train uses internal fixed-package changesets when choosing the public package bump', () => {
  const changesetPlan = planMissingChangesets({
    changesetConfig,
    changesets: [
      changeset('.changeset/core-major.md', [{ packageName: '@t3x-dev/core', bump: 'major' }]),
    ],
    mode: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });
  const packagePlan = buildPackagePlan({
    changesetConfig,
    changesets: changesetPlan.changesets,
    mode: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.deepEqual(
    changesetPlan.generatedChangesets.map((changeset) => changeset.entries[0]),
    [
      { packageName: '@t3x-dev/local', bump: 'major' },
      { packageName: '@t3x-dev/yops', bump: 'major' },
      { packageName: '@t3x-dev/yschema', bump: 'major' },
    ]
  );
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/local`: 2\.0\.0/);
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/yops`: 2\.0\.0/);
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/yschema`: 2\.0\.0/);
});

test('release train body adds release surface review text for protected surface files', () => {
  const body = buildPullRequestBody({
    baseRef: 'origin/main',
    changesets: [],
    changedFiles: ['release/surface.yaml'],
    commits: [],
    headRef: 'origin/dev',
    packagePlan: {
      diagnostics: [],
      mode: 'code-only',
      packageReleases: '- None',
    },
    version: '1.0.1',
  });

  assert.match(body, /## Release Surface/);
  assert.match(body, /`release\/surface\.yaml`/);
  assert.match(body, /Owner review must confirm/);
});

test('release train workflow supports weekly scheduled auto preparation', () => {
  const workflow = readFileSync(new URL('.github/workflows/release-train.yml', root), 'utf8');

  assert.match(workflow, /cron: "0 2 \* \* 5"/);
  assert.match(
    workflow,
    /github\.event_name != 'schedule' \|\| vars\.RELEASE_TRAIN_PAUSED != 'true'/
  );
  assert.match(workflow, /RELEASE_TRAIN_VERSION/);
  assert.match(workflow, /github\.event_name == 'schedule' && 'auto'/);
  assert.match(
    workflow,
    /RELEASE_TRAIN_DRY_RUN: \$\{\{ github\.event_name == 'schedule' && 'false'/
  );
  assert.match(workflow, /RELEASE_TRAIN_DRAFT: \$\{\{ github\.event_name == 'schedule' && 'true'/);
  assert.match(workflow, /args\+=\(--draft\)/);
  assert.match(workflow, /git fetch origin main dev/);
  assert.match(workflow, /pnpm check:release-docs-alignment/);
});
