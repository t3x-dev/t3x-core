import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizeVersionInput as normalizeChangesetVersionInput,
  normalizePackageSelectionInput,
  planMissingChangesets,
} from '../release-train/ensure-changesets.mjs';
import {
  buildPackagePlan,
  buildPullRequestBody,
  isReleasePlanNoOp,
  normalizeCommandOutput,
  normalizeVersionInput as normalizePrepareVersionInput,
  resolveVersion,
} from '../release-train/prepare-release-pr.mjs';

const root = new URL('../..', import.meta.url);
const releaseSurface = {
  npmPublishPackages: [
    '@t3x-dev/local',
    '@t3x-dev/yops',
    '@t3x-dev/transition',
    '@t3x-dev/yschema',
  ],
  pausedReleaseTrainPackages: ['@t3x-dev/local'],
  releaseTrainPackages: ['@t3x-dev/yops', '@t3x-dev/transition', '@t3x-dev/yschema'],
  packagesByName: new Map([
    ['@t3x-dev/local', { name: '@t3x-dev/local', path: 'apps/local' }],
    ['@t3x-dev/yops', { name: '@t3x-dev/yops', path: 'packages/yops' }],
    ['@t3x-dev/transition', { name: '@t3x-dev/transition', path: 'packages/transition' }],
    ['@t3x-dev/yschema', { name: '@t3x-dev/yschema', path: 'packages/yschema' }],
  ]),
};
const versionByPath = new Map([
  ['apps/local', '1.0.0'],
  ['packages/yops', '1.0.0'],
  ['packages/transition', '0.1.0'],
  ['packages/yschema', '1.0.0'],
]);

function changeset(name, entries) {
  return {
    name,
    entries,
  };
}

test('release train package mode allows a single active package', () => {
  const plan = buildPackagePlan({
    changesets: [
      changeset('.changeset/yschema-only.md', [{ packageName: '@t3x-dev/yschema', bump: 'patch' }]),
    ],
    mode: 'package',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.deepEqual(plan.diagnostics, []);
  assert.equal(plan.mode, 'package');
  assert.equal(plan.packageReleases, '- `@t3x-dev/yschema`: 1.0.1');
});

test('release train estimates active package versions independently', () => {
  const plan = buildPackagePlan({
    changesets: [
      changeset('.changeset/yops.md', [{ packageName: '@t3x-dev/yops', bump: 'minor' }]),
      changeset('.changeset/transition.md', [
        { packageName: '@t3x-dev/transition', bump: 'major' },
      ]),
      changeset('.changeset/yschema.md', [{ packageName: '@t3x-dev/yschema', bump: 'patch' }]),
    ],
    mode: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.equal(plan.mode, 'package');
  assert.match(plan.packageReleases, /`@t3x-dev\/yops`: 1\.1\.0/);
  assert.match(plan.packageReleases, /`@t3x-dev\/transition`: 1\.0\.0/);
  assert.match(plan.packageReleases, /`@t3x-dev\/yschema`: 1\.0\.1/);
});

test('release train includes current-version first publishes beside changeset bumps', () => {
  const plan = buildPackagePlan({
    changesets: [
      changeset('.changeset/yops.md', [{ packageName: '@t3x-dev/yops', bump: 'minor' }]),
      changeset('.changeset/yschema.md', [{ packageName: '@t3x-dev/yschema', bump: 'minor' }]),
    ],
    firstPublishPackageNames: ['@t3x-dev/transition'],
    mode: 'package',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.deepEqual(plan.diagnostics, []);
  assert.equal(plan.mode, 'package');
  assert.match(plan.packageReleases, /`@t3x-dev\/yops`: 1\.1\.0/);
  assert.match(plan.packageReleases, /`@t3x-dev\/yschema`: 1\.1\.0/);
  assert.match(plan.packageReleases, /`@t3x-dev\/transition`: 0\.1\.0 \(first publish\)/);
});

test('release train can generate minor changesets for selected active packages', () => {
  const changesetPlan = planMissingChangesets({
    changesets: [],
    mode: 'package',
    packageBump: 'minor',
    packageSelection: 'yops,transition',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });
  const packagePlan = buildPackagePlan({
    changesets: changesetPlan.changesets,
    mode: 'package',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.equal(changesetPlan.generatedChangesets.length, 2);
  assert.deepEqual(
    changesetPlan.generatedChangesets.map((changeset) => changeset.entries[0]),
    [
      { packageName: '@t3x-dev/yops', bump: 'minor' },
      { packageName: '@t3x-dev/transition', bump: 'minor' },
    ]
  );
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/yops`: 1\.1\.0/);
  assert.match(packagePlan.packageReleases, /`@t3x-dev\/transition`: 0\.2\.0/);
  assert.doesNotMatch(packagePlan.packageReleases, /@t3x-dev\/yschema/);
});

test('release train package mode with auto selection generates all active package changesets', () => {
  const changesetPlan = planMissingChangesets({
    changesets: [],
    hasReleaseChanges: true,
    mode: 'package',
    packageBump: 'patch',
    packageSelection: 'auto',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });

  assert.deepEqual(
    changesetPlan.generatedChangesets.map((changeset) => changeset.entries[0]),
    [
      { packageName: '@t3x-dev/yops', bump: 'patch' },
      { packageName: '@t3x-dev/transition', bump: 'patch' },
      { packageName: '@t3x-dev/yschema', bump: 'patch' },
    ]
  );
});

test('release train code-only mode does not generate changesets for scheduled dev changes', () => {
  const changesetPlan = planMissingChangesets({
    changesets: [],
    hasReleaseChanges: true,
    mode: 'code-only',
    packageSelection: 'none',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });
  const packagePlan = buildPackagePlan({
    changesets: changesetPlan.changesets,
    mode: 'code-only',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.equal(changesetPlan.generatedChangesets.length, 0);
  assert.equal(packagePlan.mode, 'code-only');
  assert.equal(packagePlan.packageReleases, '- None');
});

test('release train auto product version follows product release tags for code-only releases', () => {
  const version = resolveVersion({
    packagePlan: {
      diagnostics: [],
      mode: 'code-only',
      packageReleases: '- None',
    },
    readProductVersions: () => ['1.0.0', '1.0.1'],
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });

  assert.equal(version, '1.0.2');
});

test('release train auto product version is independent from package targets', () => {
  const version = resolveVersion({
    packagePlan: {
      diagnostics: [],
      mode: 'package',
      packageReleases: '- `@t3x-dev/yops`: 1.1.0',
      packageVersions: [{ name: '@t3x-dev/yops', version: '1.1.0' }],
    },
    readProductVersions: () => ['1.0.2'],
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });

  assert.equal(version, '1.0.3');
});

test('release train manual product version does not imply npm package versions', () => {
  const changesetPlan = planMissingChangesets({
    changesets: [],
    hasReleaseChanges: true,
    mode: 'package',
    packageBump: 'patch',
    packageSelection: 'yops',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
    requestedVersion: 'auto',
  });
  const packagePlan = buildPackagePlan({
    changesets: changesetPlan.changesets,
    mode: 'package',
    readVersion: (packagePath) => versionByPath.get(packagePath),
    releaseSurface,
  });

  assert.equal(packagePlan.packageReleases, '- `@t3x-dev/yops`: 1.0.1');
});

test('release train normalizes fullwidth manual version and package selection input', () => {
  assert.equal(normalizePrepareVersionInput('v1。1．0'), '1.1.0');
  assert.equal(normalizeChangesetVersionInput(' 1｡2。3 '), '1.2.3');
  assert.equal(normalizePrepareVersionInput(' auto '), 'auto');
  assert.equal(normalizePackageSelectionInput(' yops, transition '), 'yops, transition');
});

test('release train command output helper tolerates inherited stdio', () => {
  assert.equal(normalizeCommandOutput(' release/1.2.0\n'), 'release/1.2.0');
  assert.equal(normalizeCommandOutput(null), '');
});

test('release train first-publish selection is release-worthy without file changes', () => {
  assert.equal(isReleasePlanNoOp(), true);
  assert.equal(
    isReleasePlanNoOp({
      changesets: [],
      effectiveChangedFiles: [],
      firstPublishPackageNames: ['@t3x-dev/transition'],
    }),
    false
  );
});

test('release train rejects package target versions that cannot be produced by one bump', () => {
  assert.throws(
    () =>
      planMissingChangesets({
        changesets: [],
        mode: 'package',
        packageSelection: 'yops',
        readVersion: (packagePath) => versionByPath.get(packagePath),
        releaseSurface,
        requestedVersion: '1.0.2',
      }),
    /cannot be produced from 1\.0\.0/
  );
});

test('release train rejects paused local package selection', () => {
  assert.throws(
    () =>
      planMissingChangesets({
        changesets: [],
        mode: 'package',
        packageSelection: 'local',
        readVersion: (packagePath) => versionByPath.get(packagePath),
        releaseSurface,
        requestedVersion: 'auto',
      }),
    /@t3x-dev\/local is paused/
  );
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

test('release train workflow supports scheduled code-only preparation and manual package inputs', () => {
  const workflow = readFileSync(new URL('.github/workflows/release-train.yml', root), 'utf8');

  assert.match(workflow, /cron: "0 2 \* \* 5"/);
  assert.match(
    workflow,
    /github\.event_name != 'schedule' \|\| vars\.RELEASE_TRAIN_PAUSED != 'true'/
  );
  assert.match(workflow, /RELEASE_TRAIN_VERSION/);
  assert.match(workflow, /github\.event_name == 'schedule' && 'auto'/);
  assert.match(workflow, /RELEASE_TRAIN_MODE/);
  assert.match(workflow, /default: code-only/);
  assert.match(workflow, /github\.event_name == 'schedule' && 'code-only'/);
  assert.match(workflow, /RELEASE_TRAIN_PACKAGES/);
  assert.match(workflow, /github\.event_name == 'schedule' && 'none'/);
  assert.match(workflow, /RELEASE_TRAIN_PACKAGE_BUMP/);
  assert.match(workflow, /--package-bump/);
  assert.match(workflow, /first_publish_packages/);
  assert.match(workflow, /RELEASE_TRAIN_FIRST_PUBLISH_PACKAGES/);
  assert.match(workflow, /--first-publish-packages/);
  assert.match(
    workflow,
    /RELEASE_TRAIN_DRY_RUN: \$\{\{ github\.event_name == 'schedule' && 'false'/
  );
  assert.match(workflow, /RELEASE_TRAIN_DRAFT: \$\{\{ github\.event_name == 'schedule' && 'true'/);
  assert.match(workflow, /args\+=\(--draft\)/);
  assert.match(workflow, /git fetch origin main dev --tags/);
  assert.match(workflow, /pnpm check:release-docs-alignment/);
});
