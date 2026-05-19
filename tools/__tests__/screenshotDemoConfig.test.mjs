import assert from 'node:assert/strict';
import test from 'node:test';
import { getScreenshotTargets, resolveScreenshotConfig } from '../screenshot-demo.mjs';

test('defines committed demo screenshot targets', () => {
  const targets = getScreenshotTargets();

  assert.deepEqual(
    targets.map((target) => target.name),
    ['chat-light', 'chat-dark', 'chat-mobile']
  );
  assert.ok(
    targets.every((target) => target.outputPath.startsWith('apps/web/public/screenshots/'))
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
