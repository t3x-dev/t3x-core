import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runStandards } from '../lib/standardsRunner.mjs';
import { validateYopsStability } from '../lib/yopsStability.mjs';

const root = new URL('../..', import.meta.url);
const rootPath = fileURLToPath(root);

test('standards row-3 runs the YOps stability check through the standards runner', async () => {
  const result = await runStandards({
    rootDir: root,
    mode: 'full',
    requestedRows: ['row-3'],
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.results, [
    {
      row_id: 'row-3',
      title: 'Honest versioning and YOps stability policy',
      status: 'pass',
      summary: 'YOps stability metadata is complete for 18 operations.',
      details: [],
    },
  ]);
});

test('standards row-3 runs when YOps stability files change', async () => {
  const result = await runStandards({
    rootDir: root,
    mode: 'pr',
    changedPaths: ['packages/yops/yops.yaml', 'tools/lib/yopsStability.mjs'],
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.selectedRows, ['row-3']);
});

test('YOps stability check requires a declaration for breaking YOps API changes', () => {
  const rootDir = makeTempRoot({ includeDeclaration: false });
  const result = validateYopsStability({
    rootDir,
    apiDiffResults: [
      {
        packageName: '@t3x-dev/yops',
        hasBreakingChanges: true,
        breaking: [{ kind: 'changed_export', symbol: 'YOpsResult' }],
      },
    ],
  });

  assert.deepEqual(result.errors, [
    'Breaking @t3x-dev/yops API changes require a declaration in the PR body or .changeset/*.md.',
  ]);
});

test('YOps stability check accepts a PR body breaking declaration', () => {
  const rootDir = makeTempRoot();
  const result = validateYopsStability({
    rootDir,
    prBody: 'Breaking declaration: @t3x-dev/yops YOpsResult changed export.',
    apiDiffResults: [
      {
        packageName: '@t3x-dev/yops',
        hasBreakingChanges: true,
        breaking: [{ kind: 'changed_export', symbol: 'YOpsResult' }],
      },
    ],
  });

  assert.deepEqual(result.errors, []);
});

function makeTempRoot() {
  const dir = mkdtempSync(join(tmpdir(), 't3x-yops-stability-'));
  copyFixture('packages/yops/yops.yaml', dir);
  copyFixture('packages/yops/README.md', dir);

  return pathToFileURL(`${dir}/`);
}

function copyFixture(relativePath, targetRoot) {
  const targetPath = join(targetRoot, relativePath);
  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(join(rootPath, relativePath), targetPath);
}
