# Demo Sprint — Issue Tracker

> **⚠️ 本文档为 v1 版本，issue 规格说明仍然有效，但进度跟踪请参考 [`demo-sprint-v2.md`](./demo-sprint-v2.md)。**
> v1 Person A = A-1~A-13（v2 扩展为 A-1~A-17，全部已完成），v1 Person B = B-1~B-6（v2 扩展为 B-1~B-21，20/21 已完成，仅 B-5 跳过）。

> Each issue is self-contained: has context, exact files, acceptance criteria, and verification steps.
> Assignee: **A** = Person A (Content + Stability), **B** = Person B (Visual + UX)

---

## Person A Issues

### A-1: Seed Data Script ★★★

**Assignee**: A | **Priority**: P0 | **Day**: 1

**Context**: Without demo data, every page is empty. This is the single most important task.

**Reference**: `scripts/e2e-test-v4.sh` for API call patterns.

**What to create**: `scripts/seed-demo.sh` (bash, calls API via curl)

**Data specification**:

#### Project 1: "Customer Support Knowledge" (main demo project)

**Conversation A** — "Return Policy Discussion" (4 turns):
```
user:      "What is your return policy for electronics purchased online?"
assistant: "Our standard return policy allows returns within 30 days of purchase.
            Electronics must be in original packaging with all accessories.
            A receipt or order confirmation is required for processing."
user:      "What if the item is defective? Is the policy different?"
assistant: "For defective items, we extend the return window to 90 days.
            We also cover return shipping costs for confirmed defects.
            You can choose between a full refund or replacement."
```

**Conversation B** — "Warranty Terms Discussion" (3 turns):
```
user:      "Can you explain the warranty coverage for premium electronics?"
assistant: "Premium electronics come with a 2-year manufacturer warranty.
            This covers hardware defects and manufacturing issues.
            Software issues are covered for the first 6 months only."
user:      "What about the return window for warranty claims?"
assistant: "Warranty claims have a 60-day return window, different from standard returns.
            For warranty items, we always provide a replacement rather than a refund.
            Return shipping is covered under warranty."
```

**CommitV4 on main** — 3 sentences from Conversation A:
```
s1: "Standard return policy allows returns within 30 days of purchase"
s2: "Defective items have an extended 90-day return window"
s3: "Return shipping costs are covered for confirmed defects"
```
Each with `source_ref` pointing to actual turn hashes + char offsets.

**CommitV4 on feature/warranty** — 3 sentences from Conversation B:
```
s1: "Premium electronics come with a 2-year manufacturer warranty"
s2: "Warranty claims have a 60-day return window"        ← conflicts with main s1 (different day count)
s3: "Warranty items receive replacement rather than refund" ← conflicts with main (refund vs replacement)
```
Each with `source_ref` pointing to actual turn hashes.

**Leaf** on main commit (type: `email`):
- title: "Customer Return Policy Summary"
- constraints:
  - require: "30 days" (match: exact, source_sentence_id: s1)
  - require: "defective" (match: exact, source_sentence_id: s2)
  - exclude: "competitor" (match: exact, reason: "Must not reference competitors")
- If `ANTHROPIC_API_KEY` is set → call generate + validate
- If not set → write mock output directly via PATCH:
  ```
  "Our return policy allows standard returns within 30 days of purchase.
  All items must be in original packaging. For defective items, we offer
  an extended 90-day window with covered return shipping. You may choose
  a full refund or replacement for any confirmed defect."
  ```

**Pin**: Pin Conversation A to the project.

**Merge draft**: Call `POST /v1/merge/drafts` with main + branch commits to pre-create merge workspace.

#### Project 2: "Product FAQ Draft"

- 1 conversation: "FAQ Review" (2 turns, user asks about shipping, assistant answers)
- 1 commit on main: 2 sentences about shipping times
- No leaf needed

#### Project 3: "Marketing Tone Guide"

- 1 conversation: "Brand Voice Discussion" (2 turns, about tone of voice)
- 1 commit on main: 2 sentences about brand guidelines
- No leaf needed

**API call order**:
```bash
# For each project:
1. POST /v1/projects                    → PROJECT_ID
2. POST /v1/conversations               → CONVERSATION_ID
3. POST /v1/turns (× N per conversation) → TURN_HASH[]
4. POST /v1/commits-v4                  → COMMIT_HASH
5. POST /v1/leaves (project 1 only)     → LEAF_ID
6. POST /v1/leaves/{id}/generate (if key) OR PATCH /v1/leaves/{id}
7. POST /v1/projects/{id}/pins          → PIN_ID
8. POST /v1/merge/drafts (project 1)    → DRAFT_ID
```

**Script requirements**:
- `#!/bin/bash` with `set -euo pipefail`
- `API_BASE` variable (default `http://localhost:8000`)
- Health check at start (`GET /health`)
- Print each step with emoji/status
- Parse JSON responses with `jq` to extract IDs
- Exit with clear error if any step fails
- Idempotent: can re-run after deleting DB

**Acceptance criteria**:
- [ ] Script runs without errors on fresh database
- [ ] `GET /v1/projects` returns 3 projects
- [ ] Main project has 2 conversations with turns
- [ ] Main project has 2 commits on different branches
- [ ] Main project has 1 leaf with constraints
- [ ] Main project has 1 pin
- [ ] Main project has 1 merge draft (pending)
- [ ] Browser shows all data correctly

---

### A-2: Silent Error Fixes ★★

**Assignee**: A | **Priority**: P1 | **Day**: 1

**Context**: These are places where the app silently swallows errors, which could cause the demo to show blank/missing data with no explanation.

#### A-2a: canvasStore leaf loading

**File**: `apps/web/src/store/canvasStore.ts` ~line 90

**Current**:
```typescript
listLeavesByProject(projectId).catch(() => [])
```

**Change to**:
```typescript
listLeavesByProject(projectId).catch((err) => {
  console.warn('[canvasStore] Failed to load leaves:', err);
  // Don't block canvas loading, but notify
  return [];
})
```

#### A-2b: Leaf page commit loading

**File**: `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` ~line 149

**Current**:
```typescript
getCommitV4(leaf.commit_hash).catch(() => {})
```

**Change to**: Set an error state variable and show a gentle warning banner:
```
"Source commit data unavailable — constraints shown without source context."
```

#### A-2c: Leaf panel premature close

**File**: `apps/web/src/store/canvasLeafSlice.ts` ~line 56

**Current**: Panel closes before API call completes.

**Change to**: Close panel only after API call succeeds. On failure, keep panel open and show error.

**Acceptance criteria**:
- [ ] Canvas loads correctly even if leaf API fails (shows warning, not blank)
- [ ] Leaf page shows warning when commit unavailable (not blank constraints)
- [ ] Leaf panel stays open on creation failure

---

### A-3: Generate Error Friendly Messages ★★

**Assignee**: A | **Priority**: P1 | **Day**: 1

**File**: `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` ~line 396-400

**Current**: Raw error text displayed in a red banner.

**Change to**: Error type detection with friendly messages:

```typescript
function getGenerateErrorMessage(error: string): { title: string; description: string; showRetry: boolean } {
  if (error.includes('GENERATION_NOT_CONFIGURED') || error.includes('API_KEY')) {
    return {
      title: 'LLM API Key Not Configured',
      description: 'Set ANTHROPIC_API_KEY in your environment to enable AI generation.',
      showRetry: false,
    };
  }
  if (error.includes('GENERATION_FAILED') || error.includes('timeout')) {
    return {
      title: 'Generation Failed',
      description: 'The AI service encountered an error. Please try again.',
      showRetry: true,
    };
  }
  return { title: 'Error', description: error, showRetry: true };
}
```

Replace the raw error div with a styled card using the above function. Include a Retry button when `showRetry` is true.

**Acceptance criteria**:
- [ ] Missing API key shows friendly message with setup guidance
- [ ] Generation failure shows retry button
- [ ] Other errors still display original message

---

### A-4: Merge Flow Verification ★★

**Assignee**: A | **Priority**: P1 | **Day**: 1 evening

**Context**: Merge is a key demo moment (4 minutes). We need to confirm the merge API works end-to-end and that seed data creates a valid merge scenario.

**Steps**:
1. After seed script runs, verify `POST /v1/merge/drafts` returns a draft with `similarPairs` (conflicts)
2. Verify `GET /v1/merge/drafts/{id}` returns the full prepared data
3. Test the merge execution flow manually (PATCH decisions → POST commit)
4. Verify the merged commit appears in the project

**If merge API has issues**: Fix them or adjust seed data so the merge scenario works.

**Update seed script** (`A-1`) if needed to ensure:
- The two commits produce at least 1 `similarPair` (semantic conflict)
- At least 1 `onlyInSource` and 1 `onlyInTarget` item

**Acceptance criteria**:
- [ ] Merge draft created from seed data has `similarPairs.length >= 1`
- [ ] Merge workspace opens in browser and shows conflicts
- [ ] Resolving conflicts and executing merge creates a new commit
- [ ] Merged commit visible on canvas

---

### A-5: Insights Page — Remove Fake Data ★★

**Assignee**: A | **Priority**: P2 | **Day**: 1 evening

**File**: `apps/web/src/app/insights/page.tsx` (125 lines, SIMPLE)

**Current**: 100% hardcoded Osaka trip sample data imported from `@/data/sampleLedger`.

**Option 1 (preferred)**: Replace with real API calls
- Import `listProjects`, `listCommitsV4` from `@/lib/api`
- Ledger tab: Show real commits as semantic entries
- Latest Commits tab: Show real commit timeline
- Empty state when no data: "Create commits to see insights here."
- Keep `SemanticCard` component and visual layout

**Option 2 (fallback)**: Replace with honest empty state
- Remove hardcoded import
- Show: "Insights dashboard — data appears after creating commits."
- Keep the tab structure but show empty content

**Acceptance criteria**:
- [ ] No reference to Osaka/travel/sample data
- [ ] Page shows real project data OR honest empty state
- [ ] Page doesn't break when no data exists

---

### A-6: Console Output Cleanup ★

**Assignee**: A | **Priority**: P2 | **Day**: 2 morning

**Files and changes**:

| File | Count | Action |
|------|-------|--------|
| `apps/web/src/lib/api.ts` | 4 console.warn | Wrap in `process.env.NODE_ENV !== 'production'` |
| `apps/web/src/components/ErrorBoundary.tsx` | 2 console.error | Wrap in `process.env.NODE_ENV !== 'production'` |
| `apps/web/src/app/eval/[runId]/page.tsx` | 4 console.log | Delete |
| `apps/web/src/app/deploy/compare/page.tsx` | 3 console.log | Delete |
| `apps/web/src/app/api/dev/sql/route.ts` | 2 console.log | Keep (dev-only route) |
| `apps/web/src/lib/db.ts` | 4 console.log | Keep (server-side startup logs) |

**Acceptance criteria**:
- [ ] `pnpm dev:webui` → open all demo pages → DevTools Console shows no warnings/logs
- [ ] dev/sql route still logs (intentional)
- [ ] db.ts startup logs still work

---

### A-7: Seed Data Refinement ★

**Assignee**: A | **Priority**: P2 | **Day**: 2 morning

**Context**: After all other tasks are done, run through the demo flow and tune seed data.

**Checklist**:
- [ ] Project descriptions are meaningful (not "Project created via API")
- [ ] Conversation titles are descriptive
- [ ] Commit messages are professional
- [ ] Sentences read naturally (not robotic)
- [ ] Merge conflicts are obvious and interesting
- [ ] Leaf constraints make business sense
- [ ] Mock output (if no API key) reads like real generated content

---

## Person B Issues

### B-1: Execution Mode Professional Preview ★★

**Assignee**: B | **Priority**: P1 | **Day**: 1

**File**: `apps/web/src/app/project/[projectId]/page.tsx` ~line 131-133

**Current**: Single line of muted text: "Execution log will surface here once the project runs."

**Replace with**: Professional "Coming Soon" preview using existing UI components (Card, Badge, lucide icons):

```
┌─────────────────────────────────────────────────────┐
│  [Activity icon]  Execution Timeline                │
│  Real-time agent execution monitoring               │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ 10:32:15  ● Agent started      [completed]  │    │
│  │ 10:32:18  ● LLM call (GPT-4)   [completed]  │    │
│  │ 10:32:22  ● Tool: search_docs   [completed]  │    │
│  │ 10:32:25  ● Response generated  [running]    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  [v2.0 badge]  Live trace · Token usage ·           │
│                Latency metrics · Step replay        │
└─────────────────────────────────────────────────────┘
```

Use `text-muted-foreground`, `opacity-60` on mock entries to signal "preview, not real data". Keep consistent with existing design system (Card, Badge from shadcn/ui, lucide icons).

**Acceptance criteria**:
- [ ] Switching to Execution mode shows professional preview, not blank
- [ ] Uses existing component library (no new dependencies)
- [ ] Visually consistent with Editor mode quality

---

### B-2: Deploy Page Title + Runner Offline ★★

**Assignee**: B | **Priority**: P1 | **Day**: 1

#### B-2a: Fix page title

**File**: `apps/web/src/app/deploy/layout.tsx` ~line 37

**Current**: `<h1>Agent Optimiser</h1>`

**Change to**: `<h1>Deploy & Monitor</h1>`

#### B-2b: Runner offline graceful display

**File**: `apps/web/src/app/deploy/page.tsx` ~line 275-288

**Current**: Red alert card with `bg-red-500/5` (faint red) + technical commands (`pnpm docker:up:runner`).

**Replace with**: Gentle info card:
```
┌─────────────────────────────────────────────────────┐
│  [Cloud-off icon]  Runner Offline                   │
│                                                     │
│  Connect a runner service to enable:                │
│  • Agent deployment and execution                   │
│  • Real-time trace collection                       │
│  • Automated evaluation                             │
│                                                     │
│  [Learn more →]                                     │
└─────────────────────────────────────────────────────┘
```

Use `border-muted bg-muted/30` instead of red. Keep functional — don't break existing runner detection logic.

**Acceptance criteria**:
- [ ] Page title reads "Deploy & Monitor"
- [ ] Runner offline shows informational card, not error/warning
- [ ] When runner IS online, no change in behavior

---

### B-3: Canvas Empty State Upgrade ★★

**Assignee**: B | **Priority**: P1 | **Day**: 1

**File**: `apps/web/src/components/canvas/CanvasWorkspace.tsx` ~line 757-771

**Current**: Muted box with "No units yet — Click the + button above or drag from the palette"

**Replace with**: Three-step guided onboarding card:

```
┌─────────────────────────────────────────────────────┐
│              Get started with T3X                    │
│                                                     │
│  ① Add a Conversation                               │
│     Import or create an AI conversation              │
│                                                     │
│  ② Extract Knowledge                                │
│     Create commits to capture key information        │
│                                                     │
│  ③ Create Outputs                                   │
│     Generate verified content with constraints       │
│                                                     │
│            [+ Add Unit]                              │
└─────────────────────────────────────────────────────┘
```

Use lucide icons for each step (MessageSquare, GitCommit, FileOutput). Use existing Card component. Keep the + button action pointing to existing `addUnit` handler.

**Acceptance criteria**:
- [ ] Empty canvas shows 3-step guide
- [ ] "+ Add Unit" button works (same as toolbar +)
- [ ] Looks professional and inviting

---

### B-4: Canvas Node Next Step Buttons ★★

**Assignee**: B | **Priority**: P1 | **Day**: 1

**File**: `apps/web/src/components/canvas/CanvasNodes.tsx` (879 lines)

**Context**: From the progressive disclosure redesign — the "Next Step" button is the highest-impact additive UX change. Add it to existing node cards WITHOUT removing any current content.

**Add to bottom of each node card**: A contextual CTA button based on node state:

| Node State | Button Label | Action |
|------------|-------------|--------|
| Staging, no conversation content | "Start Conversation →" | Double-click (opens ConversationView) |
| Staging, has turns | "Create Commit →" | Double-click (opens PendingCommitView) |
| Committed, no leaves | "Create Output →" | Open LeafPanel for this commit |
| Committed, has leaf (no output) | "Preview Output →" | Navigate to leaf detail page |
| Committed, has leaf (with output) | "View Results →" | Navigate to leaf detail page |

**Implementation**:
- Add a `getNextStep(node)` helper function that returns `{ label, action, icon }`
- Render as a button at the bottom of the node card, above the leaves section
- Style: `bg-primary/10 text-primary text-xs font-medium` with `→` arrow
- On click: call the appropriate action (don't propagate to canvas click handler)

**State derivation** needs data from:
- `node.data.status` (staging vs committed)
- `node.data.leaves` (array of leaves)
- Leaf output existence (check `leaf.output !== null`)

**Acceptance criteria**:
- [ ] Every node shows a contextual "next step" button
- [ ] Button actions work (opens correct view/panel)
- [ ] Button doesn't interfere with drag/select/double-click
- [ ] Existing node content unchanged (additive only)

---

### B-5: CommittedCommitView Single-Column Redesign ★★★

**Assignee**: B | **Priority**: P1 | **Day**: 1 evening → Day 2 morning
**Branch**: Work on a separate git branch (e.g., `feat/committed-view-redesign`)

**File**: `apps/web/src/components/canvas/NodeModal/CommittedCommitView.tsx` (769 lines)

**Reference**: `docs/ux-progressive-disclosure-redesign.md` Section 4

**Current layout**: 3-column modal (left sidebar: metadata/lineage/pins | center: 3 tabs source context/excerpt/JSON | right: constraints/history/diff)

**New layout**: Single-column with three layers:

```
┌──────────────────────────────────────────────────┐
│  Header: "Commit: {title}"                       │
│  [main] · sha256:abc1234 · 2 min ago             │
├──────────────────────────────────────────────────┤
│                                                  │
│  Layer 1 (always visible)                        │
│  ─────────────────────────────────               │
│  Sentences (N)                                   │
│  • sentence 1 text                               │
│  • sentence 2 text                               │
│  • ...                                           │
│                                                  │
│  Constraints                                     │
│  [✓ keyword1] [✓ keyword2] [✗ excluded]          │
│                                                  │
│  ┌─ Next Step ────────────────────────────────┐  │
│  │  ✦ Create Output from this Commit    →     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Layer 2 (collapsed by default)                  │
│  ─────────────────────────────────               │
│  ▸ Source Context               (expandable)     │
│  ▸ Pinned Memory (N pins)      (expandable)     │
│  ▸ Version History              (expandable)     │
│  ▸ Linked Leaves (N)           (expandable)     │
│                                                  │
│  Layer 3 (advanced)                              │
│  ─────────────────────────────────               │
│  [Compare Versions]  [Raw JSON]  [Merge]         │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Key implementation details**:
- **Modal size**: Keep current `w-[95vw] max-w-[1400px] h-[85vh]` but use single scrollable column
- **Layer 1**: Extract sentence list + constraint badges from existing code. Add Next Step button using same logic as B-4.
- **Layer 2**: Wrap existing source context, pins, history, leaves sections in collapsible `<details>` or accordion components. Content stays the same — just collapsed by default.
- **Layer 3**: Small text links that open existing DiffFullScreen / JSON view. Removes the 4-step diff flow (select → run → preview → fullscreen) — now it's: click "Compare Versions" → directly open DiffFullScreen.
- **Reuse existing sub-components**: Don't rewrite source context rendering, pin management, etc. Just reorganize their layout.

**Next Step state machine** (same as B-4):

| State | Label | Action |
|-------|-------|--------|
| No Leaf attached | "Create Output →" | Opens LeafPanel |
| Leaf exists, no output | "Preview Output →" | Navigate to leaf detail |
| Leaf has output | "View Results →" | Navigate to leaf detail |
| On branch (latest) | "Merge to Main →" | Start merge flow |

**Safety net**: If this is unstable by Day 2 afternoon, revert to old 3-column version. The branch allows clean rollback.

**Acceptance criteria**:
- [ ] Double-click committed node opens single-column modal
- [ ] Sentences and constraints visible immediately (no tabs to click)
- [ ] Next Step button shows correct action based on state
- [ ] Layer 2 sections expand/collapse correctly
- [ ] Compare Versions opens DiffFullScreen directly (no intermediate step)
- [ ] Raw JSON still accessible
- [ ] Source context tracing still works when expanded
- [ ] No regressions in merge trigger

---

### B-6: Empty State Guidance — Site-Wide ★

**Assignee**: B | **Priority**: P2 | **Day**: 2 morning

**Context**: From design principles doc — "Empty states answer: Why empty? What does it mean? What next?"

Scan all pages and replace generic empty text with contextual guidance:

| Location | Current | New |
|----------|---------|-----|
| Canvas (done in B-3) | "No units yet..." | 3-step guide |
| NodeModal - no conversation | Blank | "Start a conversation to capture knowledge." |
| NodeModal - no source | "No source content" | "Connect an upstream conversation to provide source material." |
| CommittedCommitView - no leaf | (nothing) | Next Step: "Create Output →" (done in B-5) |
| CommittedCommitView - 1 commit only | Empty history | "First commit on this branch. Future commits appear here." |
| Leaf page - no output | "No output generated yet" | "Click 'Generate & Verify' to create AI-generated output from your knowledge." |
| Leaf page - no constraints | "No constraints defined" | "Add constraints to control what must (or must not) appear in generated output." |
| Leaf page - no assertions | "No validation results yet" | "Generate output to see validation results." |
| Deploy - no agents | "No deploy agents registered" | Already good (has EmptyState component) |

**Approach**: Don't create new components — edit text strings in-place. Use existing text/muted-foreground styling.

**Acceptance criteria**:
- [ ] No generic "No X yet" messages remain on demo path
- [ ] All empty states explain what the feature is and what to do next
- [ ] No new components or dependencies introduced

---

## Shared Issues

### S-1: Code Freeze Format Fix ★

**Assignee**: Both | **Priority**: P2 | **Day**: 2 afternoon

**Command**: `pnpm check:fix`

Run once after all code changes are complete. Fixes 265 lint errors + 125 warnings automatically.

**Then verify**: `pnpm check` outputs 0 errors.

---

### S-2: Full Build + Test Verification ★★

**Assignee**: Both | **Priority**: P0 | **Day**: 2 afternoon

```bash
pnpm build          # All packages build
pnpm test           # 1,156 tests pass
pnpm check          # 0 lint errors (after S-1)
```

**If any test fails**: Fix immediately. Do not proceed to rehearsal with failing tests.

---

### S-3: Rehearsal #1 ★★★

**Assignee**: Both | **Priority**: P0 | **Day**: 2 afternoon

**Steps**:
1. Delete `.t3x/database/`
2. Start API: `pnpm dev:api`
3. Start WebUI: `pnpm dev:webui`
4. Run seed: `./scripts/seed-demo.sh`
5. Walk through entire demo script (see plan doc)
6. **Record every issue** in a shared list
7. Note timing for each stage

**Special attention**:
- Does canvas render nodes correctly after seed?
- Does double-click open the right view (CommittedCommitView vs PendingCommitView)?
- Does merge workspace show conflicts from seed data?
- Does leaf Generate work (or show friendly error if no key)?
- Does Execution mode show preview?
- Does Deploy page show gentle offline message?
- Any console warnings visible?

---

### S-4: Rehearsal Fix Round ★★

**Assignee**: Both | **Priority**: P0 | **Day**: 2 afternoon

Fix all issues found in S-3. Split fixes between A and B based on which area.

---

### S-5: Rehearsal #2 ★★★

**Assignee**: Both | **Priority**: P0 | **Day**: 2 afternoon

Repeat S-3. Record any remaining issues.

---

### S-6: Rehearsal #3 (Final) + Backup ★★★

**Assignee**: Both | **Priority**: P0 | **Day**: 2 evening

1. Full demo walkthrough — should be clean
2. Backup database: `cp -r .t3x/database/ .t3x/database-backup/`
3. Prepare fallback leaf (pre-generated output) if no API key
4. Confirm DevTools Console is clean
5. Test restore: delete DB → copy backup → confirm data intact

---

## Issue Dependency Graph

```
A-1 (Seed Data) ──────────────────────┐
A-2 (Silent Errors)                   │
A-3 (Generate Errors)                 │
A-4 (Merge Verification) ← A-1       │
A-5 (Insights Real Data) ← A-1       │
A-6 (Console Cleanup)                 │
A-7 (Seed Refinement) ← A-4, A-5     │
                                      ├──→ S-1 (Format Fix)
B-1 (Execution Mode)                  │      ↓
B-2 (Deploy Title/Offline)            │    S-2 (Build + Test)
B-3 (Canvas Empty State)              │      ↓
B-4 (Next Step Buttons)               │    S-3 (Rehearsal #1)
B-5 (CommittedCommitView) ← B-4      │      ↓
B-6 (Empty State Sitewide)            │    S-4 (Fix Round)
                                      │      ↓
                                      │    S-5 (Rehearsal #2)
                                      │      ↓
                                      └──→ S-6 (Rehearsal #3 + Backup)
```

## Quick Reference: Files Touched

| Issue | Files |
|-------|-------|
| A-1 | `scripts/seed-demo.sh` (new) |
| A-2a | `apps/web/src/store/canvasStore.ts` |
| A-2b | `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` |
| A-2c | `apps/web/src/store/canvasLeafSlice.ts` |
| A-3 | `apps/web/src/app/project/[projectId]/leaf/[leafId]/page.tsx` |
| A-4 | `scripts/seed-demo.sh` (update) |
| A-5 | `apps/web/src/app/insights/page.tsx` |
| A-6 | `api.ts`, `ErrorBoundary.tsx`, `eval/[runId]/page.tsx`, `deploy/compare/page.tsx` |
| A-7 | `scripts/seed-demo.sh` (update) |
| B-1 | `apps/web/src/app/project/[projectId]/page.tsx` |
| B-2a | `apps/web/src/app/deploy/layout.tsx` |
| B-2b | `apps/web/src/app/deploy/page.tsx` |
| B-3 | `apps/web/src/components/canvas/CanvasWorkspace.tsx` |
| B-4 | `apps/web/src/components/canvas/CanvasNodes.tsx` |
| B-5 | `apps/web/src/components/canvas/NodeModal/CommittedCommitView.tsx` |
| B-6 | Multiple (text changes only) |

**No file conflicts between A and B** — each person works on separate files.
