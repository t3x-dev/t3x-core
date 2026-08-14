import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);

test('full-stack E2E is manual, broad, and artifact-producing', () => {
  const workflow = readText('.github/workflows/full-stack-e2e.yml');

  assert.match(workflow, /^name: Full-stack E2E$/m);
  assert.match(workflow, /^\s+workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m);
  assert.match(workflow, /image: postgres:16/);
  assert.match(workflow, /pnpm check$/m);
  assert.match(workflow, /pnpm build$/m);
  assert.match(workflow, /pnpm test$/m);
  assert.match(workflow, /pnpm build:local-runtime$/m);
  assert.match(workflow, /pnpm smoke:local-install$/m);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /pnpm e2e:full$/m);
  assert.match(workflow, /pnpm e2e:auth$/m);
  assert.match(
    workflow,
    /- name: Run authenticated browser qualification\n\s+if: \$\{\{ !cancelled\(\) \}\}/
  );
  assert.ok(workflow.indexOf('pnpm e2e:full') < workflow.indexOf('pnpm e2e:auth'));
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /test-results\/full-e2e\//);
  assert.match(workflow, /test-results\/full-e2e-auth\//);
});

test('authenticated browser qualification uses a fail-closed isolated profile', () => {
  const packageJson = JSON.parse(readText('package.json'));
  const runner = readText('tools/full-e2e.mjs');

  assert.equal(
    packageJson.scripts['e2e:auth'],
    'node tools/full-e2e.mjs --auth-enabled -- e2e/security/auth-boundaries.spec.ts'
  );
  assert.match(runner, /const authEnabled = runnerArgs\.includes\('--auth-enabled'\)/);
  assert.match(runner, /AUTH_DISABLED: authEnabled \? 'false' : 'true'/);
  assert.match(runner, /NEXT_PUBLIC_AUTH_DISABLED: authEnabled \? 'false' : 'true'/);
  assert.match(runner, /T3X_E2E_AUTH_ENABLED: authEnabled \? '1' : '0'/);
  assert.match(runner, /authEnabled \? 'test-results\/full-e2e-auth'/);
  assert.match(runner, /auth_enabled: authEnabled/);
});

test('legacy local smoke is manual instead of a pull-request trigger', () => {
  const workflow = readText('.github/workflows/local-smoke.yml');

  assert.match(workflow, /^\s+workflow_dispatch: \{\}$/m);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m);
});

function readText(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8');
}
