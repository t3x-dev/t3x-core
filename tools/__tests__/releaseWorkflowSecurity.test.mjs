import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { selectRetryPackages } from '../detect-publish-packages.mjs';
import { validateReleasePr } from '../lib/releasePr.mjs';

const root = new URL('../..', import.meta.url);

test('release jobs receive only the GitHub permissions they need', () => {
  const workflow = readWorkflow('.github/workflows/release.yml');

  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs['changeset-state'].permissions, undefined);
  assert.equal(workflow.jobs['build-runtime'].permissions, undefined);
  assert.deepEqual(workflow.jobs['product-release-record'].permissions, { contents: 'write' });
  assert.deepEqual(workflow.jobs.release.permissions, {
    contents: 'write',
    'pull-requests': 'write',
  });
});

test('npm and Changesets credentials are isolated to mutually exclusive release paths', () => {
  const workflow = readWorkflow('.github/workflows/release.yml');
  const steps = workflow.jobs.release.steps;
  const createReleasePr = steps.find((step) => step.name === 'Create release PR');
  const publishPackages = steps.find((step) => step.name === 'Publish packages');

  assert.equal(createReleasePr.if, "needs.changeset-state.outputs.should_publish != 'true'");
  assert.equal(publishPackages.if, "needs.changeset-state.outputs.should_publish == 'true'");
  assert.equal(createReleasePr.env.NPM_TOKEN, undefined);
  assert.match(createReleasePr.env.GITHUB_TOKEN, /CHANGESETS_TOKEN/);
  assert.match(publishPackages.env.NPM_TOKEN, /secrets\.NPM_TOKEN/);
  assert.match(publishPackages.env.GITHUB_TOKEN, /secrets\.GITHUB_TOKEN/);
  assert.doesNotMatch(publishPackages.env.GITHUB_TOKEN, /CHANGESETS_TOKEN/);
  assert.deepEqual(
    steps.filter((step) => step.env?.NPM_TOKEN).map((step) => step.name),
    ['Publish packages']
  );
});

test('release train defaults to read-only and grants writes only to its preparation job', () => {
  const workflow = readWorkflow('.github/workflows/release-train.yml');

  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.jobs.prepare.permissions, {
    contents: 'write',
    'pull-requests': 'write',
  });
});

function readWorkflow(relativePath) {
  return yaml.load(readFileSync(new URL(relativePath, root), 'utf8'));
}

test('generated back-merge PR bodies pass policy when main changes protected release files', () => {
  const workflow = readWorkflow('.github/workflows/sync-main-into-dev.yml');
  const step = workflow.jobs.sync.steps.find((entry) => entry.name === 'Open or update PR');
  const body = step.run.match(/<<'EOF'\n([\s\S]*?)\nEOF/)?.[1];
  assert.ok(body, 'the generated PR body must be available');
  const context = {
    baseBranch: 'dev',
    headBranch: 'automation/sync-main-into-dev',
    changedFiles: ['RELEASE.md', 'release/surface.yaml', 'docs/stability.md'],
  };
  assert.deepEqual(validateReleasePr({ ...context, body }).errors, []);
  assert.ok(
    validateReleasePr({
      ...context,
      body: body.replace(/## Release Surface\n[\s\S]*?(?=## Verification)/, ''),
    }).errors.length > 0
  );
});

test('publishing bypasses Changesets PR selection when ignored changesets remain', () => {
  const steps = readWorkflow('.github/workflows/release.yml').jobs.release.steps;
  const publish = steps.find((step) => step.name === 'Publish packages');
  assert.equal(publish.run, 'pnpm publish-release');
  assert.equal(publish.uses, undefined);
  const auth = steps.find((step) => step.name === 'Configure npm authentication');
  assert.equal(auth.if, publish.if);
  assert.equal(auth.env.NPM_CONFIG_USERCONFIG, publish.env.NPM_CONFIG_USERCONFIG);
  assert.match(auth.run, /\$\{NPM_TOKEN\}/);
  assert.match(publish.env.NPM_TOKEN, /secrets\.NPM_TOKEN/);
});

test('release workflow creates version PRs only for a Changesets plan with version bumps', (t) => {
  const workflow = readWorkflow('.github/workflows/release.yml');
  const detect = workflow.jobs['changeset-state'].steps.find((step) => step.id === 'detect');
  const cwd = mkdtempSync(join(tmpdir(), 't3x-release-state-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  mkdirSync(join(cwd, '.changeset'));
  writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  writeFileSync(join(cwd, 'package.json'), '{"name":"release-fixture","private":true}');
  writeFileSync(
    join(cwd, '.changeset/config.json'),
    '{"baseBranch":"main","ignore":["t3x-webui"]}'
  );
  for (const [dir, name] of [
    ['web', 't3x-webui'],
    ['yops', '@t3x-dev/yops'],
  ]) {
    const packageDir = join(cwd, 'packages', dir);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  }

  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Release Test', '-c', 'user.email=release@example.com', ...args],
      {
        cwd,
        stdio: 'pipe',
      }
    );
  git('init', '-b', 'main');
  git('add', '.');
  git('commit', '-m', 'base');

  const output = join(cwd, 'release-state');
  function detectState(event = 'push') {
    writeFileSync(output, '');
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', detect.run], {
      cwd,
      env: {
        ...process.env,
        PATH: [fileURLToPath(new URL('node_modules/.bin', root)), process.env.PATH].join(delimiter),
        GITHUB_OUTPUT: output,
        RELEASE_EVENT: event,
        TMPDIR: cwd,
      },
    });
    return Object.fromEntries(
      readFileSync(output, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split('='))
    );
  }

  assert.equal(detectState().should_release, 'false');
  writeFileSync(join(cwd, '.changeset/web-only.md'), '---\nt3x-webui: patch\n---\n\nWeb only.\n');
  git('add', '.changeset');
  git('commit', '-m', 'Keep ignored WebUI changeset');
  assert.equal(detectState().should_release, 'false');
  writeFileSync(join(cwd, '.changeset/yops.md'), '---\n"@t3x-dev/yops": patch\n---\n\nYOps fix.\n');
  git('add', '.changeset');
  git('commit', '-m', 'Queue YOps patch');
  assert.deepEqual(detectState(), {
    is_version_packages: 'false',
    should_release: 'true',
    should_publish: 'false',
  });
  const publishState = {
    is_version_packages: 'true',
    should_release: 'true',
    should_publish: 'true',
  };
  assert.deepEqual(detectState('workflow_dispatch'), publishState);
  git('commit', '--allow-empty', '-m', 'chore: version packages');
  assert.deepEqual(detectState(), publishState);
});

test('manual recovery only runs on main and passes package input as quoted data', () => {
  const workflow = readWorkflow('.github/workflows/release.yml');
  assert.equal(workflow.on.workflow_dispatch.inputs.packages.required, true);
  assert.equal(workflow.jobs['changeset-state'].if, "github.ref == 'refs/heads/main'");
  assert.equal(workflow.jobs['product-release-record'].if, "github.ref == 'refs/heads/main'");
  const steps = workflow.jobs['changeset-state'].steps;
  const detect = steps.find((step) => step.name === 'Detect release state');
  assert.match(
    detect.run,
    /if \[\[ "\$RELEASE_EVENT" == "workflow_dispatch" \]\]; then\n\s+is_version_packages=true/
  );
  const selection = steps.find((step) => step.id === 'publish');
  assert.match(selection.run, /--packages "\$RETRY_PACKAGES"/);
  assert.match(selection.env.RETRY_PACKAGES, /inputs\.packages/);
});

test('manual retries reject empty, paused, private, unknown, and shell-like package selections', () => {
  const releaseSurface = {
    packages: [
      { name: '@t3x-dev/yops', npm_publish: true, release_train: 'active' },
      { name: '@t3x-dev/yschema', npm_publish: true, release_train: 'active' },
      { name: '@t3x-dev/local', npm_publish: true, release_train: 'paused' },
      { name: '@t3x-dev/core', npm_publish: false, release_train: 'active' },
    ],
  };
  assert.deepEqual(
    selectRetryPackages({ packageSelection: 'yops, @t3x-dev/yschema,yops', releaseSurface }),
    {
      hasPublishPackages: true,
      packageNames: ['@t3x-dev/yops', '@t3x-dev/yschema'],
      packageSlugs: ['yops', 'yschema'],
      publishesLocal: false,
    }
  );
  for (const packageSelection of [
    '',
    ' ',
    'yops,',
    'local',
    'core',
    'missing',
    '$(touch /tmp/x)',
  ]) {
    assert.throws(() => selectRetryPackages({ packageSelection, releaseSurface }));
  }
});
