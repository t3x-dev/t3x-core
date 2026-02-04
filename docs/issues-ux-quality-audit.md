# UX & Code Quality Audit — Issue Tracker

> Generated from full codebase audit on 2026-02-02.
> Each section below is a standalone issue, ready to file via `gh issue create`.

---

## Issue 1: Refactor NodeModal.tsx (4,220 lines) into composable sub-components

### Scope / Module

webui — `apps/web/src/components/canvas/NodeModal.tsx`

### What

NodeModal.tsx is 4,220 lines and handles commit, diff, merge, conversation view, and sidebar all in one file. This causes:

1. **Performance**: Every prop/state change re-renders the entire 4K-line component tree. No memoization of child sections.
2. **Maintainability**: Bug fixes in one section easily introduce regressions elsewhere. Code review is impractical at this size.
3. **Debug noise**: 60+ `console.log` statements scattered throughout (lines 1817–2618).
4. **Missing error states**: When data loading fails inside the modal, there is no error UI — the component silently shows stale or empty content.

### Why now

This is the most-used component in the app. Every interaction with a node opens this modal. The current size makes iteration speed on any canvas feature significantly slower.

### Suggested approach

Split into sub-components by tab/section:

```
NodeModal/
├── NodeModal.tsx              # Shell: tabs, layout, shared state
├── CommitTab.tsx              # Commit view (sentences, constraints, metadata)
├── ConversationTab.tsx        # Conversation turns view
├── DiffTab.tsx                # Two-way / three-way diff display
├── MergeTab.tsx               # Merge UI (decisions, preview)
├── CommitSidebar.tsx          # Right sidebar (history, branches)
└── hooks/
    ├── useCommitData.ts       # Data fetching for commit tab
    └── useModalNavigation.ts  # Tab switching, URL sync
```

Rules:
- Extract one tab at a time. Each extraction is a separate PR.
- Remove all `console.log` statements during extraction.
- Add `React.memo` to each extracted component.
- Add error boundary + fallback UI per tab.

### Success criteria / Definition of Done

- [ ] NodeModal.tsx is under 500 lines (shell + coordination only)
- [ ] Each tab component is independently testable
- [ ] Zero `console.log` remaining in production code
- [ ] Error boundary shows user-friendly message on data fetch failure
- [ ] No visual regression (manual check on canvas page)

### Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

---

## Issue 2: Split canvasStore.ts (2,604 lines) into domain slices

### Scope / Module

webui — `apps/web/src/store/canvasStore.ts`

### What

canvasStore.ts is a 2,604-line Zustand store containing hundreds of methods covering unrelated domains: node CRUD, layout, commit workflow, draft management, branch operations, and notification. This causes:

1. **Stale closure risk**: Callbacks use `useCanvasStore.getState()` throughout; complex interactions between methods can read outdated state.
2. **Debug noise**: 10+ `console.log('[canvasStore]...')` statements in `commitPendingCommit` alone (lines 1087–1169).
3. **Unclear returns**: `getPendingCommitEffectiveConstraints()` returns `undefined` in 3 separate code paths with no distinction.
4. **Fragmented notifications**: 3 separate stores (`projectStore`, `canvasStore`, `pinsStore`) each have their own `notifyCallback`, with no unified error handling.

### Why now

Every new canvas feature requires reading through 2,600 lines of store to understand state flow. The fragmented notification pattern means errors in one store are invisible to others.

### Suggested approach

Split by domain using Zustand slices pattern:

```
store/
├── canvasStore.ts          # Re-export + combine slices
├── slices/
│   ├── nodesSlice.ts       # Node CRUD, positions, selection
│   ├── layoutSlice.ts      # Auto-layout, grid, viewport
│   ├── commitSlice.ts      # Commit workflow, drafts, constraints
│   ├── branchSlice.ts      # Branch operations, checkout
│   └── notificationSlice.ts # Unified toast/error handling
```

Rules:
- One slice at a time. Start with the most independent domain (layout).
- Unify all 3 notification callbacks into `notificationSlice`.
- Remove all debug `console.log` during extraction.
- Each slice must have unit tests for key state transitions.

### Success criteria / Definition of Done

- [ ] No single file exceeds 600 lines
- [ ] Unified notification system replaces 3 separate callbacks
- [ ] Zero debug `console.log` remaining
- [ ] Unit tests for `commitSlice` state transitions (the most complex flow)
- [ ] Existing E2E tests still pass

### Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

---

## Issue 3: Add retry logic and error feedback to API client

### Scope / Module

webui — `apps/web/src/lib/api.ts`

### What

The API client (2,775 lines, single file) has several resilience issues:

1. **No retry**: All requests fail immediately on first error. Network hiccups cause instant failure.
2. **Silent error swallowing**: JSON parse errors are caught and silently discarded (lines 1395, 1408, 2556):
   ```typescript
   .catch(() => ({}))  // swallows parse error, returns empty object
   ```
3. **Fixed 10s timeout**: `DEFAULT_TIMEOUT = 10000` for all requests. Large diff/commit operations may need longer; health checks need less.
4. **No request deduplication**: Rapid UI interactions can fire duplicate API calls.
5. **No offline detection**: App breaks entirely when API is unreachable, with no user-facing indication.

### Why now

Users on unstable networks (mobile, VPN, etc.) experience silent failures. The empty-object fallback from swallowed JSON errors leads to confusing downstream bugs that are nearly impossible to debug.

### Suggested approach

1. **Add retry with exponential backoff** for GET requests (idempotent):
   ```typescript
   // Max 3 attempts, 500ms → 1s → 2s delay
   async function fetchWithRetry(url, opts, maxRetries = 3) { ... }
   ```
2. **Replace silent catches** with proper error propagation:
   ```typescript
   // Before
   .catch(() => ({}))
   // After
   .catch((err) => { throw new ApiParseError(url, err); })
   ```
3. **Per-request timeout config**:
   ```typescript
   fetchApi('/health', { timeout: 3000 });           // fast
   fetchApi('/commits/diff', { timeout: 30000 });    // slow
   ```
4. **Add connection status hook**:
   ```typescript
   const { isOnline, isApiReachable } = useConnectionStatus();
   ```
5. **Split api.ts** into modules by domain (`api/commits.ts`, `api/leaves.ts`, etc.).

### Success criteria / Definition of Done

- [ ] GET requests retry up to 3 times with backoff
- [ ] Zero `.catch(() => ...)` patterns that swallow errors silently
- [ ] Timeout is configurable per request
- [ ] Connection banner shows when API is unreachable
- [ ] api.ts split into files, no single file exceeds 500 lines

### Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

---

## Issue 4: Fix flaky E2E tests — replace waitForTimeout with proper element waiters

### Scope / Module

webui — `apps/web/e2e/diff-display-*.spec.ts`

### What

E2E tests are unreliable in CI due to:

1. **Hard-coded delays**: 20+ instances of `waitForTimeout(3000)` and `waitForTimeout(5000)` instead of waiting for actual DOM conditions.
2. **Silent error swallowing**: Multiple `.catch(() => false)` patterns hide test failures:
   - `diff-display-full.spec.ts` lines 299, 338
   - `v4-flow.spec.ts` lines 64, 76, 105, 305
3. **Forced serial execution**: `test.describe.configure({ mode: 'serial' })` because tests share state, making the suite slow and order-dependent.
4. **60-second timeout**: `test.setTimeout(60000)` suggests tests are known to be slow/flaky.
5. **Redundant waits**: Pattern like `waitForLoadState('networkidle')` followed immediately by `waitForTimeout(3000)`.

### Why now

Flaky E2E tests slow down every PR. Developers lose trust in the test suite and start ignoring failures, which means real bugs get merged.

### Suggested approach

**File-by-file replacement**:

```typescript
// Before
await page.waitForTimeout(3000);
const el = page.locator('.diff-container');

// After
const el = page.locator('.diff-container');
await el.waitFor({ state: 'visible', timeout: 10000 });
```

**Remove silent catches**:
```typescript
// Before
const exists = await page.locator('.foo').isVisible().catch(() => false);

// After
await expect(page.locator('.foo')).toBeVisible({ timeout: 5000 });
```

**Break serial dependency** by giving each test its own test data setup (use API to create fixtures before each test).

### Success criteria / Definition of Done

- [ ] Zero `waitForTimeout()` calls remaining in E2E tests
- [ ] Zero `.catch(() => false)` patterns
- [ ] Tests can run in parallel (`mode: 'parallel'`)
- [ ] Suite completes in under 30 seconds
- [ ] No test skips due to timing

### Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

---

## Issue 5: Add loading states and error feedback to critical user flows

### Scope / Module

webui — multiple components and stores

### What

Several key user flows lack loading indicators or error feedback:

| Flow | Location | Issue |
|------|----------|-------|
| Pin loading | `pinsStore.ts:fetchPins()` | No loading indicator; UI shows stale data while fetching |
| Canvas auto-layout | `CanvasWorkspace.tsx` | `isLayouting` state exists but no progress UI |
| Project not found | `project/[projectId]/page.tsx:38-40` | Silent redirect, no error toast |
| Deploy page data | `deploy/page.tsx:82-106` | 3 separate `catch` blocks log `console.warn` only, user sees nothing |
| Constraint deletion | `canvasStore.ts` | No confirmation dialog, no undo |
| Commit workflow | `NodeModal.tsx` | No skeleton loader while fetching leaves/history |

### Why now

Users report confusion when actions appear to "do nothing." Silent failures erode trust in the app — users don't know if an operation succeeded, failed, or is still loading.

### Suggested approach

1. **Standardize loading pattern** using a shared `LoadingOverlay` or skeleton component:
   ```tsx
   {isLoading ? <Skeleton /> : <Content />}
   ```
2. **Add error toasts** for all failed API calls — use the unified notification system (from Issue 2):
   ```typescript
   catch (err) {
     notify({ type: 'error', message: 'Failed to load pins. Retrying...' });
   }
   ```
3. **Add confirmation dialog** before destructive actions (delete constraint, discard draft):
   ```tsx
   <ConfirmDialog
     title="Delete constraint?"
     description="This action cannot be undone."
     onConfirm={handleDelete}
   />
   ```
4. **Project not found**: Show error page instead of silent redirect.

### Success criteria / Definition of Done

- [ ] Every API-dependent view shows loading skeleton during fetch
- [ ] Every failed API call surfaces a user-visible error toast
- [ ] Destructive actions require confirmation
- [ ] Project 404 shows dedicated error page with "Go back" link
- [ ] No `console.warn`-only error handling remaining

### Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

---

## Issue 6: Eliminate `as any` type casts in production code

### Scope / Module

core, api, webui — 23 files

### What

Unsafe type casts bypass TypeScript's compile-time safety. The most concerning instances:

| File | Line | Cast | Risk |
|------|------|------|------|
| `apps/api/src/routes/commits-v4.openapi.ts` | 365 | `const rawBody = body as any` | Request body validation bypassed — could accept malformed data |
| `apps/web/src/components/merge/MergePanel.tsx` | 107 | `sentences={prepared.identical as any}` | Type mismatch between merge result and component props |
| `apps/web/src/components/optimiser/charts/BarChart.tsx` | 69 | `function renderCustomLabel(props: any)` | Recharts callback untyped |
| `packages/core/src/leaf/generate.ts` | — | Multiple `any` | Core package should have strictest types |

### Why now

The V4 architecture is under active parallel development. Type safety gaps in contract boundaries (`commits-v4` route, merge results) will compound as more code builds on top of these interfaces.

### Suggested approach

- **commits-v4.openapi.ts**: Replace `body as any` with Zod-validated type:
  ```typescript
  const parsed = CommitV4CreateSchema.parse(body);
  ```
- **MergePanel.tsx**: Fix the type definition of `prepared.identical` to match what the component expects.
- **BarChart.tsx**: Use Recharts' `LabelProps` type.
- **Core package**: Add `"strict": true` to tsconfig if not already set; fix all resulting errors.

### Success criteria / Definition of Done

- [ ] Zero `as any` in `packages/core/`
- [ ] Zero `as any` in API route handlers (test files excepted)
- [ ] `MergePanel` props properly typed
- [ ] `pnpm check` passes with no type errors

### Potential impact

- [x] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

---

## Issue 7: Remove debug console statements from production code

### Scope / Module

api, webui — ~57 statements across production files

### What

Debug `console.log` / `console.warn` statements remain in production code:

| Location | Count | Example |
|----------|-------|---------|
| `apps/web/src/components/canvas/NodeModal.tsx` | 30+ | `console.log('[handleCommit] Branch decision:', {...})` |
| `apps/web/src/store/canvasStore.ts` | 10+ | `console.log('[canvasStore] commitPendingCommit called with id:', id)` |
| `apps/api/src/routes/runner.ts` | 5 | `console.log()` / `console.error()` in request handlers |
| `apps/api/src/lib/timeout-checker.ts` | 3 | `console.warn()` in timeout polling |
| `apps/api/src/routes/runs.ts` | 10+ | State transition logging |

### Why now

These pollute browser devtools and server logs, making real issues harder to spot. They also leak internal state details that should not be visible in production.

### Suggested approach

1. **Remove all `console.log`** from `apps/web/` components and stores — these are client-side debug leftovers.
2. **For `apps/api/`**, replace `console.*` with the existing logger middleware (`apps/api/src/middleware/logger.ts`) or a structured logger (pino):
   ```typescript
   // Before
   console.log('Run started:', runId);
   // After
   logger.info({ runId }, 'Run started');
   ```
3. **Add a lint rule** to prevent future `console.log` in production:
   ```json
   // biome.json
   { "rules": { "noConsole": "error" } }
   ```

### Success criteria / Definition of Done

- [ ] Zero `console.log` / `console.warn` in `apps/web/src/components/` and `apps/web/src/store/`
- [ ] API routes use structured logger instead of `console.*`
- [ ] Biome rule prevents new `console` statements from being committed
- [ ] Server startup logs are the only remaining `console.log` (acceptable)

### Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [x] Needs CLI/WebUI changes

---

## Issue 8: Add unit tests for untested API middleware and libraries

### Scope / Module

api — `apps/api/src/lib/`, `apps/api/src/middleware/`

### What

Core libraries and middleware have zero test coverage:

| File | Purpose | Risk |
|------|---------|------|
| `lib/auth.ts` | Authentication logic | HIGH — security-critical |
| `lib/embedder.ts` | Embedding vector generation | HIGH — affects diff/merge accuracy |
| `lib/nlp.ts` | NLP provider abstraction | MEDIUM — affects extraction quality |
| `lib/context-formatter.ts` | Context formatting for LLM | MEDIUM — affects LLM prompt quality |
| `lib/errors.ts` | Error code definitions (74 codes) | MEDIUM — untested error mappings |
| `lib/timeout-checker.ts` | Request timeout polling | LOW |
| `middleware/logger.ts` | Request logging | LOW |
| `middleware/cors.ts` | CORS configuration | LOW |

### Why now

`auth.ts` and `embedder.ts` are called by every authenticated request and every diff operation respectively. Regressions here are invisible until production.

### Suggested approach

Start with high-risk files:

1. **auth.ts**: Test token validation, expiry, and rejection paths
2. **embedder.ts**: Test vector generation, provider fallback, error handling
3. **errors.ts**: Snapshot test all 74 error codes to prevent accidental changes
4. **nlp.ts**: Test provider initialization and fallback chain

Use the existing test setup pattern (`setupTestDB` + PGLite) for tests that need database access.

### Success criteria / Definition of Done

- [ ] `auth.ts` has tests for valid token, expired token, missing token, malformed token
- [ ] `embedder.ts` has tests for vector generation and provider error handling
- [ ] `errors.ts` has snapshot test for all error codes
- [ ] All new tests pass in CI

### Potential impact

- [ ] May touch schema/contract
- [ ] May affect deterministic core
- [ ] Needs CLI/WebUI changes

---

## Priority Matrix

| Issue | Priority | Effort | User Impact | 状态 |
|-------|----------|--------|-------------|------|
| #1 NodeModal refactor | **P0** | Large | High — performance, maintainability | ✅ 部分完成（CommittedCommitView/PendingCommitView/ConversationView 已拆分） |
| #3 API retry + error feedback | **P0** | Medium | High — network resilience | ⬜ 未开始 |
| #2 canvasStore split | **P1** | Large | Medium — developer velocity, bug reduction | ✅ 已完成（slice 模式：canvasMergeSlice, canvasLeafSlice） |
| #5 Loading/error states | **P1** | Medium | High — user trust | ✅ 部分完成（B-9 Leaf loading, A-11 Merge loading, A-3 Generate 错误） |
| #4 E2E test flakiness | **P1** | Medium | Medium — CI reliability | ⬜ 未开始 |
| #7 Remove console statements | **P2** | Small | Low — log hygiene | ✅ 已完成（demo-sprint A-6） |
| #6 Eliminate `as any` | **P2** | Small | Medium — refactoring safety | ✅ 已完成（demo-sprint A-14/A-15，生产代码 0 处 as any） |
| #8 API lib test coverage | **P2** | Medium | Medium — regression prevention | ⬜ 未开始 |
