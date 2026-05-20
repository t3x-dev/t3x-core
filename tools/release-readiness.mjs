#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_SCAN_DIRS = ['apps/web/src/app', 'apps/web/src/components', 'apps/web/src/utils'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const RETIRED_THEME_TOKENS = [
  '--surface-primary',
  '--surface-secondary',
  '--surface-base',
  '--accent-blue',
  '--accent-primary',
];

function repoPath(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

function read(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function exists(relativePath) {
  return existsSync(repoPath(relativePath));
}

function collectSourceFiles(dir, files = []) {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectSourceFiles(fullPath, files);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(fullPath))) {
      files.push(fullPath);
    }
  }

  return files;
}

function sourceContainsRetiredThemeTokens() {
  const matches = [];
  for (const scanDir of SOURCE_SCAN_DIRS) {
    for (const file of collectSourceFiles(repoPath(scanDir))) {
      const relative = path.relative(REPO_ROOT, file);
      const content = readFileSync(file, 'utf8');
      for (const token of RETIRED_THEME_TOKENS) {
        if (content.includes(token)) {
          matches.push(`${relative}: ${token}`);
        }
      }
    }
  }
  return matches;
}

function pass(id, title, detail) {
  return { id, title, status: 'pass', detail };
}

function fail(id, title, detail) {
  return { id, title, status: 'fail', detail };
}

function manual(id, title, detail) {
  return { id, title, status: 'manual', detail };
}

function checkFiles(requiredFiles) {
  return requiredFiles.filter((file) => !exists(file));
}

function releaseReadinessCiCheck() {
  const workflowPath = '.github/workflows/release-readiness.yml';
  if (!exists(workflowPath)) {
    return fail('release-readiness-ci', 'Release readiness CI', `${workflowPath} is missing.`);
  }

  const workflow = read(workflowPath);
  const requiredMarkers = [
    'name: release-readiness',
    'pull_request:',
    'pnpm install --frozen-lockfile',
    'pnpm release:check',
  ];
  const missingMarkers = requiredMarkers.filter((marker) => !workflow.includes(marker));
  if (missingMarkers.length > 0) {
    return fail(
      'release-readiness-ci',
      'Release readiness CI',
      `Release readiness workflow is missing: ${missingMarkers.join(', ')}.`
    );
  }

  return pass(
    'release-readiness-ci',
    'Release readiness CI',
    'GitHub Actions runs pnpm release:check for release-surface changes.'
  );
}

function demoDataProfessionalismCheck() {
  const fixturePath = 'packages/core/src/fixtures/demo-workspace.ts';
  if (!exists(fixturePath)) {
    return fail(
      'demo-data-professionalism',
      'Demo data professionalism',
      `${fixturePath} is missing.`
    );
  }

  const fixture = read(fixturePath);
  const requiredMarkers = [
    "name: 'Prompt Review'",
    'is_demo: true',
    'demo_fixture_id',
    "demo_kind: 'professional_workspace'",
    "label: 'Fixture replay · no LLM call'",
  ];
  const missingMarkers = requiredMarkers.filter((marker) => !fixture.includes(marker));
  if (missingMarkers.length > 0) {
    return fail(
      'demo-data-professionalism',
      'Demo data professionalism',
      `Missing fixture markers: ${missingMarkers.join(', ')}.`
    );
  }

  return pass(
    'demo-data-professionalism',
    'Demo data professionalism',
    'Canonical core demo fixture is marked as a professional demo workspace.'
  );
}

function noKeyFixtureReplayCheck() {
  const requiredFiles = [
    'apps/web/src/app/chat/demo/page.tsx',
    'apps/web/src/hooks/drafts/useFixtureReplay.ts',
    'apps/web/src/components/chat/ProviderSetupBanner.tsx',
    'apps/web/src/__tests__/hooks/useFixtureReplay.test.ts',
    'apps/web/src/__tests__/components/chat/ProviderSetupBanner.test.tsx',
  ];
  const missingFiles = checkFiles(requiredFiles);
  if (missingFiles.length > 0) {
    return fail(
      'no-key-fixture-replay',
      'No-key fixture replay',
      `Missing files: ${missingFiles.join(', ')}.`
    );
  }

  const banner = read('apps/web/src/components/chat/ProviderSetupBanner.tsx');
  const replay = read('apps/web/src/hooks/drafts/useFixtureReplay.ts');
  if (!banner.includes('Try fixture demo') || !banner.includes('/chat/demo')) {
    return fail(
      'no-key-fixture-replay',
      'No-key fixture replay',
      'Provider setup banner does not link to /chat/demo.'
    );
  }
  if (!replay.includes('Fixture replay') || !replay.includes('without calling a provider')) {
    return fail(
      'no-key-fixture-replay',
      'No-key fixture replay',
      'Fixture replay hook does not clearly mark the no-provider path.'
    );
  }

  return pass(
    'no-key-fixture-replay',
    'No-key fixture replay',
    'Banner, route, hook, and tests are present.'
  );
}

function workspaceStatusStripCheck() {
  const requiredFiles = [
    'apps/web/src/components/chat/WorkspaceStatusStrip.tsx',
    'apps/web/src/__tests__/components/chat/WorkspaceStatusStrip.test.tsx',
    'apps/web/src/domain/workspace/actionBarState.ts',
    'apps/web/src/__tests__/domain/workspace/actionBarState.test.ts',
  ];
  const missingFiles = checkFiles(requiredFiles);
  if (missingFiles.length > 0) {
    return fail(
      'workspace-status-strip',
      'Workspace status strip',
      `Missing files: ${missingFiles.join(', ')}.`
    );
  }

  const workspace = read('apps/web/src/components/chat/YOpsWorkspace.tsx');
  if (!workspace.includes('WorkspaceStatusStrip')) {
    return fail(
      'workspace-status-strip',
      'Workspace status strip',
      'YOpsWorkspace is not rendering WorkspaceStatusStrip.'
    );
  }

  return pass(
    'workspace-status-strip',
    'Workspace status strip',
    'Status strip is wired into the YOps workspace.'
  );
}

function canvasInitialZoomCheck() {
  const canvasPath = 'apps/web/src/components/canvas/CanvasWorkspace.tsx';
  if (!exists(canvasPath)) {
    return fail('canvas-initial-zoom', 'Canvas initial zoom', `${canvasPath} is missing.`);
  }

  const canvas = read(canvasPath);
  if (canvas.includes('fitView({ padding: 0.2, duration: 300 })')) {
    return fail(
      'canvas-initial-zoom',
      'Canvas initial zoom',
      'Initial ELK fitView still lacks maxZoom: 1.'
    );
  }
  if (
    !canvas.includes(
      'fitView({ padding: compactViewport ? 0.12 : 0.3, maxZoom: 1, duration: 300 })'
    ) ||
    !canvas.includes('fitViewOptions={{ padding: compactViewport ? 0.12 : 0.3, maxZoom: 1 }}')
  ) {
    return fail(
      'canvas-initial-zoom',
      'Canvas initial zoom',
      'Initial and default fitView paths must cap maxZoom at 1.'
    );
  }

  return pass(
    'canvas-initial-zoom',
    'Canvas initial zoom',
    'Initial canvas fitView and ReactFlow defaults cap zoom at 1.'
  );
}

function mobileCoreWorkflowCheck() {
  const requiredFiles = [
    'apps/web/src/components/chat/MobileWorkspaceSheet.tsx',
    'apps/web/src/__tests__/components/chat/MobileWorkspaceSheet.test.tsx',
    'apps/web/e2e/flows/mobile-yops.spec.ts',
  ];
  const missingFiles = checkFiles(requiredFiles);
  if (missingFiles.length > 0) {
    return fail(
      'mobile-core-workflow',
      'Mobile core workflow',
      `Missing files: ${missingFiles.join(', ')}.`
    );
  }

  const sheet = read('apps/web/src/components/chat/MobileWorkspaceSheet.tsx');
  if (!sheet.includes('Chat') || !sheet.includes('YOps') || !sheet.includes('Result')) {
    return fail(
      'mobile-core-workflow',
      'Mobile core workflow',
      'Mobile workspace sheet lacks Chat/YOps/Result controls.'
    );
  }

  return pass(
    'mobile-core-workflow',
    'Mobile core workflow',
    'Mobile YOps/Result sheet and e2e flow are present.'
  );
}

function visualTokenContractCheck() {
  const retiredMatches = sourceContainsRetiredThemeTokens();
  if (retiredMatches.length > 0) {
    return fail(
      'visual-token-contract',
      'Visual token contract',
      `Retired tokens remain: ${retiredMatches.slice(0, 6).join('; ')}${retiredMatches.length > 6 ? '...' : ''}`
    );
  }

  const contractPath = 'apps/web/src/__tests__/visualTokenContract.test.ts';
  if (!exists(contractPath)) {
    return fail('visual-token-contract', 'Visual token contract', `${contractPath} is missing.`);
  }
  const contract = read(contractPath);
  if (
    !contract.includes('FORBIDDEN_TAILWIND_COLOR') ||
    !contract.includes('RETIRED_THEME_TOKENS')
  ) {
    return fail(
      'visual-token-contract',
      'Visual token contract',
      'Contract test does not cover color drift and retired tokens.'
    );
  }

  return pass(
    'visual-token-contract',
    'Visual token contract',
    'Contract blocks raw color drift and retired token aliases.'
  );
}

function darkModeSurfaceHierarchyCheck() {
  const darkModeSpecPath = 'apps/web/e2e/flows/dark-mode-surfaces.spec.ts';
  if (!exists(darkModeSpecPath)) {
    return fail(
      'dark-mode-surface-hierarchy',
      'Dark-mode surface hierarchy',
      `${darkModeSpecPath} is missing.`
    );
  }

  const retiredMatches = sourceContainsRetiredThemeTokens();
  if (retiredMatches.length > 0) {
    return fail(
      'dark-mode-surface-hierarchy',
      'Dark-mode surface hierarchy',
      `Retired dark-mode aliases still appear in source: ${retiredMatches.slice(0, 6).join('; ')}${retiredMatches.length > 6 ? '...' : ''}`
    );
  }

  const darkModeSpec = read(darkModeSpecPath);
  if (
    !darkModeSpec.includes('desktop dark-mode release surfaces') ||
    !darkModeSpec.includes('width: 1440')
  ) {
    return fail(
      'dark-mode-surface-hierarchy',
      'Dark-mode surface hierarchy',
      'Dark-mode surface coverage must exercise desktop release surfaces.'
    );
  }

  const globals = read('apps/web/src/app/globals.css');
  const requiredDarkTokens = [
    '--surface-app: oklch(0.11 0.005 260);',
    '--surface-panel: oklch(0.15 0.008 260 / 84%);',
    '--surface-card: oklch(0.2 0.008 260 / 93%);',
    '--surface-elevated: oklch(0.22 0.008 260 / 95%);',
  ];
  const missing = requiredDarkTokens.filter((token) => !globals.includes(token));
  if (missing.length > 0) {
    return fail(
      'dark-mode-surface-hierarchy',
      'Dark-mode surface hierarchy',
      `Dark surface token values changed or are missing: ${missing.join(', ')}.`
    );
  }

  return pass(
    'dark-mode-surface-hierarchy',
    'Dark-mode surface hierarchy',
    'Dark mode uses app, panel, card, and elevated surfaces without retired aliases and has desktop E2E coverage.'
  );
}

export function getReleaseReadinessChecks() {
  return [
    releaseReadinessCiCheck(),
    demoDataProfessionalismCheck(),
    noKeyFixtureReplayCheck(),
    workspaceStatusStripCheck(),
    canvasInitialZoomCheck(),
    mobileCoreWorkflowCheck(),
    visualTokenContractCheck(),
    darkModeSurfaceHierarchyCheck(),
    manual(
      'first-screen-comprehension',
      'First-screen comprehension',
      'Manual review: a new user can explain source -> YOps -> commit from the first screen.'
    ),
    manual(
      'secondary-page-public-surface',
      'Secondary page public surface',
      'Manual product decision: Templates and Deploy are either in or out of the current public release promise.'
    ),
  ];
}

export function summarizeReleaseReadiness(checks = getReleaseReadinessChecks()) {
  const totals = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, fail: 0, manual: 0 }
  );

  return {
    checks,
    totals,
    exitCode: totals.fail > 0 ? 1 : 0,
  };
}

export function formatReleaseReadinessReport(summary = summarizeReleaseReadiness()) {
  const lines = [
    'T3X release readiness',
    `pass ${summary.totals.pass} · fail ${summary.totals.fail} · manual ${summary.totals.manual}`,
    '',
  ];

  for (const check of summary.checks) {
    lines.push(`[${check.status}] ${check.title}`);
    lines.push(`  ${check.detail}`);
  }

  return lines.join('\n');
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  const summary = summarizeReleaseReadiness();
  console.log(formatReleaseReadinessReport(summary));
  process.exit(summary.exitCode);
}
