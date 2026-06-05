import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function readText(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('root README uses the approved structured source of truth positioning', () => {
  const readme = readText('README.md');

  assert.match(readme, /GitHub for structured meaning/);
  assert.match(readme, /T3X is a structured source of truth for AI-produced work\./);
  assert.match(readme, /mutates that knowledge through deterministic YOps/);
  assert.doesNotMatch(readme, /T3X is a standalone engine for YAML-structured context/);
});

test('docs README starts from the same product frame as the root README', () => {
  const docsReadme = readText('docs/README.md');

  assert.match(docsReadme, /T3X is a structured source of truth for AI-produced work\./);
  assert.match(docsReadme, /commits, diffs, merges, and leaves/);
});

test('release policy avoids public-alpha wording during restricted alpha', () => {
  const releaseFlow = readText('.github/release-flow.md');

  assert.doesNotMatch(releaseFlow, /public alpha/i);
});
