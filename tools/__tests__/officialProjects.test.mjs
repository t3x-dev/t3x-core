import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadProjects, toContent } from '../official-projects.mjs';

test('official examples retain their complete values through node conversion', async () => {
  const fromNode = (n) =>
    Object.fromEntries([
      ...Object.entries(n.slots),
      ...n.children.map((c) => [c.key, fromNode(c)]),
    ]);
  const projects = await loadProjects();
  assert.equal(projects.length, 3);
  for (const project of projects) {
    for (const value of [project.initial, project.demonstration.value]) {
      const restored = Object.fromEntries(toContent(value).trees.map((n) => [n.key, fromNode(n)]));
      assert.deepEqual(restored, value);
    }
    assert.notDeepEqual(project.initial, project.demonstration.value);
    assert.match(project.presentation.readme, /sample content/);
    const png = Buffer.from(project.presentation.resources[0].base64, 'base64');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
  }
});

test('rejects unsupported native roots instead of silently dropping their data', () => {
  for (const value of [null, [], 'scalar', { name: 'CI', jobs: {} }, { on: ['push'] }])
    assert.throws(() => toContent(value), /mapping/);
});
