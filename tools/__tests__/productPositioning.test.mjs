import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function readText(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('root README uses the approved structured-state positioning', () => {
  const readme = readText('README.md');

  assert.match(readme, /Version control for structured state\./);
  assert.match(readme, /T3X records schema-backed YAML changes as deterministic YOps patches/);
  assert.match(readme, /Source -> YOps -> Commit/);
  assert.match(readme, /old YAML \+ YOps -> new YAML/);
  assert.doesNotMatch(readme, /Git for structured AI work/);
  assert.doesNotMatch(readme, /T3X is a standalone engine for YAML-structured context/);
});

test('docs README starts from the same product frame as the root README', () => {
  const docsReadme = readText('docs/README.md');

  assert.match(docsReadme, /Structured YAML is easy to change and hard to govern/);
  assert.match(docsReadme, /deterministic YOps patches/);
  assert.match(docsReadme, /commits, diffs, merges, provenance, and generated outputs/);
});

test('release policy avoids public-alpha wording during restricted alpha', () => {
  const releaseFlow = readText('.github/release-flow.md');

  assert.doesNotMatch(releaseFlow, /public alpha/i);
});
