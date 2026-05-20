import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatReleaseReadinessReport,
  getReleaseReadinessChecks,
  summarizeReleaseReadiness,
} from '../release-readiness.mjs';

test('package.json exposes the release readiness command', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));

  assert.equal(packageJson.scripts['release:check'], 'node tools/release-readiness.mjs');
});

test('GitHub Actions runs release readiness on WebUI release-surface changes', () => {
  const workflowUrl = new URL('../../.github/workflows/release-readiness.yml', import.meta.url);

  assert.equal(existsSync(workflowUrl), true);

  const workflow = readFileSync(workflowUrl, 'utf8');

  assert.match(workflow, /name:\s*release-readiness/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm release:check/);
});

test('dark-mode readiness is backed by a desktop E2E surface check', () => {
  const specUrl = new URL('../../apps/web/e2e/flows/dark-mode-surfaces.spec.ts', import.meta.url);

  assert.equal(existsSync(specUrl), true);

  const spec = readFileSync(specUrl, 'utf8');

  assert.match(spec, /desktop dark-mode release surfaces/);
  assert.match(spec, /width:\s*1440/);
  assert.doesNotMatch(spec, /375|390|Mobile YOps|mobile-workspace-sheet/);

  const darkModeCheck = getReleaseReadinessChecks().find(
    (check) => check.id === 'dark-mode-surface-hierarchy'
  );

  assert.match(darkModeCheck?.detail ?? '', /desktop E2E/i);
});

test('release readiness covers implemented WebUI evolution blockers', () => {
  const checks = getReleaseReadinessChecks();
  const ids = checks.map((check) => check.id);

  assert.deepEqual(ids, [
    'release-readiness-ci',
    'demo-data-professionalism',
    'no-key-fixture-replay',
    'workspace-status-strip',
    'canvas-initial-zoom',
    'mobile-core-workflow',
    'visual-token-contract',
    'dark-mode-surface-hierarchy',
    'first-screen-comprehension',
    'secondary-page-public-surface',
  ]);

  assert.equal(checks.filter((check) => check.status === 'manual').length, 2);
});

test('release readiness report keeps pass, fail, and manual states explicit', () => {
  const summary = summarizeReleaseReadiness([
    { id: 'passed', title: 'Passed', status: 'pass', detail: 'covered' },
    { id: 'failed', title: 'Failed', status: 'fail', detail: 'missing' },
    { id: 'manual', title: 'Manual', status: 'manual', detail: 'needs review' },
  ]);
  const report = formatReleaseReadinessReport(summary);

  assert.equal(summary.exitCode, 1);
  assert.match(report, /\[pass\] Passed/);
  assert.match(report, /\[fail\] Failed/);
  assert.match(report, /\[manual\] Manual/);
});
