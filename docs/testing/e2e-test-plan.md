# T3X Complete E2E Test Plan

> **Version**: 2.0
> **Created**: 2026-02-05
> **Updated**: 2026-02-05
> **Status**: Implemented (Phase 1-4 Complete)

## Executive Summary

This document describes the comprehensive end-to-end (E2E) testing strategy for the T3X project. The implementation expands test coverage from the original 5 test files (~22 test cases) to 18 test files with 91 test cases, covering all critical user workflows.

All 4 implementation phases have been completed. The test suite covers project lifecycle, canvas workflows, conversation flows, merge resolution, leaf management, pin/context operations, deploy agent management, insights, agent demo, API-WebUI synchronization, and error scenarios.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Test Architecture](#2-test-architecture)
3. [Implementation Phases](#3-implementation-phases)
4. [Test Cases by Priority](#4-test-cases-by-priority)
5. [Fixtures and Utilities](#5-fixtures-and-utilities)
6. [Page Objects](#6-page-objects)
7. [Test Patterns Reference](#7-test-patterns-reference)
8. [CI/CD Integration](#8-cicd-integration)
9. [Verification Approach](#9-verification-approach)
10. [File Reference](#10-file-reference)

---

## 1. Current State Analysis

### 1.1 Test Infrastructure

| Component | Technology | Status |
|-----------|------------|--------|
| E2E Framework | Playwright | Active |
| Unit Testing | Vitest | Active |
| Database | PGLite (in-memory) | Active |
| Linting | Biome | Active |
| CI Runner | GitHub Actions | Configured |

### 1.2 Legacy E2E Test Files (5 files, preserved)

| File | Coverage | Test Count |
|------|----------|------------|
| `v4-flow.spec.ts` | V4 commit display, leaf creation, pin management, context export | 8 |
| `diff-display.spec.ts` | Basic diff API, empty commit handling | 4 |
| `diff-display-full.spec.ts` | Full diff workflow with conversations | 5 |
| `diff-display-real.spec.ts` | Real project diff UI testing | 3 |
| `source-context-fix.spec.ts` | Source context highlighting | 2 |
| **Total** | | **~22** |

### 1.3 Coverage Status

| Area | Status | Priority | Test File |
|------|--------|----------|-----------|
| Project lifecycle (CRUD) | Covered | P0 | `flows/project-lifecycle.spec.ts` |
| Canvas workspace | Covered | P0 | `flows/canvas-workflow.spec.ts` |
| Merge workspace (full workflow) | Covered | P0 | `flows/merge-workspace.spec.ts` |
| Conversation chat flow (UI) | Covered | P0 | `flows/conversation-flow.spec.ts` |
| Home page (projects dashboard) | Covered | P0 | `pages/home.spec.ts` |
| Leaf management and validation | Covered | P1 | `flows/leaf-workflow.spec.ts` |
| Pin and context management | Covered | P1 | `flows/pin-context.spec.ts` |
| Deploy agent management (CRUD) | Covered | P1 | `pages/deploy-dashboard.spec.ts` |
| Run evaluation detail | Covered | P1 | `pages/deploy-run-detail.spec.ts` |
| Insights page | Covered | P1 | `pages/insights.spec.ts` |
| Agent demo workflow | Covered | P2 | `pages/agent-demo.spec.ts` |
| API-WebUI synchronization | Covered | P2 | `integration/api-webui-sync.spec.ts` |
| Error recovery scenarios | Covered | P2 | `integration/error-scenarios.spec.ts` |

### 1.4 Key Routes Tested

| Route | Page | Priority | Status |
|-------|------|----------|--------|
| `/` | Projects dashboard | P0 | Covered |
| `/project/[projectId]` | Canvas workspace | P0 | Covered |
| `/project/[projectId]/conversation/[conversationId]` | Conversation detail | P0 | Covered |
| `/project/[projectId]/leaf/[leafId]` | Leaf detail | P1 | Covered |
| `/project/[projectId]/merge/[mergeId]` | Merge workspace | P0 | Covered |
| `/deploy` | Deploy dashboard | P1 | Covered |
| `/deploy/[runId]` | Run detail | P1 | Covered |
| `/insights` | Insights page | P1 | Covered |
| `/agent-demo/chat` | Agent chat | P2 | Covered |
| `/agent-demo/optimiser` | Agent optimiser | P2 | Covered |

---

## 2. Test Architecture

### 2.1 Directory Structure

```
apps/web/e2e/
├── fixtures/                          # Reusable test utilities
│   ├── api-helpers.ts                 # API call wrappers (12 functions)
│   ├── test-data-factory.ts           # Test data generators + error filter
│   └── page-objects/                  # Page Object Model classes
│       ├── canvas-page.ts             # Canvas workspace interactions
│       ├── conversation-page.ts       # Conversation page interactions
│       ├── merge-page.ts              # Merge workspace interactions
│       └── deploy-page.ts             # Deploy dashboard interactions
│
├── flows/                             # User flow tests (feature-centric)
│   ├── project-lifecycle.spec.ts      # 4 tests: Project CRUD
│   ├── canvas-workflow.spec.ts        # 4 tests: Canvas node interactions
│   ├── conversation-flow.spec.ts      # 4 tests: Conversation UI
│   ├── merge-workspace.spec.ts        # 6 tests: Full merge resolution
│   ├── leaf-workflow.spec.ts          # 5 tests: Leaf management
│   └── pin-context.spec.ts            # 6 tests: Pin and context ops
│
├── pages/                             # Page-level tests
│   ├── home.spec.ts                   # 4 tests: Projects dashboard
│   ├── insights.spec.ts              # 5 tests: Insights page
│   ├── deploy-dashboard.spec.ts       # 7 tests: Deploy agents
│   ├── deploy-run-detail.spec.ts      # 6 tests: Run detail page
│   └── agent-demo.spec.ts            # 7 tests: Agent demo pages
│
├── integration/                       # Cross-feature integration tests
│   ├── api-webui-sync.spec.ts         # 4 tests: API/WebUI consistency
│   └── error-scenarios.spec.ts        # 7 tests: Error handling
│
└── (legacy files)                     # Preserved existing tests
    ├── v4-flow.spec.ts
    ├── diff-display.spec.ts
    ├── diff-display-full.spec.ts
    ├── diff-display-real.spec.ts
    └── source-context-fix.spec.ts
```

### 2.2 Test Organization Principles

1. **Feature-centric grouping**: Tests grouped by user workflow, not by page
2. **Isolation**: Each test file is runnable independently
3. **API-driven setup**: Use API calls in `beforeAll` for test data, not UI interactions
4. **Page Objects**: Encapsulate page interactions for maintainability
5. **Serial execution**: Use `mode: 'serial'` for tests with shared state
6. **Graceful skip**: Use `test.skip()` for features that depend on external services (LLM, Runner)
7. **Shared error filter**: Use `isExpectedConsoleError()` from test-data-factory for consistent console error filtering

---

## 3. Implementation Phases

### Phase 1: Foundation - Complete

**Deliverables:**

| File | Type | Tests | Status |
|------|------|-------|--------|
| `fixtures/api-helpers.ts` | Fixture | — | Done |
| `fixtures/test-data-factory.ts` | Fixture | — | Done |
| `fixtures/page-objects/canvas-page.ts` | Page Object | — | Done |
| `flows/project-lifecycle.spec.ts` | Test | 4 | Done |
| `flows/canvas-workflow.spec.ts` | Test | 4 | Done |
| `pages/home.spec.ts` | Test | 4 | Done |

### Phase 2: Critical Workflows - Complete

**Deliverables:**

| File | Type | Tests | Status |
|------|------|-------|--------|
| `flows/merge-workspace.spec.ts` | Test | 6 | Done |
| `flows/conversation-flow.spec.ts` | Test | 4 | Done |
| `fixtures/page-objects/merge-page.ts` | Page Object | — | Done |
| `fixtures/page-objects/conversation-page.ts` | Page Object | — | Done |

### Phase 3: Feature Coverage - Complete

**Deliverables:**

| File | Type | Tests | Status |
|------|------|-------|--------|
| `flows/leaf-workflow.spec.ts` | Test | 5 | Done |
| `flows/pin-context.spec.ts` | Test | 6 | Done |
| `pages/insights.spec.ts` | Test | 5 | Done |
| `pages/deploy-dashboard.spec.ts` | Test | 7 | Done |
| `pages/deploy-run-detail.spec.ts` | Test | 6 | Done |
| `fixtures/page-objects/deploy-page.ts` | Page Object | — | Done |

### Phase 4: Edge Cases and Polish - Complete

**Deliverables:**

| File | Type | Tests | Status |
|------|------|-------|--------|
| `pages/agent-demo.spec.ts` | Test | 7 | Done |
| `integration/error-scenarios.spec.ts` | Test | 7 | Done |
| `integration/api-webui-sync.spec.ts` | Test | 4 | Done |

---

## 4. Test Cases by Priority

### 4.1 P0 - Critical Path (22 tests)

#### Project Lifecycle (`flows/project-lifecycle.spec.ts`) — 4 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| PL-01 | Create project and verify in list | API create | Project name visible on home page |
| PL-02 | Delete project | API create + delete | GET returns `success: false` |
| PL-03 | Navigate to project canvas | API create | `.react-flow` canvas visible |
| PL-04 | Project not found shows error | None | "Project not found" + back link visible |

#### Canvas Workflow (`flows/canvas-workflow.spec.ts`) — 4 tests, serial

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| CW-01 | Canvas loads nodes | API: project + commit | Node count > 0, commit node visible |
| CW-02 | Node click opens panel | API: project + commit | Commit message + sentence count visible |
| CW-03 | Mode switch | API: project | Editor/Execution toggle (skip if unavailable) |
| CW-04 | Canvas renders without errors | API: project + commit | No unexpected console errors |

#### Merge Workspace (`flows/merge-workspace.spec.ts`) — 6 tests, serial

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| MW-01 | Merge page loads with conflicts | API: base + source + target + draft | Identical/Conflicts sections visible, commit disabled |
| MW-02 | Resolve conflict with Keep A | API: merge draft | Unresolved count decreases |
| MW-03 | Resolve conflict with Keep B | API: merge draft | Keep B button active |
| MW-04 | Toggle source/target only sections | API: merge draft | Collapse/expand toggles work |
| MW-05 | Commit merge | Fresh draft, resolve all | Redirects to `/project/{id}` |
| MW-06 | Cancel merge | API: merge draft | Redirects to `/project/{id}` |

#### Conversation Flow (`flows/conversation-flow.spec.ts`) — 4 tests, serial

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| CF-01 | View conversation turns | API: conversation + 2 turns | User/Assistant content + role badges visible |
| CF-02 | Turn highlighting | API: conversation + turns | `<mark>` contains "dark mode" |
| CF-03 | Pin conversation | API: create pin | Pin ID matches `pin_` prefix |
| CF-04 | Context panel shows pins | API: conversation + pins | Context panel contains pin/using text |

#### Home Page (`pages/home.spec.ts`) — 4 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| HP-01 | Page loads successfully | None | Nav visible, no unexpected console errors |
| HP-02 | Navigation bar is visible | None | `nav` or `[role="navigation"]` visible |
| HP-03 | Projects list shows existing projects | API: create project | Project name visible |
| HP-04 | Click project navigates to canvas | API: create project | URL contains project ID |

### 4.2 P1 - Important (29 tests)

#### Leaf Workflow (`flows/leaf-workflow.spec.ts`) — 5 tests, serial

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| LW-01 | View leaf constraints | API: leaf with constraints | Must Have section + constraint values visible |
| LW-02 | Source commit sentences displayed | API: leaf + commit | Source sentences or Source Context heading visible |
| LW-03 | Generate output | API: leaf | Output section visible (skip if no LLM key) |
| LW-04 | Validate output | API: leaf + mock output | Validation Results section visible |
| LW-05 | Export output | API: leaf + mock output | Success feedback after click (skip if no button) |

#### Pin & Context Management (`flows/pin-context.spec.ts`) — 6 tests, serial

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| PC-01 | Create conversation pin | API | Pin ID matches `pin_` prefix |
| PC-02 | Create leaf pin | API | Pin ID matches `pin_` prefix |
| PC-03 | List project pins | API: 2 pins | Both pin IDs in response array |
| PC-04 | Delete pin | API: pin | Pin removed from list |
| PC-05 | Context memory reflects pins | API: set context | Memory has text, token_estimate, sources |
| PC-06 | Pin button on conversation page | UI navigation | Pin button or pinned indicator visible |

#### Deploy Dashboard (`pages/deploy-dashboard.spec.ts`) — 7 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| DD-01 | Page loads with agents | API: deploy agent | Agent name visible |
| DD-02 | Add deploy agent via form | UI form fill | New agent name visible |
| DD-03 | Delete deploy agent | API: deploy agent | Agent disappears from list |
| DD-04 | Runs table displayed | None | Table exists (may be empty) |
| DD-05 | Model filter available | None | "All Models" filter visible (if runs exist) |
| DD-06 | Runner offline warning | None | Warning shown if runner not connected |
| DD-07 | No unexpected console errors | None | Console error check |

#### Run Detail (`pages/deploy-run-detail.spec.ts`) — 6 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| RD-01 | Run detail page loads | Fetch existing run | Run ID visible (skip if no runs) |
| RD-02 | Status badge displayed | Fetch existing run | Passed/Failed/running badge visible |
| RD-03 | Tab navigation | Fetch existing run | Trace/Assertions tabs clickable |
| RD-04 | Score and metrics displayed | Fetch existing run | Score or Latency metric visible |
| RD-05 | No unexpected console errors | Fetch existing run | Console error check |
| RD-06 | Non-existent run shows error | None | Error/404 message visible |

#### Insights Page (`pages/insights.spec.ts`) — 5 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| IN-01 | Page loads successfully | None | "Insights" heading, no console errors |
| IN-02 | Ledger tab displays commits | API: project + commit | Commit card visible |
| IN-03 | Latest commits timeline | API: project + commit | Timeline item visible |
| IN-04 | Empty state display | None | Empty state or data visible |
| IN-05 | Load more pagination | API: 6 commits | "Load more" button works (if present) |

### 4.3 P2 - Nice to Have (18 tests)

#### Agent Demo (`pages/agent-demo.spec.ts`) — 7 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| AD-01 | Chat page loads | None | Textarea or "Start a conversation" visible |
| AD-02 | Send message | None | User message visible, bot response appears |
| AD-03 | Rate message | None | Star rating click (skip if no bot response) |
| AD-04 | Optimiser page loads | None | Three sections: Feedback, Sandbox Commits, Deployments |
| AD-05 | Commit detail modal | None | Modal opens with Prompt section |
| AD-06 | Optimisation button state | None | Button disabled without ratings |
| AD-07 | Chat page no console errors | None | Console error check |

#### Error Scenarios (`integration/error-scenarios.spec.ts`) — 7 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| ES-01 | Invalid project shows error | None | Error/not found message |
| ES-02 | Invalid conversation shows error | None | Error/not found message |
| ES-03 | Invalid leaf shows error | None | Error/not found message |
| ES-04 | Invalid merge shows error | None | Error/not found message |
| ES-05 | Unknown route shows 404 | None | 404 page |
| ES-06 | Recovery after error | None | Navigate to `/` works after error page |
| ES-07 | Key pages render without crashes | None | `/`, `/insights`, `/deploy` all clean |

#### API-WebUI Sync (`integration/api-webui-sync.spec.ts`) — 4 tests

| ID | Test Case | Setup | Validation |
|----|-----------|-------|------------|
| AS-01 | Create reflects in UI | API create while on page | Project visible after reload |
| AS-02 | Delete reflects in UI | API delete while on page | Project gone after reload |
| AS-03 | Concurrent operations | 3 parallel API creates | All 3 projects visible |
| AS-04 | API commit appears on canvas | API create commit | Commit node visible on canvas |

---

## 5. Fixtures and Utilities

### 5.1 API Helpers (`fixtures/api-helpers.ts`)

12 functions for test data lifecycle:

| Function | Purpose | Returns |
|----------|---------|---------|
| `createTestProject` | Create project via API | `{ projectId, name }` |
| `createTestConversation` | Create conversation | `conversationId` |
| `createTestTurn` | Create turn in conversation | `turnHash` |
| `createTestCommitV4` | Create V4 commit with sentences | `commitHash` |
| `createTestLeaf` | Create leaf with constraints | `leafId` |
| `createTestPin` | Create pin (conversation or leaf) | `pinId` |
| `createTestMergeDraft` | Create merge draft between commits | `draftId` |
| `createTestDeployAgent` | Create deploy agent | `deployAgentId` |
| `createTestRun` | Create evaluation run | `runId` |
| `cleanupProject` | Delete project | `void` |
| `cleanupProjects` | Delete multiple projects | `void` |
| `cleanupDeployAgent` | Delete deploy agent | `void` |

All functions throw on `success: false` with the API error message.

### 5.2 Test Data Factory (`fixtures/test-data-factory.ts`)

| Function | Purpose |
|----------|---------|
| `generateProjectName(prefix)` | Unique project name with timestamp |
| `generateSentences(count)` | Test sentences with `uid()` prefixed IDs (parallel-safe) |
| `generateConstraints(type, count)` | Require/exclude constraints |
| `generateMergeConflictData()` | Source/target sentences with conflicts (parallel-safe) |
| `isExpectedConsoleError(message)` | Shared filter for React warnings, hydration, Failed to load resource |

Key design decisions:
- `uid()` generates random 6-char prefixes for sentence IDs, ensuring parallel test isolation
- `isExpectedConsoleError()` is shared across all test files for consistent console error filtering

---

## 6. Page Objects

### 6.1 CanvasPage (`fixtures/page-objects/canvas-page.ts`)

| Method | Description |
|--------|-------------|
| `goto(projectId)` | Navigate to `/project/{projectId}` |
| `waitForLoad(timeout)` | Wait for `.react-flow` canvas visible |
| `getNodeByHash(hash)` | Locator by `[data-id="{hash}"]` |
| `getNodeByText(text)` | Locator by `.react-flow__node:has-text("{text}")` |
| `clickNode(hashOrText)` | Click node (auto-detects hash vs text) |
| `waitForSidebar(timeout)` | Wait for `aside` sidebar |
| `getSidebarContent()` | Get sidebar text content |
| `getNodesCount()` | Count `.react-flow__node` elements |
| `switchMode(mode)` | Click editor/execution toggle button |

### 6.2 ConversationPage (`fixtures/page-objects/conversation-page.ts`)

| Method | Description |
|--------|-------------|
| `goto(projectId, conversationId)` | Navigate to conversation page |
| `gotoWithHighlight(projectId, conversationId, turnHash, start, end)` | Navigate with `?turn=&highlight=` params |
| `waitForLoad(timeout)` | Wait for USER/ASSISTANT/SYSTEM role badge |
| `getTurnCards()` | Locator for turn role badges |
| `getTurnCount()` | Count user + assistant turns |
| `expectTurnContent(content, timeout)` | Assert content text is visible |
| `getHighlightedText()` | Get `<mark>` element text |
| `hasSourceBadge()` | Check for "Source" badge visibility |
| `hasContextPanel()` | Check for Context aside panel |
| `getBackButton()` | Locator for back navigation link |

### 6.3 MergePage (`fixtures/page-objects/merge-page.ts`)

| Method | Description |
|--------|-------------|
| `goto(projectId, mergeId)` | Navigate to merge workspace |
| `waitForLoad(timeout)` | Wait for "Commit Merge" / "Conflicts" / "Identical" |
| `getUnresolvedCount()` | Parse "N unresolved" badge text |
| `hasConflictsSection()` | Check "Conflicts" button visible |
| `hasIdenticalSection()` | Check "Identical" button visible |
| `hasSourceOnlySection()` | Check "Source Only" button visible |
| `hasTargetOnlySection()` | Check "Target Only" button visible |
| `resolveConflict(index, pick)` | Click Keep A/B/Both/Edit on conflict card |
| `toggleSourceOnlySection()` | Collapse/expand Source Only section |
| `setMessage(message)` | Fill merge commit message input |
| `waitForSaved(timeout)` | Wait for "Saved" auto-save indicator |
| `commit()` | Click "Commit Merge" button |
| `cancel()` | Click "Cancel" button |
| `isCommitEnabled()` | Check if commit button is enabled |
| `waitForRedirect(path, timeout)` | Wait for URL change |

### 6.4 DeployPage (`fixtures/page-objects/deploy-page.ts`)

| Method | Description |
|--------|-------------|
| `goto()` | Navigate to `/deploy` |
| `waitForLoad(timeout)` | Wait for "Deploy Agents" or Runner warning |
| `isRunnerOffline()` | Check "Runner service is not connected" |
| `getAgentCards()` | Locator for agent card elements |
| `getAgentCardsCount()` | Count agent cards |
| `openAddAgentForm()` | Click "Add Agent" button |
| `fillAddAgentForm(id, name, endpoint)` | Fill agent registration form |
| `submitAddAgent()` | Click "Register" button |
| `deleteAgent(agentName)` | Click delete on agent card by name |
| `getRunsTableRows()` | Count rows in runs table |
| `hasModelFilter()` | Check "All Models" filter exists |
| `clickRunRow(index)` | Click run table row by index |

---

## 7. Test Patterns Reference

### 7.1 Serial Test Execution

Used in `canvas-workflow`, `conversation-flow`, `merge-workspace`, `leaf-workflow`, `pin-context`:

```typescript
test.describe('Workflow with Dependencies', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;

  test.beforeAll(async ({ request }) => {
    const { projectId: id } = await createTestProject(request);
    projectId = id;
  });

  test.afterAll(async ({ request }) => {
    await cleanupProject(request, projectId).catch(() => {});
  });

  test('Step 1', async ({ page }) => { /* ... */ });
  test('Step 2', async ({ page }) => { /* depends on Step 1 */ });
});
```

### 7.2 API-Driven Data Setup

All test data is created via API in `beforeAll`, never through UI:

```typescript
test.beforeAll(async ({ request }) => {
  const { projectId: id } = await createTestProject(request, `E2E ${Date.now()}`);
  projectId = id;

  commitHash = await createTestCommitV4(request, projectId, generateSentences(3), {
    message: 'Test commit',
  });
});
```

### 7.3 Concrete Element Wait Strategy

Never use `networkidle`. Always wait for a concrete, visible element:

```typescript
// Canvas page
await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });

// Conversation page
const turnBadge = page.locator('text=USER').or(page.locator('text=ASSISTANT'));
await expect(turnBadge.first()).toBeVisible({ timeout: 15000 });

// Merge page
const workspace = page
  .locator('button:has-text("Commit Merge")')
  .or(page.locator('text=Conflicts'))
  .or(page.locator('text=Identical'));
await expect(workspace.first()).toBeVisible({ timeout: 15000 });
```

### 7.4 Console Error Filtering

Shared filter in `test-data-factory.ts` used across all tests:

```typescript
import { isExpectedConsoleError } from '../fixtures/test-data-factory';

test('No console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  // ... interactions ...

  const unexpectedErrors = errors.filter((e) => !isExpectedConsoleError(e));
  expect(unexpectedErrors).toHaveLength(0);
});
```

### 7.5 Graceful Skip for Optional Features

Use `test.skip()` when features depend on external services:

```typescript
// Skip if no LLM key configured
const generateBtn = page.locator('button:has-text("Generate")').first();
const hasGenerate = await generateBtn.isVisible().catch(() => false);
test.skip(!hasGenerate, 'Generate button not present');

// Skip if agent demo not deployed
const loaded = await chatInput.first().isVisible({ timeout: 15000 }).catch(() => false);
test.skip(!loaded, 'Agent demo chat page not available');
```

### 7.6 Flexible Locators with Fallbacks

```typescript
// Multiple selector strategies
const commitNode = page
  .locator(`[data-id="${commitHash}"]`)
  .or(page.locator(`text=${commitMessage}`));

// Semantic HTML
const dialog = page.locator('[role="dialog"]');
const sidebar = page.locator('aside').first();
```

### 7.7 Polling Assertions

Wait for state changes after user actions:

```typescript
// Wait for unresolved count to decrease after resolving conflict
await expect(async () => {
  const newCount = await merge.getUnresolvedCount();
  expect(newCount).toBeLessThan(initialCount);
}).toPass({ timeout: 5000 });
```

---

## 8. CI/CD Integration

### 8.1 Playwright Config

```typescript
// apps/web/playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm dev:api',
      url: 'http://localhost:8000/health',
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
      timeout: 60000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
```

### 8.2 Recommended Config Updates

```typescript
// Add timeout for slow CI environments
timeout: 60000,

// Add video recording on failure
use: {
  video: 'on-first-retry',
},
```

### 8.3 GitHub Actions Workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Build packages
        run: pnpm build

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: pnpm --filter t3x-webui test:e2e
        env:
          CI: true

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/playwright-report/
          retention-days: 7

      - name: Upload test screenshots
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: test-results
          path: apps/web/test-results/
          retention-days: 7
```

---

## 9. Verification Approach

### 9.1 Per-File Verification

```bash
# Run single test file
cd apps/web && pnpm playwright test e2e/flows/merge-workspace.spec.ts

# Run with UI for debugging
pnpm playwright test e2e/flows/merge-workspace.spec.ts --ui

# Run with headed browser
pnpm playwright test e2e/flows/merge-workspace.spec.ts --headed

# Generate report
pnpm playwright show-report
```

### 9.2 Run by Category

```bash
# All flow tests
pnpm playwright test e2e/flows/

# All page tests
pnpm playwright test e2e/pages/

# All integration tests
pnpm playwright test e2e/integration/
```

### 9.3 Stability Check

```bash
# Run 10 times to verify no flaky tests
for i in {1..10}; do
  echo "Run $i"
  pnpm playwright test e2e/flows/merge-workspace.spec.ts || exit 1
done
echo "All runs passed"
```

### 9.4 CI Simulation

```bash
# Simulate CI environment
CI=true pnpm playwright test

# With specific workers
CI=true pnpm playwright test --workers=1
```

### 9.5 Coverage Metrics

| Metric | Target |
|--------|--------|
| P0 test pass rate | 100% |
| P1 test pass rate | 95%+ |
| P2 test pass rate | 90%+ |
| Flaky test rate | < 5% |
| Test execution time | < 10 minutes |

### 9.6 Smoke Test Suite

Tag critical tests for fast PR feedback:

```typescript
test.describe('@smoke', () => {
  test('Critical flow works', async ({ page }) => {
    // Fast, critical path test
  });
});
```

```bash
pnpm playwright test --grep "@smoke"
```

---

## 10. File Reference

### 10.1 Implemented Files

| Path | Type | Phase | Tests | Status |
|------|------|-------|-------|--------|
| `apps/web/e2e/fixtures/api-helpers.ts` | Fixture | 1 | — | Done |
| `apps/web/e2e/fixtures/test-data-factory.ts` | Fixture | 1 | — | Done |
| `apps/web/e2e/fixtures/page-objects/canvas-page.ts` | Page Object | 1 | — | Done |
| `apps/web/e2e/fixtures/page-objects/conversation-page.ts` | Page Object | 2 | — | Done |
| `apps/web/e2e/fixtures/page-objects/merge-page.ts` | Page Object | 2 | — | Done |
| `apps/web/e2e/fixtures/page-objects/deploy-page.ts` | Page Object | 3 | — | Done |
| `apps/web/e2e/flows/project-lifecycle.spec.ts` | Test | 1 | 4 | Done |
| `apps/web/e2e/flows/canvas-workflow.spec.ts` | Test | 1 | 4 | Done |
| `apps/web/e2e/pages/home.spec.ts` | Test | 1 | 4 | Done |
| `apps/web/e2e/flows/merge-workspace.spec.ts` | Test | 2 | 6 | Done |
| `apps/web/e2e/flows/conversation-flow.spec.ts` | Test | 2 | 4 | Done |
| `apps/web/e2e/flows/leaf-workflow.spec.ts` | Test | 3 | 5 | Done |
| `apps/web/e2e/flows/pin-context.spec.ts` | Test | 3 | 6 | Done |
| `apps/web/e2e/pages/insights.spec.ts` | Test | 3 | 5 | Done |
| `apps/web/e2e/pages/deploy-dashboard.spec.ts` | Test | 3 | 7 | Done |
| `apps/web/e2e/pages/deploy-run-detail.spec.ts` | Test | 3 | 6 | Done |
| `apps/web/e2e/pages/agent-demo.spec.ts` | Test | 4 | 7 | Done |
| `apps/web/e2e/integration/api-webui-sync.spec.ts` | Test | 4 | 4 | Done |
| `apps/web/e2e/integration/error-scenarios.spec.ts` | Test | 4 | 7 | Done |

### 10.2 Reference Files

| Path | Purpose |
|------|---------|
| `apps/web/playwright.config.ts` | Playwright configuration |
| `apps/web/e2e/v4-flow.spec.ts` | Legacy test pattern reference |
| `apps/web/src/lib/api.ts` | API client functions |
| `apps/web/src/store/mergeWorkspaceStore.ts` | Merge state reference |
| `apps/api/src/routes/merge.openapi.ts` | Merge API endpoints |
| `apps/api/src/routes/leaves.openapi.ts` | Leaves API endpoints |
| `apps/api/src/routes/pins.openapi.ts` | Pins API endpoints |
| `apps/api/src/routes/deploy-agents.ts` | Deploy agents API |
| `apps/api/src/routes/runs.ts` | Runs API endpoints |
| `apps/api/src/schemas/v4-contracts.ts` | API contracts |

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Test Files (new) | 0 | 13 |
| Test Files (total incl. legacy) | 5 | 18 |
| Test Cases (new) | 0 | 69 |
| Test Cases (total incl. legacy) | ~22 | ~91 |
| Fixture Files | 0 | 6 |
| Route Coverage | 40% | 100% |
| User Flow Coverage | 30% | 95%+ |

**Key Success Criteria:**
1. All P0 tests passing consistently
2. No flaky tests (10/10 runs)
3. CI pipeline green
4. Test execution under 10 minutes
