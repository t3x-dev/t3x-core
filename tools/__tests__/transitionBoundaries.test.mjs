import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { validateTransitionBoundaries } from '../lib/transitionBoundaries.mjs';

const repositoryRoot = new URL('../..', import.meta.url);

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 't3x-transition-boundaries-'));
  const manifests = [
    [
      'transition',
      {
        name: '@t3x-dev/transition',
        publishConfig: { access: 'public' },
      },
    ],
    ['core', { name: '@t3x-dev/core' }],
    ['yops', { name: '@t3x-dev/yops' }],
    ['yschema', { name: '@t3x-dev/yschema' }],
    ['storage', { name: '@t3x-dev/storage', dependencies: { '@t3x-dev/core': 'workspace:*' } }],
  ];

  for (const [name, manifest] of manifests) {
    write(join(root, `packages/${name}/package.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    write(join(root, `packages/${name}/src/index.ts`), 'export {};\n');
  }
  return root;
}

test('the repository satisfies the Transition leaf boundaries', () => {
  assert.deepEqual(validateTransitionBoundaries({ rootDir: repositoryRoot }).errors, []);
});

test('a minimal legal fixture satisfies the Transition leaf boundaries', () => {
  const rootDir = createFixture();
  assert.deepEqual(validateTransitionBoundaries({ rootDir }).errors, []);
});

test('the Transition leaf rejects T3X dependencies and imports outside the package', () => {
  const rootDir = createFixture();
  write(
    join(rootDir, 'packages/transition/package.json'),
    `${JSON.stringify(
      {
        name: '@t3x-dev/transition',
        publishConfig: { access: 'public' },
        dependencies: { '@t3x-dev/core': 'workspace:*', lodash: '^4.0.0', pg: '^8.0.0' },
      },
      null,
      2
    )}\n`
  );
  write(
    join(rootDir, 'packages/transition/src/index.ts'),
    "export { value } from '../../storage/src/index';\n"
  );

  const { errors } = validateTransitionBoundaries({ rootDir });
  assert.ok(errors.some((error) => error.includes('must not depend on @t3x-dev/core')));
  assert.ok(errors.some((error) => error.includes('must not depend on impure package pg')));
  assert.ok(errors.some((error) => error.includes('unapproved runtime package lodash')));
  assert.ok(errors.some((error) => error.includes('imports outside the Transition leaf')));
});

test('the Transition leaf rejects impure, hidden, and domain-specific inputs', () => {
  const cases = [
    ["import fs from 'node:fs';\nexport { fs };\n", 'forbidden impure module node:fs'],
    ['export const now = Date.now();\n', 'forbidden current time'],
    ['export const token = Math.random();\n', 'forbidden randomness'],
    ['export const secret = process.env.SECRET;\n', 'forbidden current environment'],
    ["import schema from './esphome.schema';\nexport { schema };\n", 'forbidden domain module'],
  ];

  for (const [source, expected] of cases) {
    const rootDir = createFixture();
    write(join(rootDir, 'packages/transition/src/index.ts'), source);
    const { errors } = validateTransitionBoundaries({ rootDir });
    assert.ok(
      errors.some((error) => error.includes(expected)),
      `${expected}: ${errors.join('; ')}`
    );
  }
});

test('comments and string literals do not create false boundary violations', () => {
  const rootDir = createFixture();
  write(
    join(rootDir, 'packages/transition/src/index.ts'),
    [
      '// Never call Date.now() or import from node:fs here.',
      "export const guidance = 'Avoid Math.random(), process.env, and fetch() in the kernel.';",
      'export const example = "require(\'@t3x-dev/core\')";',
      '',
    ].join('\n')
  );

  assert.deepEqual(validateTransitionBoundaries({ rootDir }).errors, []);
});

test('aliased crypto entropy remains forbidden', () => {
  const rootDir = createFixture();
  write(
    join(rootDir, 'packages/transition/src/index.ts'),
    "import { randomUUID as createId } from 'node:crypto';\nexport const id = createId();\n"
  );

  const { errors } = validateTransitionBoundaries({ rootDir });
  assert.ok(errors.some((error) => error.includes('forbidden randomness')));
});

test('Transition tests may use harness modules but cannot escape or become nondeterministic', () => {
  const legalRoot = createFixture();
  write(
    join(legalRoot, 'packages/transition/src/__tests__/contract.test.ts'),
    [
      "import { createHash } from 'node:crypto';",
      "import { readFileSync } from 'node:fs';",
      "export const digest = createHash('sha256').update(readFileSync('vector.json')).digest('hex');",
      '',
    ].join('\n')
  );
  assert.deepEqual(validateTransitionBoundaries({ rootDir: legalRoot }).errors, []);

  const illegalRoot = createFixture();
  write(
    join(illegalRoot, 'packages/transition/src/__tests__/contract.test.ts'),
    [
      "import { engine } from '../../../yops/src/engine';",
      'export const generatedAt = Date.now();',
      'export const nonce = Math.random();',
      'export { engine };',
      '',
    ].join('\n')
  );

  const { errors } = validateTransitionBoundaries({ rootDir: illegalRoot });
  assert.ok(errors.some((error) => error.includes('imports outside the Transition leaf')));
  assert.ok(errors.some((error) => error.includes('forbidden current time')));
  assert.ok(errors.some((error) => error.includes('forbidden randomness')));
});

test('native packages cannot import Transition or its adapter layer', () => {
  const rootDir = createFixture();
  write(
    join(rootDir, 'packages/yops/src/index.ts'),
    "import {\n  x,\n} from '@t3x-dev/transition';\nexport { x };\n"
  );
  write(
    join(rootDir, 'packages/yschema/src/index.ts'),
    "export { y } from '../../core/src/transition-adapters/yschemaStatementProvider';\n"
  );

  const { errors } = validateTransitionBoundaries({ rootDir });
  assert.ok(errors.some((error) => error.includes('packages/yops/src/index.ts')));
  assert.ok(errors.some((error) => error.includes('packages/yschema/src/index.ts')));
});

test('core cannot depend on or import storage', () => {
  const rootDir = createFixture();
  write(
    join(rootDir, 'packages/core/package.json'),
    `${JSON.stringify(
      { name: '@t3x-dev/core', dependencies: { '@t3x-dev/storage': 'workspace:*' } },
      null,
      2
    )}\n`
  );
  write(
    join(rootDir, 'packages/core/src/index.ts'),
    "export { database } from '../../storage/src/index';\n"
  );

  const { errors } = validateTransitionBoundaries({ rootDir });
  assert.ok(errors.some((error) => error.includes('must not depend on @t3x-dev/storage')));
  assert.ok(errors.some((error) => error.includes('forbidden @t3x-dev/storage boundary')));
});

test('application package may depend on core and transition only', () => {
  const rootDir = createFixture();
  write(
    join(rootDir, 'packages/application/package.json'),
    `${JSON.stringify(
      {
        name: '@t3x-dev/application',
        private: true,
        dependencies: {
          '@t3x-dev/core': 'workspace:*',
          '@t3x-dev/transition': 'workspace:*',
        },
      },
      null,
      2
    )}\n`
  );
  write(
    join(rootDir, 'packages/application/src/index.ts'),
    "import type { TransitionViewV1 } from '@t3x-dev/core';\nimport type { Effect } from '@t3x-dev/transition';\nexport type View = TransitionViewV1;\nexport type AppEffect = Effect;\n"
  );

  assert.deepEqual(validateTransitionBoundaries({ rootDir }).errors, []);
});

test('application package rejects storage framework and ambient runtime access', () => {
  const rootDir = createFixture();
  write(
    join(rootDir, 'packages/application/package.json'),
    `${JSON.stringify(
      {
        name: '@t3x-dev/application',
        private: true,
        dependencies: {
          '@t3x-dev/core': 'workspace:*',
          '@t3x-dev/storage': 'workspace:*',
          hono: '^4.0.0',
        },
      },
      null,
      2
    )}\n`
  );
  write(
    join(rootDir, 'packages/application/src/index.ts'),
    [
      "import { getDB } from '@t3x-dev/storage';",
      "import { Hono } from 'hono';",
      'export const value = process.env.DATABASE_URL;',
      'export { getDB, Hono };',
      '',
    ].join('\n')
  );

  const { errors } = validateTransitionBoundaries({ rootDir });
  assert.ok(errors.some((error) => error.includes('must not depend on @t3x-dev/storage')));
  assert.ok(errors.some((error) => error.includes('must not depend on framework')));
  assert.ok(errors.some((error) => error.includes('imports forbidden T3X package')));
  assert.ok(errors.some((error) => error.includes('imports forbidden framework')));
  assert.ok(errors.some((error) => error.includes('forbidden current environment')));
});
