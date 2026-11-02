#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.resolve(
  repoRoot,
  process.env.T3X_WORKSPACE_STRUCTURED_CONFLICT_REPORT ??
    'test-results/qualification/workspace-structured-conflict-gate.json'
);
const startedAt = new Date().toISOString();

const checks = [
  {
    id: 'api-structured-resolution',
    package: '@t3x-dev/api',
    files: [
      'src/__tests__/workspace-reconciliation.test.ts',
      'src/__tests__/workspace-authoring-routes.test.ts',
      'src/__tests__/workspace-ownership.smoke.test.ts',
    ],
  },
  {
    id: 'web-conflict-resolution',
    package: 't3x-webui',
    files: [
      'src/__tests__/hooks/useComposeActivity.test.ts',
      'src/__tests__/components/workspaces/WorkspaceReconciliationResolver.test.tsx',
    ],
  },
  {
    id: 'cli-conflict-resolution',
    package: '@t3x-dev/cli',
    files: ['src/__tests__/commands/workspace.test.ts'],
  },
  {
    id: 'mcp-conflict-resolution',
    package: '@t3x-dev/mcp-lib',
    files: ['src/__tests__/edit.test.ts'],
  },
];

const results = [];
for (const check of checks) {
  const args = ['--filter', check.package, 'exec', 'vitest', 'run', ...check.files];
  console.log(`\n[workspace-structured-conflict-gate] ${check.id}`);
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
  schema: 't3x.dev/workspace-structured-conflict-gate/v1',
  task: '06-structured-conflict-resolution',
  status,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  requirements: {
    stable_base_ours_theirs_conflicts: ['api-structured-resolution'],
    complete_per_conflict_choices: [
      'api-structured-resolution',
      'web-conflict-resolution',
      'cli-conflict-resolution',
      'mcp-conflict-resolution',
    ],
    full_schema_revalidation: ['api-structured-resolution'],
    invalid_result_is_non_destructive: ['api-structured-resolution'],
    actor_choice_and_discard_audit: ['api-structured-resolution'],
  },
  checks: results,
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n[workspace-structured-conflict-gate] ${status}: ${reportPath}`);
if (status !== 'passed') process.exitCode = 1;
