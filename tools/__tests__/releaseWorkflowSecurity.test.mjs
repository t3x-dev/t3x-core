import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { selectRetryPackages } from '../detect-publish-packages.mjs';

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
