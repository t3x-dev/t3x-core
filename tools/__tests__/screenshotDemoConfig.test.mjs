import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getScreenshotTargets, resolveScreenshotConfig } from '../screenshot-demo.mjs';

test('defines local review demo screenshot targets outside app assets', () => {
  const targets = getScreenshotTargets();

  assert.deepEqual(
    targets.map((target) => target.name),
    ['chat-light', 'chat-dark', 'chat-mobile']
  );
  assert.ok(targets.every((target) => target.outputPath.startsWith('tmp/screenshots/demo/')));
  assert.ok(
    targets.every((target) => !target.outputPath.startsWith('apps/web/public/screenshots/'))
  );
  assert.ok(targets.every((target) => target.settleMs >= 500));
  assert.equal(
    targets.find((target) => target.name === 'chat-mobile')?.waitForCollapsedSidebar,
    true
  );
});

test('resolves the demo screenshot URL from WEBUI_URL', () => {
  assert.equal(
    resolveScreenshotConfig({ WEBUI_URL: 'http://localhost:4111' }).url,
    'http://localhost:4111/chat'
  );
});

test('writes demo screenshots under an ignored root scratch directory', () => {
  const config = resolveScreenshotConfig();
  const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');

  assert.equal(config.outputDir, 'tmp/screenshots/demo');
  assert.match(gitignore, /^\/tmp\/$/m);
});
