import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const root = new URL('../..', import.meta.url);

test('PR validation enforces production type and dependency gates', () => {
  const workflow = readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8');

  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.match(workflow, /^ {6}- name: Typecheck production sources\n {8}run: pnpm typecheck$/m);
  assert.match(
    workflow,
    /^ {6}- name: Check API route policy inventory\n {8}run: pnpm check:route-policy$/m
  );
  assert.match(
    workflow,
    /^ {6}- name: Check architecture inventory\n {8}run: pnpm check:architecture-inventory$/m
  );
  assert.ok(workflow.indexOf('run: pnpm typecheck') < workflow.indexOf('run: pnpm build'));
  assert.ok(
    workflow.indexOf('run: pnpm check:architecture-inventory') < workflow.indexOf('run: pnpm build')
  );
  assert.ok(workflow.indexOf('run: pnpm check:route-policy') < workflow.indexOf('run: pnpm build'));
});

test('audit cannot prevent test execution or weaken the required validation check', () => {
  const workflow = yaml.load(
    readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8')
  );
  const job = workflow.jobs.validate;
  const auditSteps = job.steps.filter((step) => step.run === 'pnpm audit:prod');
  assert.equal(job.name, 'Check, build, and test');
  assert.equal(job['continue-on-error'], undefined);
  assert.equal(job.if, undefined);
  assert.equal(auditSteps.length, 1);
  const audit = auditSteps[0];
  assert.match(audit.if, /^\$\{\{ !cancelled\(\) \}\}$/);
  assert.equal(audit['continue-on-error'], undefined);
  assert.equal(job.steps.at(-1), audit);
  for (const command of ['pnpm build', 'pnpm test:security-smoke', 'pnpm test']) {
    const index = job.steps.findIndex((step) => step.run === command);
    assert.ok(index >= 0, `${command} must remain in validation`);
    assert.ok(index < job.steps.indexOf(audit), `${command} must run before audit`);
    assert.equal(job.steps[index]['continue-on-error'], undefined);
  }
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

test('specialist checks retain PR and manual eligibility alongside the required job', () => {
  const workflow = yaml.load(
    readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8')
  );
  const { on: triggers, jobs } = workflow;
  assert.deepEqual(triggers.pull_request, { branches: ['dev', 'main'] });
  assert.deepEqual(triggers.push, { branches: ['dev'] });
  assert.ok('merge_group' in triggers);
  assert.ok('workflow_dispatch' in triggers);
  assert.equal(jobs.validate.needs, undefined);

  for (const job of [jobs.standards, jobs['independent-verifier']]) {
    assert.equal(
      job.if,
      "github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'"
    );
    assert.equal(job.needs, undefined);
  }

  const api = jobs['api-surface'];
  assert.equal(api.needs, 'api-changes');
  assert.equal(jobs['api-changes'].if, "github.event_name == 'pull_request'");
  assert.match(api.if, /github\.event_name == 'workflow_dispatch' \|\|/);
  assert.match(
    api.if,
    /github\.event_name == 'pull_request' && needs\.api-changes\.outputs\.relevant == 'true'/
  );
});

test('the API job uses the PR merge base and still detects changed or removed API paths', (t) => {
  const workflow = yaml.load(
    readFileSync(new URL('.github/workflows/pr-validation.yml', root), 'utf8')
  );
  const script = workflow.jobs['api-changes'].steps.find((step) => step.id === 'paths').run;
  const cwd = mkdtempSync(join(tmpdir(), 't3x-api-workflow-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const commit = (message) => {
    git('add', '-A');
    git(
      '-c',
      'user.name=Workflow Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      message
    );
    return git('rev-parse', 'HEAD');
  };
  const apiPath = join(cwd, 'packages/example/src/nested/entry.ts');
  const outputPath = join(cwd, '.git', 'action-output');
  const detect = (base, head) => {
    writeFileSync(outputPath, '');
    const result = spawnSync('bash', ['-e', '-c', script], {
      cwd,
      env: { ...process.env, BASE_SHA: base, HEAD_SHA: head, GITHUB_OUTPUT: outputPath },
      encoding: 'utf8',
    });
    return { status: result.status, output: readFileSync(outputPath, 'utf8').trim() };
  };
  git('init', '--quiet');
  mkdirSync(join(cwd, 'packages/example/src/nested'), { recursive: true });
  writeFileSync(apiPath, 'initial API');
  const common = commit('Initial commit');
  writeFileSync(apiPath, 'API changed on base');
  const base = commit('Move base forward');

  git('checkout', '--quiet', '--detach', common);
  writeFileSync(join(cwd, 'README.md'), 'Docs-only pull request');
  const docs = commit('Update docs');
  assert.deepEqual(detect(base, docs), { status: 0, output: 'relevant=false' });

  rmSync(apiPath);
  const removed = commit('Remove API file');
  assert.deepEqual(detect(base, removed), { status: 0, output: 'relevant=true' });
  const missing = detect('not-a-revision', docs);
  assert.notEqual(missing.status, 0);
  assert.equal(missing.output, '');
});
