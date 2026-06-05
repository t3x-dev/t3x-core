import assert from 'node:assert/strict';
import test from 'node:test';
import { runStandards } from '../lib/standardsRunner.mjs';

const root = new URL('../..', import.meta.url);

test('standards row-4 runs the release surface check through the standards runner', async () => {
  const result = await runStandards({
    rootDir: root,
    mode: 'full',
    requestedRows: ['row-4'],
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.results, [
    {
      row_id: 'row-4',
      title: 'Each package this release claims as public stands on its own',
      status: 'pass',
      summary: 'Release surface is consistent for @t3x-dev/local, @t3x-dev/yops.',
      details: [],
    },
  ]);
});

test('standards row-4 runs when release surface guard files change', async () => {
  const result = await runStandards({
    rootDir: root,
    mode: 'pr',
    changedPaths: ['tools/lib/releasePr.mjs', '.github/workflows/pr-validation.yml'],
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.selectedRows, ['row-4']);
});
