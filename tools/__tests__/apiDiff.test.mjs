import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  diffApiSnapshots,
  diffApiSurfaceFromBase,
  formatApiDiffMarkdown,
  parseApiSnapshot,
} from '../api-diff/diff.mjs';
import { formatApiSnapshot } from '../lib/apiSurface.mjs';

test('API snapshot parser resolves exported declarations from report markdown', () => {
  const parsed = parseApiSnapshot(
    formatApiSnapshot({
      packageName: '@t3x-dev/sample',
      declarationText: `interface Internal {
    value: string;
}
declare function hidden(): void;
export declare interface PublicShape {
    value: string;
}
declare const exportedConst = true;
export { exportedConst, type PublicShape };
`,
    })
  );

  assert.deepEqual([...parsed.exports.keys()].sort(), ['PublicShape', 'exportedConst']);
  assert.match(parsed.exports.get('PublicShape').declaration, /interface PublicShape/);
  assert.match(parsed.exports.get('exportedConst').declaration, /declare const exportedConst/);
});

test('API diff classifies removed and changed exports as breaking', () => {
  const before = formatApiSnapshot({
    packageName: '@t3x-dev/sample',
    declarationText: `export declare function kept(): void;
export declare function removed(): void;
export declare interface Changed {
    value: string;
}
`,
  });
  const after = formatApiSnapshot({
    packageName: '@t3x-dev/sample',
    declarationText: `export declare function kept(): void;
export declare interface Changed {
    value: number;
}
`,
  });

  const diff = diffApiSnapshots({ packageName: '@t3x-dev/sample', before, after });

  assert.equal(diff.hasBreakingChanges, true);
  assert.deepEqual(
    diff.breaking.map((change) => ({
      kind: change.kind,
      symbol: change.symbol,
    })),
    [
      { kind: 'removed_export', symbol: 'removed' },
      { kind: 'changed_export', symbol: 'Changed' },
    ]
  );
  assert.deepEqual(diff.nonBreaking, []);
});

test('API diff classifies added exports as non-breaking', () => {
  const before = formatApiSnapshot({
    packageName: '@t3x-dev/sample',
    declarationText: 'export declare function kept(): void;\n',
  });
  const after = formatApiSnapshot({
    packageName: '@t3x-dev/sample',
    declarationText: `export declare function kept(): void;
export declare function added(): void;
`,
  });

  const diff = diffApiSnapshots({ packageName: '@t3x-dev/sample', before, after });

  assert.equal(diff.hasBreakingChanges, false);
  assert.deepEqual(
    diff.nonBreaking.map((change) => ({
      kind: change.kind,
      symbol: change.symbol,
    })),
    [{ kind: 'added_export', symbol: 'added' }]
  );
});

test('API diff markdown reports package-level breaking status', () => {
  const markdown = formatApiDiffMarkdown([
    {
      packageName: '@t3x-dev/sample',
      hasBreakingChanges: true,
      breaking: [
        {
          kind: 'removed_export',
          symbol: 'removed',
          before: 'export declare function removed(): void;',
        },
      ],
      nonBreaking: [
        { kind: 'added_export', symbol: 'added', after: 'export declare function added(): void;' },
      ],
      unchanged: ['kept'],
    },
  ]);

  assert.match(markdown, /## API Surface Diff/);
  assert.match(markdown, /### @t3x-dev\/sample/);
  assert.match(markdown, /Breaking changes/);
  assert.match(markdown, /removed_export: `removed`/);
  assert.match(markdown, /Non-breaking changes/);
  assert.match(markdown, /added_export: `added`/);
});

test('API surface diff fails when the base ref cannot be resolved', () => {
  const rootDir = makeTempGitApiRoot();

  assert.throws(
    () => diffApiSurfaceFromBase({ rootDir, baseRef: 'definitely-not-a-real-ref' }),
    /API diff base ref not found: definitely-not-a-real-ref/
  );
});

test('API surface diff treats a missing base snapshot on a valid ref as a new report', () => {
  const rootDir = makeTempGitApiRoot({ commitSnapshot: false });

  const [result] = diffApiSurfaceFromBase({ rootDir, baseRef: 'HEAD' });

  assert.equal(result.packageName, '@t3x-dev/yops');
  assert.equal(result.hasBreakingChanges, false);
  assert.deepEqual(
    result.nonBreaking.map((change) => change.symbol),
    ['applyYOps']
  );
});

function makeTempGitApiRoot({ commitSnapshot = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 't3x-api-diff-'));
  mkdirSync(join(dir, 'release'), { recursive: true });
  mkdirSync(join(dir, 'packages/yops/etc'), { recursive: true });

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
    why: YOps API diff fixture.
`
  );

  const snapshot = formatApiSnapshot({
    packageName: '@t3x-dev/yops',
    declarationText: 'export declare function applyYOps(): void;\n',
  });
  if (commitSnapshot) {
    writeFileSync(join(dir, 'packages/yops/etc/yops.api.md'), snapshot);
  }

  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync(
    'git',
    ['-c', 'user.name=T3X Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'base'],
    { cwd: dir, stdio: 'ignore' }
  );

  if (!commitSnapshot) {
    writeFileSync(join(dir, 'packages/yops/etc/yops.api.md'), snapshot);
  }

  return pathToFileURL(`${dir}/`);
}
