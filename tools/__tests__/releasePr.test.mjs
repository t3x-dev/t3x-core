import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseChangesetPackages,
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

const releaseSurfacePackages = ['@t3x-dev/local', '@t3x-dev/yops'];

function validateReleasePrWithSurface(options) {
  return validateReleasePr({
    releaseSurfacePackages,
    ...options,
  });
}

const validReleaseBody = `## Product Release

T3X product release version: \`0.4.0\`

## Included Changes

- Promote reviewed dev changes into the product release.

## Package Releases

- \`@t3x-dev/local\`: patch

## Release Notes

- Product release 0.4.0 includes local runtime fixes.
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

test('allows a product release PR with matching release branch and package release entry', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody,
    changesetFiles: [localChangeset],
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
    changesetFiles: [localChangeset],
  });

  assert.match(result.errors.join('\n'), /must come from release\/x\.y\.z/);
});

test('rejects release branch and body version mismatch', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validReleaseBody,
    changesetFiles: [localChangeset],
  });

  assert.match(result.errors.join('\n'), /does not match PR body product release version/);
});

test('rejects missing package release entries', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody.replace('- `@t3x-dev/local`: patch', '-'),
    changesetFiles: [localChangeset],
  });

  assert.match(
    result.errors.join('\n'),
    /Package Releases section with "- None" or package entries/
  );
});

test('rejects package releases none when changesets exist', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody.replace('- `@t3x-dev/local`: patch', '- None'),
    changesetFiles: [localChangeset],
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

test('rejects code-only release when changeset files exist', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validCodeOnlyReleaseBody,
    changesetFiles: [localChangeset],
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

  assert.match(result.errors.join('\n'), /Package Releases lists @t3x-dev\/local/);
  assert.match(result.errors.join('\n'), /changeset targets @t3x-dev\/yops/);
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
"@t3x-dev/local": patch
'@t3x-dev/yops': minor
---

Release package changes.
`),
    ['@t3x-dev/local', '@t3x-dev/yops']
  );
});

test('parses package release section', () => {
  assert.deepEqual(
    parsePackageReleaseSection(`- \`@t3x-dev/local\`: patch
- \`@t3x-dev/yops\`: minor`),
    {
      none: false,
      packages: ['@t3x-dev/local', '@t3x-dev/yops'],
      hasEntries: true,
    }
  );
  assert.deepEqual(parsePackageReleaseSection('- None'), {
    none: true,
    packages: [],
    hasEntries: true,
  });
});

test('validates multi-line package release sections against changesets', () => {
  const result = validateReleasePrWithSurface({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody.replace(
      '- `@t3x-dev/local`: patch',
      '- `@t3x-dev/local`: patch\n- `@t3x-dev/yops`: patch'
    ),
    changesetFiles: [localChangeset, yopsChangeset],
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
