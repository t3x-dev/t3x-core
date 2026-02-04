# UX Redesign — GitHub Issues (Copy-Paste Ready)

> Each issue below is formatted to match `.github/ISSUE_TEMPLATE/feature_request.yml`.
> Copy the content between the `---` markers for each issue.
>
> **实施进度：** Issue 5/6 ✅ | Issue 7 ✅ (B-7) | Issue 8/9 ✅ (B-4/B-8) | Issue 10 ✅ (B-15) | Issue 11 ✅ | Issue 12 ✅ | Issue 1-3 ⏭️ 跳过（保留三栏，B-5 不实施） | Issue 4 ✅ (B-4 内含)。详见 [`ux-redesign-issues.md`](./ux-redesign-issues.md)。

---

## Issue 1

**Title**: `[Feature]: CommittedCommitView — Replace 3-column layout with single-column layered view`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:1`

**Scope**: webui

**What**:

Rewrite `CommittedCommitView` from the current 3-column layout (left sidebar + 3-tab main + right sidebar) into a single-column vertical scroll layout.

The current modal packs 8 distinct feature areas into one screen: metadata/lineage/pins in the left sidebar, source context/source excerpt/JSON as three tabs in the main area, and constraints/history button/diff chain in the right sidebar. A new user opening this modal has no idea where to look.

The new layout uses a single column with explicit layers:
- **Layer 1 (always visible)**: Header (title, branch, hash, timestamp) → Sentence list → Constraint badges → Next Step card
- **Layer 2 (collapsed)**: Collapsible sections (see Issue #2)
- **Layer 3 (advanced)**: Text links at bottom (see Issue #3)

**Why now**:

CommittedCommitView is the most visited modal in the product. Its information overload is the #1 barrier for new users. Every other UX improvement (diff repositioning, next-step navigation, empty states) depends on this layout change as the foundation.

**Suggested approach**:

1. Create the new single-column shell in `CommittedCommitView.tsx` with header + Layer 1 section
2. Move sentence list out of the tab system into the always-visible area
3. Move constraint badges from right sidebar to below sentences
4. Integrate `NextStepCard` component (Issue #4) below constraints
5. Remove left sidebar, right sidebar, and tab navigation entirely
6. Existing features are not deleted — they are relocated to Layer 2/3 (Issues #2, #3)

Files affected:
- `apps/web/src/components/canvas/NodeModal/CommittedCommitView.tsx` (768 lines) — **Rewrite**
- `apps/web/src/components/canvas/NodeModal/shared.tsx` — **Moderate refactor** (shared components adapted for new layout)

**Success criteria / Definition of Done**:

- [ ] Modal opens to a single-column view with sentences, constraints, and Next Step visible
- [ ] No left or right sidebar remains
- [ ] Layout renders correctly across common screen widths (1280px, 1440px, 1920px)
- [ ] No existing functionality is lost (features are relocated, not removed)
- [ ] `pnpm check` passes
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 2

**Title**: `[Feature]: CommittedCommitView — Add Layer 2 collapsible sections`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:1`

**Scope**: webui

**What**:

Add accordion-style collapsible sections below the Layer 1 area in the redesigned `CommittedCommitView`. These sections hold features that are valuable to proficient users but should not compete for attention with the core content.

Four collapsible sections, all **collapsed by default**:

| Section | Content | Migrated from |
|---------|---------|---------------|
| **Source Context** | Sentence-to-conversation mapping (merge the old "Source Context" and "Source Excerpt" tabs into one) | Main area tabs 1 & 2 |
| **Pinned Memory (N pins)** | Pin management UI | Left sidebar |
| **Version History** | Inline commit timeline with `[see changes]` links per entry | Right sidebar button → sheet overlay |
| **Linked Leaves (N)** | List of attached leaves with status | Separate LeafPanel sheet |

Each section header shows a count badge (e.g., "Pinned Memory (3 pins)") so users can see at a glance whether there is content worth expanding.

**Why now**:

These features currently live in sidebars and overlays that clutter the default view. Moving them to collapsed sections preserves full functionality while dramatically reducing cognitive load on first open. This is part of the progressive disclosure strategy — Layer 1 is for everyone, Layer 2 is for users who want to dig deeper.

**Suggested approach**:

1. Create a reusable `CollapsibleSection` component (or use an existing accordion primitive from the UI library)
2. Implement each of the 4 sections as children of the collapsible wrapper
3. For **Source Context**: combine the data from the old Source Context and Source Excerpt tabs; display sentence → turn mapping with character ranges; add a "[View in conversation context]" link
4. For **Pinned Memory**: migrate the pin management UI from the left sidebar as-is
5. For **Version History**: convert `CommitHistoryPanel` from a Sheet overlay to an inline collapsible; each history entry should show hash (abbreviated), message, relative time, and a `[see changes]` link that opens `DiffFullScreen` directly (see Issue #10)
6. For **Linked Leaves**: show leaf list with status badges (pending/running/complete)

Files affected:
- `CommittedCommitView.tsx` — integrated with Issue #1 rewrite
- `CommitHistoryPanel.tsx` — **Moderate** refactor from Sheet to inline collapsible

**Success criteria / Definition of Done**:

- [ ] 4 collapsible sections render below Layer 1 content
- [ ] All sections are collapsed by default
- [ ] Section headers show accurate count badges
- [ ] Expanded content matches functionality of the original locations
- [ ] Version History `[see changes]` link opens DiffFullScreen correctly
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 3

**Title**: `[Feature]: CommittedCommitView — Add Layer 3 "Advanced" section`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:1`

**Scope**: webui

**What**:

Add an "Advanced" section at the bottom of the redesigned `CommittedCommitView`, below the Layer 2 collapsible areas. This section contains expert-level features as low-priority text links.

Three links:

| Link | Action | Visibility |
|------|--------|------------|
| **Compare Versions** | Opens `DiffFullScreen` with a commit selector UI | Always |
| **Raw JSON** | Opens a modal or expandable area showing the full commit JSON | Always |
| **Merge** | Starts the merge flow | Only visible for branch commits (not on `main`) |

This replaces the current 4-step diff chain in the right sidebar: `Select target → Run Diff → Mini preview → Open Full Diff`. The mini diff preview component is removed entirely.

**Why now**:

For a product called "Git for Meaning", version comparison should not require 4 clicks from a corner of the UI. By moving diff to a direct link (1 click → full diff), we make the core value proposition more accessible. At the same time, these are still expert features that most users don't need on every visit, so they belong in a low-visibility "Advanced" area rather than in the primary view.

**Suggested approach**:

1. Add an "Advanced" label/divider below the Layer 2 sections
2. Render 3 text-style links (not buttons — visually low priority)
3. **Compare Versions**: on click, open `DiffFullScreen` component with `mode="select"` so user can pick any two commits
4. **Raw JSON**: on click, open a modal with `<pre>` formatted JSON of the full commit record
5. **Merge**: on click, start existing merge flow; conditionally render only when `commit.branch !== "main"`
6. Remove the old right-sidebar diff section (target selector, "Run Diff" button, mini preview panel)

Files affected:
- `CommittedCommitView.tsx` — integrated with Issue #1 rewrite
- `DiffFullScreen.tsx` — **No changes** (component stays as-is, only entry points change)

**Success criteria / Definition of Done**:

- [ ] "Advanced" section renders at the bottom with correct links
- [ ] "Compare Versions" opens DiffFullScreen directly (no intermediate mini preview)
- [ ] "Raw JSON" displays the complete commit data in formatted JSON
- [ ] "Merge" link only appears for non-main branch commits
- [ ] Old 4-step diff chain is completely removed
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 4

**Title**: `[Feature]: Create reusable NextStepCard component with state machine`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:1`

**Scope**: webui

**What**:

Create a `NextStepCard` component that displays one prominent call-to-action button based on the current state of a commit or canvas node. This component is the core of the "Next Step Navigation" design — every view answers "What should I do next?" with a single, obvious action.

The component accepts a state enum and renders the corresponding label + action:

**In CommittedCommitView:**

| State | Button label | Click action |
|-------|-------------|--------------|
| Committed, no Leaf attached | "Create Output →" | Opens LeafPanel |
| Committed, Leaf exists (not yet run) | "Preview Output →" | Navigate to Leaf detail |
| Committed, Leaf complete | "Export →" | Open export action |
| Committed, on branch (latest) | "Merge to Main →" | Start merge flow |

**In Canvas node cards (integrated in Issue #8/#9):**

| State | Button label | Click action |
|-------|-------------|--------------|
| Staging, empty conversation | "Start Conversation →" | Open ConversationView |
| Staging, has conversation content | "Create Commit →" | Open PendingCommitView |
| Committed, no Leaf | "Create Output →" | Open LeafPanel |
| Committed, Leaf exists (not run) | "Preview Output →" | Navigate to Leaf detail |
| Committed, Leaf complete | "Export →" | Export action |

**Why now**:

After committing, users currently land in CommittedCommitView with no indication of what to do next. The journey from Conversation → Commit → Leaf → Output requires prior knowledge of the system. This component eliminates that gap by always showing the logical next action. It is used in Issues #1, #7, #8, and #9.

**Suggested approach**:

1. Create `apps/web/src/components/ui/NextStepCard.tsx`
2. Define a `NextStepState` type with all possible states
3. Create a `deriveNextStep(context)` helper function (can live in the component file or in a shared hook)
4. Visual design: card container with a prominent colored button (e.g., primary color background), a small icon (✦), and the action label. Should be the most visually prominent element in its parent container.
5. For CommittedCommitView: derive state from commit data + leaf data
6. For Canvas nodes: derive state from node type + conversation data + leaf data (detailed in Issue #9)

Files affected:
- New: `apps/web/src/components/ui/NextStepCard.tsx`
- `CommittedCommitView.tsx` — integrate the component
- `canvasStore.ts` — add state derivation helpers (Phase 4, Issue #9)

**Success criteria / Definition of Done**:

- [ ] Component renders correct label and action for each defined state
- [ ] Click triggers the correct navigation/action for each state
- [ ] Component is reusable across CommittedCommitView and CanvasNodes
- [ ] State priority is well-defined (e.g., if commit is on a branch AND has no leaf, which takes precedence?)
- [ ] Visual design makes the button the most prominent element in its container
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 5

**Title**: `[Feature]: PendingCommitView — Split into paginated wizard (Page 1: Configure)`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:2`

**Scope**: webui

**What**:

Refactor the 1560-line `PendingCommitView` monolith into a 3-page wizard. This issue covers **Page 1: Configure**.

Current problems:
- Step 1 (configure) and Step 2 (curate) coexist in a sidebar + editor layout, competing for attention
- The source editor shares horizontal space with the configuration sidebar, limiting editing area
- 1560 lines in a single component makes the code hard to maintain

Page 1 layout (full-width, no sidebar):
```
┌──────────────────────────────────────┐
│  Step  ① ── ○ ── ○                   │
│  Configure your commit               │
├──────────────────────────────────────┤
│  What do you want to extract?        │
│  ┌──────────────────────────────┐    │
│  │ (intent textarea)            │    │
│  └──────────────────────────────┘    │
│  Branch: [main ▾]                    │
│                                      │
│  ▸ Advanced Settings                 │
│    Template: [prose ▾]               │
│    Cosine threshold: [0.75]          │
│                                      │
│                       [Next →]       │
└──────────────────────────────────────┘
```

**Why now**:

PendingCommitView is the second most critical view (after CommittedCommitView). Its current layout forces new users to understand both configuration and content curation simultaneously. A paginated wizard shows one concern at a time, reducing cognitive load. Splitting the monolith also improves code maintainability.

**Suggested approach**:

1. Add a wizard state (`currentPage: 1 | 2 | 3`) to `PendingCommitView` (or the parent `NodeModal`)
2. Create a progress indicator component: `① Configure → ② Curate → ③ Success`
3. Extract Page 1 configuration logic from `PendingCommitView.tsx` into `PendingConfigPage.tsx`
4. Layer 1 (default visible): intent textarea + branch selector
5. Layer 2 (collapsed "Advanced Settings"): template dropdown + cosine threshold slider
6. `[Next →]` button validates configuration and transitions to Page 2
7. Page state (intent, branch, template, threshold) is managed by the parent and passed to subsequent pages

Files affected:
- `apps/web/src/components/canvas/NodeModal/PendingCommitView.tsx` (1560 lines) — **Split**: extract config logic
- New: `PendingConfigPage.tsx`
- `NodeModal.tsx` — **Small**: add wizard page routing

**Success criteria / Definition of Done**:

- [ ] Page 1 renders full-width with no sidebar
- [ ] Only intent input and branch selector are visible by default
- [ ] Template and cosine threshold are inside a collapsed "Advanced Settings" section
- [ ] Progress indicator correctly shows step 1 as active
- [ ] `[Next →]` transitions to Page 2 and passes configuration state
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 6

**Title**: `[Feature]: PendingCommitView — Split into paginated wizard (Page 2: Curate)`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:2`

**Scope**: webui

**What**:

Implement **Page 2: Curate** of the PendingCommitView wizard. The source content editor gets full viewport width (no sidebar competing for space).

Page 2 layout:
```
┌──────────────────────────────────────────────────────────┐
│  Step  ✓ ── ② ── ○                                       │
│  Select content to commit                                │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐    │
│  │  (FULL-WIDTH source editor)                      │    │
│  │  Text selection + keyword marking                │    │
│  │  Same functionality as current editor            │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Selected: 5 sentences · 3 must-have · 1 mustn't-have   │
│                                                          │
│                          [← Back]    [Commit →]          │
└──────────────────────────────────────────────────────────┘
```

**Why now**:

The source editor is the most interaction-heavy part of the commit workflow. Giving it full width dramatically improves the editing experience, especially for long conversations. This is blocked by / should be implemented together with Issue #5.

**Suggested approach**:

1. Extract the source editor and curate logic from `PendingCommitView.tsx` into `PendingCuratePage.tsx`
2. The editor component itself should be reused as-is — only the layout wrapper changes (full-width instead of sharing space with sidebar)
3. Add a bottom stats bar that updates in real-time: sentence count, must-have count, mustn't-have count
4. `[← Back]` returns to Page 1, preserving all Page 1 configuration state
5. `[Commit →]` triggers the commit operation using config from Page 1 + selections from Page 2
6. On successful commit, transition to Page 3 (Issue #7)

Files affected:
- `PendingCommitView.tsx` — **Split**: extract curate logic
- New: `PendingCuratePage.tsx`

**Success criteria / Definition of Done**:

- [ ] Source editor occupies full width (no sidebar)
- [ ] Text selection and keyword marking work identically to the current implementation
- [ ] Bottom stats bar shows accurate real-time counts
- [ ] `[← Back]` returns to Page 1 with all configuration preserved
- [ ] `[Commit →]` executes commit and transitions to Page 3 on success
- [ ] Progress indicator shows step 2 as active, step 1 as completed
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 7

**Title**: `[Feature]: Commit success page with auto-diff summary`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:3`

**Scope**: webui

**What**:

Implement **Page 3: Success** of the PendingCommitView wizard. After a successful commit, instead of jumping directly to CommittedCommitView, show a dedicated success page with:

1. **Success confirmation**: checkmark + summary (N sentences extracted, N constraints set, branch name)
2. **Auto-generated change summary** (if parent commit exists): automatically call the diff API (new commit vs parent) and display a compact summary:
   ```
   Changes from parent:
   + 2 sentences added
   ~ 1 sentence modified
   - 0 sentences removed
   [View full diff]
   ```
3. **Next Step card**: "Create Output →" (guides user to create a Leaf)
4. **Secondary actions** (low-priority links):
   - "View commit details" → opens CommittedCommitView
   - "Create another commit" → returns to Page 1

**Why now**:

The most common diff question is "What just changed?" — and right now, answering it requires navigating to CommittedCommitView, finding the diff section in the right sidebar, selecting the parent commit, clicking "Run Diff", and then clicking "Open Full Diff". This page answers that question automatically with zero user effort. It also provides the first guided transition point toward Leaf creation.

**Suggested approach**:

1. Create `CommitSuccessPage.tsx` as Page 3 of the wizard
2. On mount, if the newly created commit has a parent hash:
   - Call the existing diff API (or create a lightweight `/diff-summary` endpoint that returns only added/modified/removed counts)
   - Display the summary while loading with a skeleton/spinner
3. If no parent commit (first commit on branch), skip the diff section entirely
4. Integrate `NextStepCard` (Issue #4) with state = "Committed, no Leaf"
5. `[View full diff]` link opens `DiffFullScreen` with base=parent, target=new commit

Files affected:
- New: `CommitSuccessPage.tsx`
- `apps/web/src/lib/api.ts` — **Small**: may need a diff summary helper function

**Success criteria / Definition of Done**:

- [ ] Success page displays after commit instead of jumping to CommittedCommitView
- [ ] Change summary is auto-generated (no user clicks required)
- [ ] First commit (no parent) is handled gracefully — no diff section shown
- [ ] `[View full diff]` opens DiffFullScreen correctly
- [ ] Next Step card shows "Create Output →" and navigates to LeafPanel
- [ ] Secondary action links work correctly
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 8

**Title**: `[Feature]: Canvas node card — Simplify default display`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:4`

**Scope**: webui

**What**:

Reduce the default information density of canvas node cards. Currently, cards show sentence list (up to 3), constraint badges, author badge, hash, V4 marker, and a leaves section with statuses — all visible by default. This is too dense for a canvas overview.

New card layout:

**Layer 1 (default visible):**
- Commit title + branch tag (e.g., `[main]`)
- Summary stats: `5 sentences · 3 constraints`
- Next Step button (most visually prominent element)

**Layer 2 (collapsed):**
- `▸ 3 sentences preview` — expands to show first 3 sentences
- `▸ 2 leaves attached` — expands to show leaf list with statuses

**Moved to modal view (only visible when card is clicked open):**
- Hash value
- Author badge
- V4 badge

**Why now**:

Canvas is the primary navigation surface. Dense cards make it harder to get an overview of a project's state. Simplified cards with prominent Next Step buttons turn the canvas from a passive display into an active navigation tool that guides the user through the workflow.

**Suggested approach**:

1. Refactor `CanvasNodes.tsx` card layout
2. Default render: title + stats line + `NextStepCard` component (Issue #4)
3. Add two collapsible sections below for sentences preview and leaves list
4. Move hash, author, V4 badge rendering to the NodeModal (they appear when user clicks the card to open the detail view)
5. Ensure the card's bounding box is more compact than the current design
6. Verify that canvas interactions (drag, connect, select) still work correctly with the new layout

Files affected:
- `apps/web/src/components/canvas/CanvasNodes.tsx` — **Moderate** layout refactor

**Success criteria / Definition of Done**:

- [ ] Cards default to title + stats + Next Step only
- [ ] Collapsed sections expand correctly on click
- [ ] Cards are visually more compact than the current design
- [ ] Canvas drag, connect, and select interactions are unaffected
- [ ] XYFlow node dimensions update correctly after expand/collapse
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 9

**Title**: `[Feature]: Canvas node NextStep — State derivation logic in canvasStore`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:4`

**Scope**: webui

**What**:

Implement the state derivation logic that determines which Next Step action to show on each canvas node card. This logic lives in `canvasStore.ts` and feeds into the `NextStepCard` component (Issue #4) rendered inside each card (Issue #8).

State machine for canvas-level Next Step:

```typescript
type CanvasNextStep =
  | { action: 'start-conversation'; label: 'Start Conversation →' }
  | { action: 'create-commit';      label: 'Create Commit →' }
  | { action: 'create-output';      label: 'Create Output →' }
  | { action: 'preview-output';     label: 'Preview Output →' }
  | { action: 'export';             label: 'Export →' }

function deriveCanvasNextStep(node: CanvasNode): CanvasNextStep {
  if (node.type === 'staging') {
    if (node.conversationTurnCount === 0) return { action: 'start-conversation', ... }
    return { action: 'create-commit', ... }
  }
  if (node.type === 'committed') {
    if (node.leaves.length === 0) return { action: 'create-output', ... }
    if (node.leaves.some(l => l.status === 'complete')) return { action: 'export', ... }
    return { action: 'preview-output', ... }
  }
}
```

**Why now**:

The Next Step button on canvas cards (Issue #8) needs this logic to decide what to display. Separating it into `canvasStore.ts` keeps the component pure and makes the logic unit-testable.

**Suggested approach**:

1. Add `deriveCanvasNextStep()` function to `canvasStore.ts` (or a new `hooks/useNextStep.ts`)
2. Gather required data from existing store state: node type, conversation turn count, attached leaves, leaf statuses
3. Define priority rules for edge cases (e.g., multiple leaves with different statuses — use the most advanced one)
4. Wire the derived state into `NextStepCard` inside `CanvasNodes.tsx`
5. Write unit tests for all 5 state transitions

Files affected:
- `apps/web/src/store/canvasStore.ts` — **Small**: add derivation function
- `CanvasNodes.tsx` — wire `NextStepCard` with derived state

**Success criteria / Definition of Done**:

- [ ] `deriveCanvasNextStep()` covers all 5 states correctly
- [ ] Unit tests for each state transition
- [ ] Edge cases handled (no leaves, multiple leaves, mixed statuses)
- [ ] Next Step on canvas cards updates reactively when underlying data changes
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 10

**Title**: `[Feature]: Diff entry point restructuring — 3-layer access model`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:1`, `phase:3`

**Scope**: webui

**What**:

Restructure how users access the diff feature across three layers, replacing the current 4-step operation chain (`Select target → Run Diff → Mini preview → Open Full Diff`).

**Layer 1 — Passive (0 clicks):**
On the commit success page (Issue #7), if a parent commit exists, automatically display a change summary (added/modified/removed counts). The most common diff question ("What just changed?") is answered without any user action.

**Layer 2 — From Version History (2 clicks):**
In the CommittedCommitView Version History section (Issue #2), each commit entry has a `[see changes]` link. Clicking it opens `DiffFullScreen` directly with `base = parent commit` and `target = selected commit`. Down from 4 clicks to 2.

**Layer 3 — Arbitrary comparison (2 clicks):**
The "Compare Versions" link in the Advanced section (Issue #3) opens `DiffFullScreen` with a commit selector, allowing comparison of any two commits.

**Removed:**
- The right-sidebar diff section with target selector + "Run Diff" button + mini preview panel
- The `DiffFullScreen` component itself is unchanged — only its entry points are restructured

**Why now**:

Diff is a core feature of "Git for Meaning" but is currently buried behind 4 interactions in a corner of the UI. This restructuring makes the most common diff scenario (comparing with parent) a zero-click experience, while still supporting arbitrary comparisons for power users.

**Suggested approach**:

1. **Layer 1**: Implemented as part of Issue #7 (CommitSuccessPage auto-diff)
2. **Layer 2**: In the Version History collapsible (Issue #2), add a `[see changes]` button per entry that calls `DiffFullScreen` with pre-set base/target hashes
3. **Layer 3**: In the Advanced section (Issue #3), "Compare Versions" opens `DiffFullScreen` in selector mode
4. Remove the old right-sidebar diff chain: target commit dropdown, "Run Diff" button, mini diff preview component
5. `DiffFullScreen.tsx` needs no internal changes

Files affected:
- `CommittedCommitView.tsx` — part of Issue #1/2/3 rewrite
- `CommitSuccessPage.tsx` — part of Issue #7
- `DiffFullScreen.tsx` — **No changes**

**Success criteria / Definition of Done**:

- [ ] Commit success page shows auto-generated diff summary (Layer 1, 0 clicks)
- [ ] Version History `[see changes]` opens DiffFullScreen directly (Layer 2, 2 clicks)
- [ ] "Compare Versions" in Advanced opens DiffFullScreen with selector (Layer 3, 2 clicks)
- [ ] Old 4-step diff chain is completely removed (no mini preview, no "Run Diff" button)
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 11

**Title**: `[Feature]: Empty state and error guidance system`

**Labels**: `type:feature`, `status:needs-design`, `ux-redesign`, `phase:5`

**Scope**: webui

**What**:

Create reusable `EmptyState` and `ErrorGuidance` components and apply them to every empty/error scenario in the product. Currently, empty states show minimal text or disabled buttons — new users get stuck with no idea how to proceed. Every empty or error state should become a teaching moment with actionable guidance.

Scenarios to cover:

| Scenario | Current behavior | New behavior |
|----------|-----------------|--------------|
| New unit, empty conversation | Blank modal | "Start a conversation to capture knowledge. Type your first message below." |
| Draft, no source connected | "No source content" text | "Connect an upstream conversation or commit to provide source material." + `[How to connect]` link |
| Committed, no Leaf | No indication | Next Step: "Create Output →" + subtitle: "Outputs let you publish, evaluate, or deploy your knowledge." |
| Diff, only 1 commit exists | "Compare with…" button disabled | Hide diff entry point entirely (nothing to compare) |
| Commit failed | Error text in sidebar | Full-width error banner: "Could not find turn hash. The source conversation may have been modified." + `[Retry]` |
| History, single commit | Empty timeline | "This is the first commit on this branch. Future commits will appear here as a timeline." |

**Why now**:

Empty states are the first thing a new user encounters. If the product doesn't guide them through the first few interactions, they leave. This is the final polish layer that ties together all the other UX improvements.

**Suggested approach**:

1. Create `apps/web/src/components/ui/EmptyState.tsx`:
   - Props: `title: string`, `description: string`, `action?: { label: string, onClick: () => void }`, `helpLink?: { label: string, href: string }`
   - Visual: centered layout, muted icon, clear text, optional action button
2. Create `apps/web/src/components/ui/ErrorGuidance.tsx`:
   - Props: `title: string`, `description: string`, `retryAction?: () => void`
   - Visual: full-width banner, warning icon, guidance text, retry button
3. Apply `EmptyState` to all 6 scenarios listed above
4. Apply `ErrorGuidance` to commit failure and other error states

Files affected:
- New: `apps/web/src/components/ui/EmptyState.tsx`
- New: `apps/web/src/components/ui/ErrorGuidance.tsx`
- Touch: `ConversationView`, `PendingCommitView`, `CommittedCommitView` — replace current empty/error states

**Success criteria / Definition of Done**:

- [ ] All 6 scenarios have contextual guidance with actionable text
- [ ] `EmptyState` and `ErrorGuidance` components are reusable with configurable props
- [ ] Guidance text is specific and helpful (not generic "Something went wrong")
- [ ] Diff entry points are hidden (not disabled) when only 1 commit exists
- [ ] Error banner includes specific error context and a retry action
- [ ] `pnpm test:webui` passes

**Potential impact**:
- [x] Needs CLI/WebUI changes

---

## Issue 12

**Title**: `[Feature]: Document Three-Layer Capability Model as design specification`

**Labels**: `type:feature`, `docs`

**Scope**: webui

**What**:

Formalize the Three-Layer Progressive Disclosure model as a design specification in `docs/frontend-design-principles.md`. This document serves as the single source of truth for which features belong in which layer, so that all implementation issues (#1–#11) follow a consistent standard.

Content to add:

1. **Layer definitions:**
   - Layer 1 (Default): New users, non-technical. Always visible. Core workflow features.
   - Layer 2 (Proficient): Regular users. Collapsed/expandable sections. Supporting features.
   - Layer 3 (Expert): Technical/power users. Hidden behind "Advanced". Specialist features.

2. **Complete feature assignment table:**

   | Feature | Layer | Default visible? | Location |
   |---------|-------|-------------------|----------|
   | Sentence list | 1 | Yes | Main content |
   | Constraint badges | 1 | Yes | Below sentences |
   | Next Step button | 1 | Yes | Below constraints |
   | Source Context mapping | 2 | No (collapsed) | Collapsible section |
   | Pin management | 2 | No (collapsed) | Collapsible section |
   | Version History | 2 | No (collapsed) | Collapsible section |
   | Linked Leaves | 2 | No (collapsed) | Collapsible section |
   | Diff comparison | 3 | No (Advanced) | Advanced link |
   | Raw JSON | 3 | No (Advanced) | Advanced link |
   | Merge operations | 3 | No (Advanced) | Advanced link |
   | Metadata/Lineage | 3 | No (Advanced) | Advanced section |

3. **Design principles:**
   - Every view must answer: Where am I? / What's next? / Stuck?
   - Next Step is the most visually prominent element in any view
   - Layer 1 is visible by default, Layer 2 is collapsed, Layer 3 is behind "Advanced"
   - Empty states are teaching moments, not dead ends

**Why now**:

This is a Phase 0 prerequisite. Having the design spec documented before implementation starts ensures all issues are implemented consistently. It also serves as onboarding material for contributors.

**Suggested approach**:

Add a new section titled "Three-Layer Capability Model" to `docs/frontend-design-principles.md`.

Files affected:
- `docs/frontend-design-principles.md` — **Moderate**: add new section

**Success criteria / Definition of Done**:

- [ ] Three-layer model is clearly defined with audience, visibility rules, and feature list
- [ ] Feature assignment table covers all existing features without ambiguity
- [ ] Design principles are stated as actionable rules (not vague guidelines)
- [ ] Document is referenced from CLAUDE.md or linked in relevant issues

**Potential impact**:
- (none — documentation only)
