#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.resolve(
  repoRoot,
  process.env.T3X_WORKSPACE_CONCURRENCY_REPORT ??
    'test-results/qualification/workspace-concurrency-gate.json'
);
const startedAt = new Date().toISOString();

const checks = [
  {
    id: 'api-cas-retry-atomicity',
    package: '@t3x-dev/api',
    files: [
      'src/__tests__/transition-decision-commit-routes.test.ts',
      'src/__tests__/workspace-authoring-persistence.test.ts',
    ],
  },
  {
    id: 'web-unsaved-buffer',
    package: 't3x-webui',
    files: ['src/__tests__/components/workspaces/WorkspaceContentEditor.test.tsx'],
  },
  {
    id: 'cli-commit-contract',
    package: '@t3x-dev/cli',
    files: ['src/__tests__/commands/commit.test.ts'],
  },
  {
    id: 'mcp-commit-contract',
    package: '@t3x-dev/mcp-lib',
    files: ['src/__tests__/commit.test.ts', 'src/__tests__/transition.test.ts'],
  },
];

const results = [];
for (const check of checks) {
  const args = ['--filter', check.package, 'exec', 'vitest', 'run', ...check.files];
  console.log(`\n[workspace-concurrency-gate] ${check.id}`);
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
  schema: 't3x.dev/workspace-concurrency-gate/v1',
  task: '04-concurrency-gate',
  status,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  requirements: {
    draft_revision_cas: ['api-cas-retry-atomicity'],
    exact_head_cas: ['api-cas-retry-atomicity'],
    exact_request_retry: ['api-cas-retry-atomicity'],
    atomic_failure_recovery: ['api-cas-retry-atomicity'],
    mixed_web_cli_mcp_entrypoints: [
      'api-cas-retry-atomicity',
      'web-unsaved-buffer',
      'cli-commit-contract',
      'mcp-commit-contract',
    ],
  },
  checks: results,
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n[workspace-concurrency-gate] ${status}: ${reportPath}`);
if (status !== 'passed') process.exitCode = 1;
