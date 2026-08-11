import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseChangesetPackages,
  parsePackageReleaseEntries,
  parsePackageReleaseSection,
  validateProtectedSurfaceChange,
  validateReleasePr,
} from '../lib/releasePr.mjs';

const localChangeset = {
  name: 'fresh-local-runtime.md',
  packages: ['@t3x-dev/local'],
};

const yopsChangeset = {
  name: 'refresh-yops-package.md',
  packages: ['@t3x-dev/yops'],
};

const transitionChangeset = {
  name: 'publish-transition-package.md',
  packages: ['@t3x-dev/transition'],
};

const yschemaChangeset = {
  name: 'promote-yschema-package.md',
  packages: ['@t3x-dev/yschema'],
};

const coreChangeset = {
  name: 'internal-core.md',
  packages: ['@t3x-dev/core'],
};

const releaseSurfacePackages = ['@t3x-dev/yops', '@t3x-dev/transition', '@t3x-dev/yschema'];
const pausedReleaseSurfacePackages = ['@t3x-dev/local'];
const activePackageChangesets = [yopsChangeset, transitionChangeset, yschemaChangeset];
const currentPackageVersions = new Map([
  ['@t3x-dev/yops', '1.0.0'],
  ['@t3x-dev/transition', '0.1.0'],
  ['@t3x-dev/yschema', '1.0.0'],
]);

function validateReleasePrWithSurface(options) {
  return validateReleasePr({
    currentPackageVersions,
    pausedReleaseSurfacePackages,
    releaseSurfacePackages,
    ...options,
  });
}

const validReleaseBody = `## Product Release

T3X product release version: \`0.4.0\`

## Included Changes

- Promote reviewed dev changes into the product release.

## Package Releases

- \`@t3x-dev/yops\`: 0.4.1
- \`@t3x-dev/transition\`: 0.1.0
- \`@t3x-dev/yschema\`: 0.4.1

## Release Notes

- Product release 0.4.0 includes public package fixes.
`;

const validYopsOnlyReleaseBody = `## Product Release

T3X product release version: \`0.4.0\`

## Included Changes

- Promote reviewed dev changes into the product release.

## Package Releases

- \`@t3x-dev/yops\`: 0.4.1

## Release Notes

- Product release 0.4.0 includes YOps fixes.
`;

const validFirstPublishReleaseBody = `## Product Release

T3X product release version: \`1.1.0\`

## Included Changes

- Promote reviewed dev changes into the product release.

## Package Releases

- \`@t3x-dev/yops\`: 1.1.0
- \`@t3x-dev/transition\`: 0.1.0 (first publish)
- \`@t3x-dev/yschema\`: 1.1.0

## Release Notes

- Product release 1.1.0 publishes the selected package train.
`;

const validCodeOnlyReleaseBody = `## Product Release

T3X product release version: \`0.4.1\`

## Included Changes

- Tighten release PR policy checks.

## Package Releases

- None

## Release Notes

- T3X 0.4.1 tightens release PR policy checks.
`;

function withPackageReleaseEntries(entries) {
  return validReleaseBody.replace(
    '- `@t3x-dev/yops`: 0.4.1\n- `@t3x-dev/transition`: 0.1.0\n- `@t3x-dev/yschema`: 0.4.1',
    entries
  );
}

test('allows a product release PR with a selected active package subset', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validYopsOnlyReleaseBody,
    changesetFiles: [yopsChangeset],
  });

  assert.deepEqual(result.errors, []);
});

test('allows a product release PR with matching active package release entries', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody,
    changesetFiles: activePackageChangesets,
  });

  assert.deepEqual(result.errors, []);
});

test('allows a first-publish package entry without a changeset when it uses the current version', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/1.1.0',
    body: validFirstPublishReleaseBody,
    changesetFiles: [yopsChangeset, yschemaChangeset],
  });

  assert.deepEqual(result.errors, []);
});

test('allows a code-only product release with no package publish', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validCodeOnlyReleaseBody,
    changesetFiles: [],
  });

  assert.deepEqual(result.errors, []);
});

test('allows code-only product release with internal-only changesets', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validCodeOnlyReleaseBody,
    changesetFiles: [coreChangeset],
  });

  assert.deepEqual(result.errors, []);
});

test('ignores ordinary development PRs into dev', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'dev',
    headBranch: 'feature/example',
    body: '',
  });

  assert.deepEqual(result.errors, []);
});

test('rejects ordinary feature branches targeting main', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'feature/example',
    body: validReleaseBody,
    changesetFiles: activePackageChangesets,
  });

  assert.match(result.errors.join('\n'), /must come from release\/x\.y\.z/);
});

test('rejects release branch and body version mismatch', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validReleaseBody,
    changesetFiles: activePackageChangesets,
  });

  assert.match(result.errors.join('\n'), /does not match PR body product release version/);
});

test('rejects missing package release entries', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: withPackageReleaseEntries('-'),
    changesetFiles: activePackageChangesets,
  });

  assert.match(
    result.errors.join('\n'),
    /Package Releases section with "- None" or package entries/
  );
});

test('rejects package releases none when active changesets exist', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: withPackageReleaseEntries('- None'),
    changesetFiles: activePackageChangesets,
  });

  assert.match(result.errors.join('\n'), /Package Releases is "None"/);
});

test('rejects package release entries without changeset files', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody,
    changesetFiles: [],
  });

  assert.match(result.errors.join('\n'), /Package Releases lists packages/);
});

test('rejects paused local package release entries', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: withPackageReleaseEntries('- `@t3x-dev/local`: 0.4.1'),
    changesetFiles: [localChangeset],
  });

  assert.match(result.errors.join('\n'), /@t3x-dev\/local is paused/);
});

test('rejects package release entries with changeset bump types instead of versions', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: withPackageReleaseEntries(
      '- `@t3x-dev/yops`: patch\n- `@t3x-dev/transition`: minor\n- `@t3x-dev/yschema`: patch'
    ),
    changesetFiles: activePackageChangesets,
  });

  assert.match(result.errors.join('\n'), /must use concrete package versions/);
  assert.match(result.errors.join('\n'), /@t3x-dev\/yops/);
  assert.match(result.errors.join('\n'), /@t3x-dev\/transition/);
  assert.match(result.errors.join('\n'), /@t3x-dev\/yschema/);
});

test('rejects code-only release when active changeset files exist', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validCodeOnlyReleaseBody,
    changesetFiles: [yopsChangeset],
  });

  assert.match(result.errors.join('\n'), /Package Releases is "None"/);
});

test('rejects package release entry without matching changeset target', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody,
    changesetFiles: [yopsChangeset],
  });

  assert.match(result.errors.join('\n'), /Package Releases lists @t3x-dev\/transition/);
});

test('rejects a first-publish package entry when the version does not match the current package', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/1.1.0',
    body: validFirstPublishReleaseBody.replace(
      '- `@t3x-dev/transition`: 0.1.0 (first publish)',
      '- `@t3x-dev/transition`: 0.2.0 (first publish)'
    ),
    changesetFiles: [yopsChangeset, yschemaChangeset],
  });

  assert.match(result.errors.join('\n'), /Package Releases lists @t3x-dev\/transition/);
});

test('rejects active changeset target missing from Package Releases', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validYopsOnlyReleaseBody,
    changesetFiles: [yopsChangeset, yschemaChangeset],
  });

  assert.match(result.errors.join('\n'), /changeset targets @t3x-dev\/yschema/);
});

test('allows changesets version package PRs into main', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'changeset-release/main',
    body: '',
  });

  assert.deepEqual(result.errors, []);
});

test('parses package names from changeset frontmatter', () => {
  assert.deepEqual(
    parseChangesetPackages(`---
"@t3x-dev/yops": minor
'@t3x-dev/transition': minor
"@t3x-dev/yschema": patch
---

Release package changes.
`),
    ['@t3x-dev/yops', '@t3x-dev/transition', '@t3x-dev/yschema']
  );
});

test('parses package release section', () => {
  assert.deepEqual(
    parsePackageReleaseSection(`- \`@t3x-dev/yops\`: 0.4.1
- \`@t3x-dev/transition\`: 0.1.0
- \`@t3x-dev/yschema\`: 0.4.1`),
    {
      none: false,
      packages: ['@t3x-dev/yops', '@t3x-dev/transition', '@t3x-dev/yschema'],
      invalidVersionPackages: [],
      hasEntries: true,
    }
  );
  assert.deepEqual(parsePackageReleaseSection('- None'), {
    none: true,
    packages: [],
    invalidVersionPackages: [],
    hasEntries: true,
  });
});

test('parses first-publish package release entries', () => {
  assert.deepEqual(parsePackageReleaseEntries(`- \`@t3x-dev/transition\`: 0.1.0 (first publish)`), [
    {
      firstPublish: true,
      note: '(first publish)',
      packageName: '@t3x-dev/transition',
      version: '0.1.0',
    },
  ]);
});

test('validates multi-line package release sections against changesets', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody,
    changesetFiles: activePackageChangesets,
  });

  assert.deepEqual(result.errors, []);
});

test('requires release surface explanation when protected surface files change', () => {
  const result = validateProtectedSurfaceChange({
    changedFiles: ['release/surface.yaml'],
    body: `## Summary

- Adjust package surface.
`,
  });

  assert.deepEqual(result.errors, [
    'surface changes to release/surface.yaml require a Stability or Release Surface explanation in the PR body.',
  ]);
});

test('allows protected surface changes with an explicit release surface explanation', () => {
  const result = validateProtectedSurfaceChange({
    changedFiles: ['docs/stability.md'],
    body: `## Summary

- Adjust stability wording.

## Release Surface

- Explains why the protected surface changed.
`,
  });

  assert.deepEqual(result.errors, []);
});

test('rejects placeholder release surface explanations', () => {
  const result = validateProtectedSurfaceChange({
    changedFiles: ['release/surface.yaml'],
    body: `## Release Surface

-
`,
  });

  assert.deepEqual(result.errors, [
    'surface changes to release/surface.yaml require a Stability or Release Surface explanation in the PR body.',
  ]);
});
