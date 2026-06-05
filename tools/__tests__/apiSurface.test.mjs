import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  formatApiSnapshot,
  selectApiSurfacePackages,
  updateApiSnapshots,
  verifyApiSnapshots,
} from '../lib/apiSurface.mjs';

test('API surface selection includes only published packages with extraction enabled', () => {
  const rootDir = makeTempApiRoot();

  const packages = selectApiSurfacePackages({ rootDir });

  assert.deepEqual(
    packages.map((entry) => ({
      name: entry.name,
      relativePath: entry.relativePath,
      snapshotRelativePath: entry.snapshotRelativePath,
    })),
    [
      {
        name: '@t3x-dev/yops',
        relativePath: 'packages/yops',
        snapshotRelativePath: 'packages/yops/etc/yops.api.md',
      },
    ]
  );
});

test('API snapshot formatter normalizes declarations into a stable markdown report', () => {
  const snapshot = formatApiSnapshot({
    packageName: '@t3x-dev/yops',
    declarationText: 'export declare const stable = true;\r\n',
  });

  assert.equal(
    snapshot,
    `# API Snapshot: @t3x-dev/yops

This file is generated from \`dist/index.d.ts\`. Run \`pnpm api-extract -r --local\` to update it.

\`\`\`ts
export declare const stable = true;
\`\`\`
`
  );
});

test('API snapshot verification reports stale committed snapshots', () => {
  const rootDir = makeTempApiRoot({
    yopsDeclaration: 'export declare const current = true;\n',
    yopsSnapshot: formatApiSnapshot({
      packageName: '@t3x-dev/yops',
      declarationText: 'export declare const previous = true;\n',
    }),
  });

  const result = verifyApiSnapshots({ rootDir, build: false });

  assert.equal(result.ok, false);
  assert.deepEqual(result.staleSnapshots, [
    {
      name: '@t3x-dev/yops',
      snapshotRelativePath: 'packages/yops/etc/yops.api.md',
    },
  ]);
});

test('API snapshot verification requires extractor config for selected packages', () => {
  const rootDir = makeTempApiRoot({
    yopsApiExtractorConfig: null,
  });

  const result = verifyApiSnapshots({ rootDir, build: false });

  assert.equal(result.ok, false);
  assert.deepEqual(result.configErrors, [
    {
      name: '@t3x-dev/yops',
      configRelativePath: 'packages/yops/api-extractor.json',
    },
  ]);
});

test('API snapshot update writes generated reports for selected packages', () => {
  const rootDir = makeTempApiRoot({
    yopsDeclaration: 'export declare function applyYOps(): void;\n',
    yopsSnapshot: null,
  });

  const result = updateApiSnapshots({ rootDir, build: false });

  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0].name, '@t3x-dev/yops');
  assert.equal(
    readFileSync(join(new URL(rootDir).pathname, 'packages/yops/etc/yops.api.md'), 'utf8'),
    formatApiSnapshot({
      packageName: '@t3x-dev/yops',
      declarationText: 'export declare function applyYOps(): void;\n',
    })
  );
});

function makeTempApiRoot({
  yopsDeclaration = 'export declare const yops = true;\n',
  yopsSnapshot = formatApiSnapshot({
    packageName: '@t3x-dev/yops',
    declarationText: yopsDeclaration,
  }),
  yopsApiExtractorConfig = '{}\n',
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 't3x-api-surface-'));
  mkdirSync(join(dir, 'release'), { recursive: true });
  mkdirSync(join(dir, 'packages/yops/dist'), { recursive: true });
  mkdirSync(join(dir, 'packages/local/dist'), { recursive: true });
  mkdirSync(join(dir, 'packages/core/dist'), { recursive: true });

  writeFileSync(
    join(dir, 'release/surface.yaml'),
    `version: 1
packages:
  - name: "@t3x-dev/yops"
    path: packages/yops
    access: restricted
    publish_state: applied
    npm_publish: true
    stability_tier: alpha
    readme_required: true
    api_extractor: true
    why: YOps is the alpha extraction surface.
  - name: "@t3x-dev/local"
    path: packages/local
    access: restricted
    publish_state: applied
    npm_publish: true
    stability_tier: alpha
    readme_required: true
    api_extractor: false
    why: Local bootstrap CLI.
  - name: "@t3x-dev/core"
    path: packages/core
    access: restricted
    publish_state: pending
    npm_publish: false
    stability_tier: alpha
    readme_required: false
    api_extractor: true
    why: Candidate package.
`
  );
  writeFileSync(join(dir, 'packages/yops/dist/index.d.ts'), yopsDeclaration);
  writeFileSync(
    join(dir, 'packages/local/dist/index.d.ts'),
    'export declare const local = true;\n'
  );
  writeFileSync(join(dir, 'packages/core/dist/index.d.ts'), 'export declare const core = true;\n');

  if (yopsSnapshot !== null) {
    mkdirSync(join(dir, 'packages/yops/etc'), { recursive: true });
    writeFileSync(join(dir, 'packages/yops/etc/yops.api.md'), yopsSnapshot);
  }

  if (yopsApiExtractorConfig !== null) {
    writeFileSync(join(dir, 'packages/yops/api-extractor.json'), yopsApiExtractorConfig);
  }

  return pathToFileURL(`${dir}/`);
}
