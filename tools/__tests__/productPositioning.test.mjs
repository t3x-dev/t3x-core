import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function readText(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

test('root README presents the product before its internal architecture', () => {
  const readme = readText('README.md');

  assert.match(readme, /Version control for structured state\./);
  assert.match(readme, /Review, validate, and commit changes from people and agents\./);
  assert.match(readme, /control plane for structured state changes/i);
  assert.match(readme, /Review before commit\./);
  assert.match(readme, /One path for people and agents\./);
  assert.match(readme, /remain internal\s+or preview surfaces and may change/);
  assert.doesNotMatch(readme, /## Architecture/);
  assert.doesNotMatch(readme, /## The Transition model/);
  assert.doesNotMatch(readme, /State, Effect, Statement, and CommitV2/);
  assert.doesNotMatch(readme, /Result = Replay\(Base, DefinitionOf\(Effect\)\)/);
  assert.doesNotMatch(readme, /Git for structured AI work/);
  assert.doesNotMatch(readme, /T3X is a standalone engine for YAML-structured context/);
});

test('docs README starts from the same plain product frame as the root README', () => {
  const docsReadme = readText('docs/README.md');

  assert.match(docsReadme, /version control for structured state/i);
  assert.match(docsReadme, /review,\s+validate, and commit changes/i);
  assert.doesNotMatch(docsReadme, /Result = Replay\(Base, DefinitionOf\(Effect\)\)/);
  assert.doesNotMatch(docsReadme, /Propose -> Verify\* -> Decide -> Commit\?/);
});

test('public first-impression surfaces avoid the retired meaning-first frame', () => {
  const surfaces = [
    'README.md',
    'docs/README.md',
    'apps/cli/README.md',
    'apps/local/README.md',
    'apps/web/README.md',
    'packages/yops/README.md',
    'apps/web/src/app/page.tsx',
    'apps/web/src/components/onboarding/FirstRunDemoOverlay.tsx',
    'apps/web/src/components/chat/ChatWorkspace.tsx',
    'tools/screenshot-demo.mjs',
  ];
  const oldPhrases = [
    /GitHub for structured meaning/i,
    /Git for Meaning/i,
    /structured meaning/i,
    /Source -> Meaning -> Commit/i,
    /source becomes meaning/i,
    /applied meaning/i,
    /reviewed meaning/i,
    /semantic tree content/i,
    /What should T3X make sense of\?/i,
    /semantic version control for AI conversations/i,
    /semantic version control system/i,
  ];

  for (const surface of surfaces) {
    const text = readText(surface);
    for (const phrase of oldPhrases) {
      assert.doesNotMatch(text, phrase, `${surface} still contains ${phrase}`);
    }
  }
});

test('release policy documents the public alpha package surface', () => {
  const releaseFlow = readText('.github/release-flow.md');

  assert.match(releaseFlow, /public alpha/i);
  assert.doesNotMatch(releaseFlow, /restricted alpha/i);
});
