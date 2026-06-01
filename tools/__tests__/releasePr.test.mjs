import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReleasePr } from '../lib/releasePr.mjs';

const validReleaseBody = `## Product Release

T3X product release version: \`0.4.0\`

## Included Changes

- Promote reviewed dev changes into the product release.

## Release Impact

- [x] Changesets included for public package changes
- [ ] No package publish intended
- [x] Version/package PR expected after this merges to \`main\`
- [x] Publish expected after the version/package PR merges

Public packages affected:

- [x] \`@t3x-dev/local\`
- [ ] \`@t3x-dev/yops\`
- [ ] None

## Release Notes

- Product release 0.4.0 includes local runtime fixes.
`;

const validCodeOnlyReleaseBody = `## Product Release

T3X product release version: \`0.4.1\`

## Included Changes

- Tighten release PR policy checks.

## Release Impact

- [ ] Changesets included for public package changes
- [x] No package publish intended

Public packages affected:

- [ ] \`@t3x-dev/local\`
- [ ] \`@t3x-dev/yops\`
- [x] None

## Release Notes

- T3X 0.4.1 tightens release PR policy checks.

Package releases:

- None
`;

test('allows a product release PR with matching release branch and package intent', () => {
  const result = validateReleasePr({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody,
  });

  assert.deepEqual(result.errors, []);
});

test('allows a code-only product release with no package publish', () => {
  const result = validateReleasePr({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validCodeOnlyReleaseBody,
  });

  assert.deepEqual(result.errors, []);
});

test('ignores ordinary development PRs into dev', () => {
  const result = validateReleasePr({
    baseBranch: 'dev',
    headBranch: 'feature/example',
    body: '',
  });

  assert.deepEqual(result.errors, []);
});

test('rejects ordinary feature branches targeting main', () => {
  const result = validateReleasePr({
    baseBranch: 'main',
    headBranch: 'feature/example',
    body: validReleaseBody,
  });

  assert.match(result.errors.join('\n'), /must come from release\/x\.y\.z/);
});

test('rejects release branch and body version mismatch', () => {
  const result = validateReleasePr({
    baseBranch: 'main',
    headBranch: 'release/0.4.1',
    body: validReleaseBody,
  });

  assert.match(result.errors.join('\n'), /does not match PR body product release version/);
});

test('rejects missing package intent', () => {
  const result = validateReleasePr({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody.replace(
      '- [x] Changesets included for public package changes',
      '- [ ] Changesets included for public package changes'
    ),
  });

  assert.match(result.errors.join('\n'), /must check exactly one package intent/);
});

test('rejects public package changes without changesets', () => {
  const result = validateReleasePr({
    baseBranch: 'main',
    headBranch: 'release/0.4.0',
    body: validReleaseBody
      .replace(
        '- [x] Changesets included for public package changes',
        '- [ ] Changesets included for public package changes'
      )
      .replace('- [ ] No package publish intended', '- [x] No package publish intended'),
  });

  assert.match(result.errors.join('\n'), /public package changes require changesets/);
});

test('allows changesets version package PRs into main', () => {
  const result = validateReleasePr({
    baseBranch: 'main',
    headBranch: 'changeset-release/main',
    body: '',
  });

  assert.deepEqual(result.errors, []);
});
