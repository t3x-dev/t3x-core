#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.resolve(
  repoRoot,
  process.env.T3X_WORKSPACE_RECONCILIATION_REPORT ??
    'test-results/qualification/workspace-reconciliation-gate.json'
);
const startedAt = new Date().toISOString();

const checks = [
  {
    id: 'api-two-principal-reconciliation',
    package: '@t3x-dev/api',
    files: [
      'src/__tests__/workspace-reconciliation.test.ts',
      'src/__tests__/workspace-authoring-routes.test.ts',
      'src/__tests__/workspace-ownership.smoke.test.ts',
    ],
  },
  {
    id: 'storage-branch-advance-event',
    package: '@t3x-dev/storage',
    files: ['src/__tests__/events.test.ts'],
  },
  {
    id: 'web-explicit-reconciliation',
    package: 't3x-webui',
    files: [
      'src/__tests__/hooks/useComposeActivity.test.ts',
      'src/__tests__/hooks/workspaces/useProjectWorkspaces.test.ts',
    ],
  },
  {
    id: 'cli-explicit-reconciliation',
    package: '@t3x-dev/cli',
    files: ['src/__tests__/commands/workspace.test.ts'],
  },
  {
    id: 'mcp-explicit-reconciliation',
    package: '@t3x-dev/mcp-lib',
    files: ['src/__tests__/edit.test.ts'],
  },
];

const results = [];
for (const check of checks) {
  const args = ['--filter', check.package, 'exec', 'vitest', 'run', ...check.files];
  console.log(`\n[workspace-reconciliation-gate] ${check.id}`);
  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });
  results.push({
    id: check.id,
    command: ['pnpm', ...args].join(' '),
    status: result.status === 0 ? 'passed' : 'failed',
    exit_code: result.status ?? 1,
    ...(result.error === undefined ? {} : { error: result.error.message }),
  });
}

const status = results.every((result) => result.status === 'passed') ? 'passed' : 'failed';
const report = {
  schema: 't3x.dev/workspace-reconciliation-gate/v1',
  task: '05-branch-notice-and-sync',
  status,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  requirements: {
    branch_advance_notification: [
      'api-two-principal-reconciliation',
      'storage-branch-advance-event',
      'web-explicit-reconciliation',
    ],
    private_draft_preservation: ['api-two-principal-reconciliation'],
    revision_bound_preview: ['api-two-principal-reconciliation'],
    explicit_adopt_cancel_discard: [
      'api-two-principal-reconciliation',
      'web-explicit-reconciliation',
      'cli-explicit-reconciliation',
      'mcp-explicit-reconciliation',
    ],
    actor_and_decision_audit: ['api-two-principal-reconciliation'],
  },
  checks: results,
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n[workspace-reconciliation-gate] ${status}: ${reportPath}`);
if (status !== 'passed') process.exitCode = 1;
