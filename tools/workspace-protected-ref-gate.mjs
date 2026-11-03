#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.resolve(
  repoRoot,
  process.env.T3X_WORKSPACE_PROTECTED_REF_REPORT ??
    'test-results/qualification/workspace-protected-ref-gate.json'
);
const startedAt = new Date().toISOString();

const checks = [
  {
    id: 'api-protected-ref-pr-lifecycle',
    package: '@t3x-dev/api',
    files: [
      'src/__tests__/pull-requests.test.ts',
      'src/__tests__/pull-request-yops-merge.test.ts',
      'src/__tests__/branches.test.ts',
      'src/__tests__/transition-decision-commit-routes.test.ts',
    ],
  },
  {
    id: 'application-independent-proposer-decider',
    package: '@t3x-dev/application',
    files: ['src/__tests__/repository-writers.test.ts'],
  },
  {
    id: 'storage-pr-audit',
    package: '@t3x-dev/storage',
    files: ['src/__tests__/pull-requests.test.ts'],
  },
  {
    id: 'web-protection-and-audit',
    package: 't3x-webui',
    files: [
      'src/__tests__/components/project/ProjectBranchRulesSettings.test.tsx',
      'src/__tests__/components/project/ProjectReviewsTab.test.tsx',
    ],
  },
  {
    id: 'cli-protected-commit-contract',
    package: '@t3x-dev/cli',
    files: ['src/__tests__/commands/commit.test.ts'],
  },
  {
    id: 'mcp-protected-commit-contract',
    package: '@t3x-dev/mcp-lib',
    files: ['src/__tests__/commit.test.ts', 'src/__tests__/transition.test.ts'],
  },
];

const results = [];
for (const check of checks) {
  const args = ['--filter', check.package, 'exec', 'vitest', 'run', ...check.files];
  console.log(`\n[workspace-protected-ref-gate] ${check.id}`);
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
  schema: 't3x.dev/workspace-protected-ref-gate/v1',
  task: '09-optional-pr-and-protected-refs',
  status,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  requirements: {
    optional_pr_for_cross_branch_acceptance: ['api-protected-ref-pr-lifecycle'],
    protected_ref_policy_at_authoritative_advance: [
      'api-protected-ref-pr-lifecycle',
      'application-independent-proposer-decider',
    ],
    separate_create_verify_decide_commit_authority: ['api-protected-ref-pr-lifecycle'],
    stale_readiness_never_advances: ['api-protected-ref-pr-lifecycle'],
    multiple_source_commits: ['api-protected-ref-pr-lifecycle'],
    structured_actor_revision_decision_audit: [
      'api-protected-ref-pr-lifecycle',
      'storage-pr-audit',
      'web-protection-and-audit',
    ],
    web_cli_mcp_entrypoint_contracts: [
      'web-protection-and-audit',
      'cli-protected-commit-contract',
      'mcp-protected-commit-contract',
    ],
  },
  checks: results,
};

mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n[workspace-protected-ref-gate] ${status}: ${reportPath}`);
if (status !== 'passed') process.exitCode = 1;
