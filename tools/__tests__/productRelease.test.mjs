import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProductReleaseNotes,
  extractSection,
  findProductReleasePull,
  parseProductReleaseVersion,
} from '../lib/productRelease.mjs';

const releaseBody = `## Product Release

T3X product release version: \`0.4.0\`

## Included Changes

- Merge reviewed runtime fixes.

## Release Notes

- T3X 0.4.0 improves local runtime startup.

## Package Releases

- \`@t3x-dev/local\`: 0.4.1
- \`@t3x-dev/yops\`: 0.4.1

## Known Risks

- None
`;

const codeOnlyReleaseBody = `## Product Release

T3X product release version: \`0.4.1\`

## Included Changes

- Tighten release PR policy checks.

## Release Notes

- T3X 0.4.1 tightens release PR policy checks.

## Package Releases

- None

## Known Risks

- None
`;

test('parses product release version from release PR body', () => {
  assert.equal(parseProductReleaseVersion(releaseBody), '0.4.0');
});

test('extracts markdown sections from release PR body', () => {
  assert.equal(extractSection(releaseBody, 'Included Changes'), '- Merge reviewed runtime fixes.');
  assert.match(extractSection(releaseBody, 'Release Notes'), /T3X 0\.4\.0/);
});

test('finds associated product release PR and skips version package PRs', () => {
  const pull = findProductReleasePull([
    {
      number: 11,
      base: { ref: 'main' },
      head: { ref: 'changeset-release/main' },
      body: 'chore: version packages',
    },
    {
      number: 12,
      base: { ref: 'main' },
      head: { ref: 'release/0.4.0' },
      body: releaseBody,
    },
  ]);

  assert.equal(pull.number, 12);
});

test('builds product release notes from release PR sections', () => {
  const notes = buildProductReleaseNotes({
    version: '0.4.0',
    pull: {
      number: 12,
      html_url: 'https://github.com/t3x-dev/t3x-core/pull/12',
      body: releaseBody,
    },
  });

  assert.match(notes, /^# T3X v0\.4\.0/);
  assert.match(notes, /## Release Notes/);
  assert.match(notes, /## Package Releases/);
  assert.match(notes, /`@t3x-dev\/local`: 0\.4\.1/);
  assert.match(notes, /`@t3x-dev\/yops`: 0\.4\.1/);
  assert.match(notes, /## Included Changes/);
  assert.match(notes, /PR: #12 https:\/\/github.com\/t3x-dev\/t3x-core\/pull\/12/);
});

test('omits package release notes for code-only product releases', () => {
  const notes = buildProductReleaseNotes({
    version: '0.4.1',
    pull: {
      number: 13,
      html_url: 'https://github.com/t3x-dev/t3x-core/pull/13',
      body: codeOnlyReleaseBody,
    },
  });

  assert.match(notes, /^# T3X v0\.4\.1/);
  assert.match(notes, /## Release Notes/);
  assert.doesNotMatch(notes, /## Package Releases/);
  assert.doesNotMatch(notes, /- None/);
  assert.match(notes, /## Included Changes/);
});
