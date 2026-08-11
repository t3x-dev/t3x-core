import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);

test('PR validation enforces production type and dependency gates', () => {
  const workflow = readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8');

  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.match(workflow, /^ {6}- name: Typecheck production sources\n {8}run: pnpm typecheck$/m);
  assert.match(workflow, /^ {6}- name: Audit production dependencies\n {8}run: pnpm audit:prod$/m);
  assert.ok(workflow.indexOf('run: pnpm typecheck') < workflow.indexOf('run: pnpm build'));
  assert.ok(workflow.indexOf('run: pnpm audit:prod') < workflow.indexOf('run: pnpm build'));
});

test('production dependency audit blocks high-severity advisories', () => {
  const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

  assert.equal(packageJson.scripts['audit:prod'], 'pnpm audit --prod --audit-level high');
});
