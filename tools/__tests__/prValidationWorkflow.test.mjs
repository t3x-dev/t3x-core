import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);

test('PR validation enforces production type and dependency gates', () => {
  const workflow = readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8');

  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.match(workflow, /^ {6}- name: Typecheck production sources\n {8}run: pnpm typecheck$/m);
  assert.match(workflow, /^ {6}- name: Audit production dependencies\n {8}run: pnpm audit:prod$/m);
  assert.match(
    workflow,
    /^ {6}- name: Check API route policy inventory\n {8}run: pnpm check:route-policy$/m
  );
  assert.ok(workflow.indexOf('run: pnpm typecheck') < workflow.indexOf('run: pnpm build'));
  assert.ok(workflow.indexOf('run: pnpm audit:prod') < workflow.indexOf('run: pnpm build'));
  assert.ok(workflow.indexOf('run: pnpm check:route-policy') < workflow.indexOf('run: pnpm build'));
});

test('PR validation qualifies merge groups and immutable dev pushes', () => {
  const workflow = readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8');

  assert.match(workflow, /^ {2}merge_group:$/m);
  assert.match(workflow, /^ {2}push:\n {4}branches:\n {6}- dev$/m);
  assert.match(
    workflow,
    /^ {2}group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}$/m
  );
  assert.match(
    workflow,
    /^ {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m
  );
});

test('production dependency audit blocks high-severity advisories', () => {
  const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

  assert.equal(packageJson.scripts['audit:prod'], 'pnpm audit --prod --audit-level high');
});

test('PR validation runs the authenticated security smoke before the full suite', () => {
  const workflow = readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8');
  const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const apiPackageJson = JSON.parse(
    readFileSync(new URL('packages/api/package.json', root), 'utf8')
  );

  assert.equal(
    packageJson.scripts['test:security-smoke'],
    'pnpm --filter @t3x-dev/api test:auth-smoke'
  );
  assert.equal(
    apiPackageJson.scripts['test:auth-smoke'],
    'vitest run src/__tests__/auth-boundary.smoke.test.ts src/__tests__/auth-websocket.smoke.test.ts'
  );
  assert.match(
    workflow,
    /^ {6}- name: Run authenticated security smoke\n(?: {8}.+\n)+ {8}run: pnpm test:security-smoke$/m
  );
  assert.ok(
    workflow.indexOf('run: pnpm test:security-smoke') < workflow.indexOf('run: pnpm test\n')
  );
});
