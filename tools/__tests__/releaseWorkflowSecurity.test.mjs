import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

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
