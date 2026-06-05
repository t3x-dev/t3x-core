import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);

async function loadPrContext() {
  try {
    return await import('../lib/releaseReadinessPrContext.mjs');
  } catch (error) {
    assert.fail(`release readiness PR context library should load: ${error.message}`);
  }
}

test('release readiness workflow generates, comments, and uploads one report', () => {
  const workflow = readText('.github/workflows/release-readiness.yml');

  assert.match(workflow, /^name: Release Readiness$/m);
  assert.match(workflow, /^\s+pull_request:$/m);
  assert.match(workflow, /^\s+issues: write$/m);
  assert.match(workflow, /^\s+pull-requests: write$/m);
  assert.match(workflow, /tools\/release-readiness\/generate\.mjs/);
  assert.match(workflow, /node tools\/standards\/run-all\.mjs/);
  assert.doesNotMatch(workflow, /pnpm standards:run/);
  assert.match(workflow, /tools\/release-readiness\/upsert-comment\.mjs/);
  assert.match(workflow, /t3x-release-readiness-report:v1/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /release-readiness\.json/);
  assert.match(workflow, /release-readiness\.md/);
});

test('release readiness signoff workflow handles only owner commands on PR comments', () => {
  const workflow = readText('.github/workflows/release-readiness-signoff.yml');

  assert.match(workflow, /^name: Release Readiness Signoff$/m);
  assert.match(workflow, /^\s+issue_comment:$/m);
  assert.match(workflow, /github\.event\.issue\.pull_request/);
  assert.match(workflow, /\/t3x readiness/);
  assert.match(workflow, /release_bound/);
  assert.match(workflow, /tools\/release-readiness\/pr-context\.mjs/);
  assert.match(workflow, /^\s+issues: write$/m);
  assert.match(workflow, /^\s+pull-requests: read$/m);
  assert.match(workflow, /tools\/release-readiness\/signoff\.mjs/);
  assert.match(workflow, /tools\/release-readiness\/upsert-comment\.mjs/);
  assert.match(workflow, /t3x-release-readiness-signoff:v1/);
  assert.match(workflow, /tools\/release-readiness\/generate\.mjs/);
  assert.match(workflow, /node tools\/standards\/run-all\.mjs/);
  assert.doesNotMatch(workflow, /pnpm standards:run/);
});

test('release readiness PR context only treats same-repo release-bound PRs as eligible', async () => {
  const { resolveReleaseReadinessPrContext } = await loadPrContext();

  assert.deepEqual(
    resolveReleaseReadinessPrContext({
      repository: 't3x-dev/t3x-core',
      pullRequest: {
        number: 1087,
        base: { ref: 'main', sha: 'base-sha' },
        head: {
          ref: 'release/0.4.0',
          sha: 'head-sha',
          repo: { full_name: 't3x-dev/t3x-core' },
        },
        body: 'T3X product release version: `0.4.0`',
      },
    }),
    {
      release_bound: true,
      pr_number: 1087,
      base_ref: 'main',
      base_sha: 'base-sha',
      head_ref: 'release/0.4.0',
      head_sha: 'head-sha',
      product_version: '0.4.0',
      pr_body: 'T3X product release version: `0.4.0`',
    }
  );

  assert.equal(
    resolveReleaseReadinessPrContext({
      repository: 't3x-dev/t3x-core',
      pullRequest: {
        base: { ref: 'dev' },
        head: { ref: 'feature/x', repo: { full_name: 't3x-dev/t3x-core' } },
      },
    }).release_bound,
    false
  );
  assert.equal(
    resolveReleaseReadinessPrContext({
      repository: 't3x-dev/t3x-core',
      pullRequest: {
        base: { ref: 'main' },
        head: { ref: 'release/0.4.0', repo: { full_name: 'fork/t3x-core' } },
      },
    }).release_bound,
    false
  );
});

function readText(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8');
}
