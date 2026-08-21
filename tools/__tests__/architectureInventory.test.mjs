import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { collectArchitectureInventory } from '../lib/architectureInventory.mjs';

const repositoryRoot = new URL('../..', import.meta.url);

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 't3x-architecture-inventory-'));

  write(
    join(root, 'packages/yops/yops.yaml'),
    [
      'operations:',
      '  set:',
      '    description: set a value',
      '  assert:',
      '    description: check a value',
      '',
    ].join('\n')
  );
  write(join(root, 'packages/api/src/lib/transition-control-plane/index.ts'), 'export {};\n');
  write(
    join(root, 'packages/api/src/routes/transition.openapi.ts'),
    [
      "import { getDB } from '../lib/db';",
      "import { assertProjectAccess } from '../lib/project-access';",
      "import { requireTransitionAuthority } from '../lib/transition-authority';",
      'export async function handler() {',
      '  await getDB();',
      '  await assertProjectAccess();',
      '  requireTransitionAuthority();',
      '}',
      '',
    ].join('\n')
  );
  write(
    join(root, 'packages/api/src/routes/status.openapi.ts'),
    [
      "import { getDB } from '../lib/db';",
      'export async function handler() {',
      '  await getDB();',
      '}',
      '',
    ].join('\n')
  );
  write(
    join(root, 'packages/api/src/lib/repository-state-transition.ts'),
    'export async function commitFromDraft() {}\n'
  );
  write(
    join(root, 'packages/mcp/src/tools/core/commit.ts'),
    [
      "import { updateDraft } from '@t3x-dev/storage';",
      "export const actor = 'human:mcp-local';",
      'export async function run() {',
      '  await updateDraft();',
      '}',
      '',
    ].join('\n')
  );
  write(
    join(root, 'apps/web/src/infrastructure/mergeApi.ts'),
    'export async function commitMergeDraft() {}\n'
  );
  write(
    join(root, 'apps/web/.next/server/generated.js'),
    'const ignored = "ReviewSnapshot generated bundle";\n'
  );

  return root;
}

test('the repository phase 3 architecture inventory can be collected', () => {
  const inventory = collectArchitectureInventory({ rootDir: repositoryRoot });

  assert.equal(inventory.version, 1);
  assert.equal(inventory.scope, 'phase-3-application-convergence');
  if (inventory.applicationPackage.exists) {
    assert.equal(inventory.applicationPackage.name, '@t3x-dev/application');
    assert.equal(inventory.applicationPackage.private, true);
  }
  assert.ok(inventory.transitionControlPlane.length > 0);
  assert.ok(inventory.apiRouteAuthorization.routeFiles > 0);
  assert.equal(inventory.yops.operationCount, 18);
});

test('phase 3 architecture inventory tracks expected convergence gaps', () => {
  const rootDir = createFixture();
  const inventory = collectArchitectureInventory({ rootDir });

  assert.deepEqual(inventory.applicationPackage, { exists: false });
  assert.deepEqual(inventory.transitionControlPlane, [
    {
      path: 'packages/api/src/lib/transition-control-plane/index.ts',
      lines: 1,
    },
  ]);
  assert.equal(inventory.apiRouteAuthorization.routeFiles, 2);
  assert.equal(inventory.apiRouteAuthorization.filesUsingGetDB, 2);
  assert.equal(inventory.apiRouteAuthorization.filesUsingAssertProjectAccess, 1);
  assert.equal(inventory.apiRouteAuthorization.filesUsingRequireTransitionAuthority, 1);
  assert.deepEqual(inventory.apiRouteAuthorization.getDBWithoutProjectAccess, [
    'packages/api/src/routes/status.openapi.ts',
  ]);
  assert.deepEqual(inventory.compatibilityWriterReferences, [
    {
      path: 'apps/web/src/infrastructure/mergeApi.ts',
      patterns: ['commitMergeDraft'],
    },
    {
      path: 'packages/api/src/lib/repository-state-transition.ts',
      patterns: ['commitFromDraft'],
    },
  ]);
  assert.deepEqual(inventory.surfaceStorageImports, [
    {
      surface: 'mcp',
      files: ['packages/mcp/src/tools/core/commit.ts'],
    },
  ]);
  assert.deepEqual(inventory.mcpHardcodedActors, [
    {
      path: 'packages/mcp/src/tools/core/commit.ts',
      actors: ['human:mcp-local'],
    },
  ]);
  assert.deepEqual(inventory.yops.operations, ['assert', 'set']);
  assert.deepEqual(inventory.reviewSnapshotReferences, []);
});
