# UX Redesign: Progressive Disclosure & Next Step Navigation

> Status: Proposal
> Date: 2026-02-03
> Scope: apps/web (CommittedCommitView, PendingCommitView, CanvasNodes, Diff)

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Design Philosophy](#2-design-philosophy)
3. [Three-Layer Capability Model](#3-three-layer-capability-model)
4. [Detailed Redesign: CommittedCommitView](#4-detailed-redesign-committedcommitview)
5. [Detailed Redesign: PendingCommitView](#5-detailed-redesign-pendingcommitview)
6. [Detailed Redesign: Canvas Node Cards](#6-detailed-redesign-canvas-node-cards)
7. [Diff Repositioning](#7-diff-repositioning)
8. [Empty State & Error Guidance](#8-empty-state--error-guidance)
9. [Implementation Phases](#9-implementation-phases)
10. [File Impact Assessment](#10-file-impact-assessment)

---

## 1. Problem Statement

### 1.1 Current Issues

**CommittedCommitView has information overload.** A single modal packs 8 distinct feature areas into a 3-column layout:

| Area | Content |
|------|---------|
| Left sidebar | Version info, lineage, memory context (pins) |
| Main tab 1 | Source context (sentence-to-conversation mapping) |
| Main tab 2 | Source excerpt (snippet list) |
| Main tab 3 | Raw JSON |
| Right sidebar top | Constraint badges (must/mustn't keywords) |
| Right sidebar mid | History button → opens a sheet |
| Right sidebar bottom | Diff comparison (select target → run → preview → open full) |
| Overlay layers | DiffFullScreen, CommitHistoryPanel |

A new user opening this modal sees everything at once and has no idea where to look.

**Diff is buried behind a 4-step operation chain:**

```
Right sidebar → Select target commit → Click "Run Diff" → See mini preview → Click "Open Full Diff"
```

For a product called "Git for Meaning", version comparison should not require 4 clicks from a corner of the UI.

**PendingCommitView is a 1560-line monolith** that displays Step 1 (Configure) and Step 2 (Curate) simultaneously in a sidebar + editor layout. The source editor competes for space with the configuration panel.

**No guided flow.** After committing, the user lands in the CommittedCommitView with no indication of what to do next. The journey from Conversation → Commit → Leaf → Output requires the user to already know the system.

### 1.2 Root Cause

The UI was built feature-by-feature, adding capabilities to existing views. Each feature is individually useful, but the aggregate result is an expert-level interface with no on-ramp for new users.

---

## 2. Design Philosophy

Three principles guide this redesign:

### Principle 1: Progressive Disclosure

T3X is a complex system, but new users only need the shortest path. Features reveal themselves as the user's familiarity grows, not all at once.

### Principle 2: "Next Step Card" as Navigation Hub

Every view answers three questions:
- **Where am I?** — Progress indicator or context
- **What's next?** — One prominent action button
- **Stuck?** — Error/empty state guidance with actionable help

### Principle 3: Three-Layer Capability Model

Features are assigned to layers. Each layer builds on the previous:

| Layer | Audience | Visible by default? | Features |
|-------|----------|---------------------|----------|
| **Layer 1** (Default) | New users, non-technical | Yes | Create Commit, Create Leaf, Preview, Export, basic sentence/constraint view |
| **Layer 2** (Proficient) | Regular users | Collapsed/expandable | Pins, advanced constraint editing, version history, templates, source context |
| **Layer 3** (Expert) | Technical users, power users | Hidden behind "Advanced" | Diff/Merge, batch operations, raw JSON, rule validation, Runner/Eval |

---

## 3. Three-Layer Capability Model — Applied

### Layer assignment for existing features

| Feature | Current location | Layer | Redesign location |
|---------|-----------------|-------|--------------------|
| Sentence list | Main content (always visible) | **1** | Default view, always visible |
| Constraint badges | Right sidebar (always visible) | **1** | Default view, below sentences |
| Next Step button | Does not exist | **1** | **New**: prominent CTA at bottom of default view |
| Source context mapping | Main tab 1 | **2** | Collapsible section |
| Source excerpt | Main tab 2 | **2** | Collapsible section (merge with source context) |
| Pin management | Left sidebar | **2** | Collapsible section |
| Version history | Right sidebar button → sheet | **2** | Collapsible section with inline timeline |
| Linked leaves | Separate LeafPanel sheet | **2** | Collapsible section |
| Diff comparison | Right sidebar (4-step chain) | **3** | "Advanced" section link → full-width diff |
| Raw JSON | Main tab 3 | **3** | "Advanced" section link |
| Merge operations | Separate flow | **3** | "Advanced" section link |
| Metadata/lineage | Left sidebar | **3** | "Advanced" section or collapsed |

---

## 4. Detailed Redesign: CommittedCommitView

### 4.1 Current layout (3-column)

```
┌──────────┬──────────────────────┬──────────────────────────┐
│  LEFT    │   MAIN (3 tabs)      │    RIGHT SIDEBAR         │
│ SIDEBAR  │   Source Context      │    Constraints           │
│          │   Source Excerpt      │    History button         │
│ Metadata │   JSON                │    Diff (select+run+     │
│ Lineage  │                      │     preview+fullscreen)  │
│ Pins     │                      │                          │
└──────────┴──────────────────────┴──────────────────────────┘
```

### 4.2 New layout (single-column, layered)

```
┌──────────────────────────────────────────────────┐
│  Header: "Commit: {title}"                       │
│  [main] · sha256:abc1234 · 2 min ago             │
├──────────────────────────────────────────────────┤
│                                                  │
│  ── Layer 1 (always visible) ──────────────────  │
│                                                  │
│  Sentences (5)                                   │
│  ┌──────────────────────────────────────────┐    │
│  │ • User prefers dark mode for all apps    │    │
│  │ • Font size should be at least 16px      │    │
│  │ • Notifications disabled after 10pm      │    │
│  │ • Language preference is English         │    │
│  │ • Auto-save enabled every 5 minutes      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Constraints                                     │
│  [✓ dark mode] [✓ font size] [✗ light theme]     │
│                                                  │
│  ┌─ Next Step ────────────────────────────────┐  │
│  │  ✦ Create Output from this Commit    →     │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ── Layer 2 (collapsed by default) ────────────  │
│                                                  │
│  ▸ Source Context               (click to expand)│
│  ▸ Pinned Memory (3 pins)      (click to expand)│
│  ▸ Version History              (click to expand)│
│  ▸ Linked Leaves (2)           (click to expand)│
│                                                  │
│  ── Layer 3 ───────────────────────────────────  │
│                                                  │
│  Advanced                                        │
│  [Compare Versions]  [Raw JSON]  [Merge]         │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.3 Next Step state machine

The "Next Step" card content changes based on the commit's current state:

| State | Next Step label | Action |
|-------|----------------|--------|
| Committed, no Leaf attached | "Create Output →" | Opens LeafPanel |
| Committed, Leaf exists (not run) | "Preview Output →" | Navigates to Leaf detail page |
| Committed, Leaf complete | "Export →" | Opens export action |
| Committed, on branch (latest) | "Merge to Main →" | Starts merge flow |

### 4.4 Layer 2 collapsible sections

Each section expands inline (accordion-style, one at a time or independent — TBD):

**Source Context** (expanded):
```
│  ▾ Source Context                                │
│  ┌──────────────────────────────────────────┐    │
│  │ Sentence → Conversation mapping          │    │
│  │ s_1: Turn #3 (user) char 0-42            │    │
│  │ s_2: Turn #5 (assistant) char 12-68      │    │
│  │ ...                                      │    │
│  │ [View in conversation context]           │    │
│  └──────────────────────────────────────────┘    │
```

**Version History** (expanded):
```
│  ▾ Version History                               │
│  ┌──────────────────────────────────────────┐    │
│  │ ● abc1234  "Add dark mode prefs"  2m ago │    │
│  │ │  [see changes]                         │    │
│  │ ● def5678  "Initial extract"     1h ago  │    │
│  │                                          │    │
│  └──────────────────────────────────────────┘    │
```

The "[see changes]" link opens DiffFullScreen directly (2 clicks, down from 4).

### 4.5 Layer 3 advanced links

Small text links at the bottom. Each opens a dedicated view:
- **Compare Versions**: Opens DiffFullScreen with commit selector
- **Raw JSON**: Opens a modal or expandable area with formatted JSON
- **Merge**: Only visible for branch commits; starts merge flow

---

## 5. Detailed Redesign: PendingCommitView

### 5.1 Current layout (sidebar + editor, same screen)

```
┌──────────┬───────────────────────────────────────────────┐
│  SIDEBAR │           SOURCE EDITOR                       │
│          │                                               │
│  STEP 1  │  Text blocks / legacy phrases                 │
│  Config  │  with selection + keyword marking             │
│  (form)  │                                               │
│          │                                               │
│  STEP 2  │                                               │
│  Curate  │                                               │
│  (stats) │                                               │
│          │                                               │
│  [Commit]│                                               │
└──────────┴───────────────────────────────────────────────┘
```

Problems:
- Step 1 and Step 2 coexist in the sidebar, competing for attention
- Source editor shares horizontal space with the sidebar
- 1560 lines in a single component

### 5.2 New layout (paginated wizard)

Three distinct pages, only one visible at a time:

**Page 1: Configure**

```
┌──────────────────────────────────────┐
│  Step  ① ── ○ ── ○                   │
│  Configure your commit               │
├──────────────────────────────────────┤
│                                      │
│  What do you want to extract?        │
│  ┌──────────────────────────────┐    │
│  │ (intent textarea)            │    │
│  └──────────────────────────────┘    │
│                                      │
│  Branch                              │
│  [main ▾]                            │
│                                      │
│  ▸ Advanced Settings                 │
│    Template: [prose ▾]               │
│    Cosine threshold: [0.75]          │
│                                      │
│                       [Next →]       │
└──────────────────────────────────────┘
```

Key changes:
- Template and cosine threshold hidden under "Advanced Settings" (Layer 2)
- Only intent + branch visible by default (Layer 1)
- Full-width layout, no sidebar

**Page 2: Curate**

```
┌──────────────────────────────────────────────────────────┐
│  Step  ✓ ── ② ── ○                                       │
│  Select content to commit                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │                                                  │    │
│  │  (FULL-WIDTH source editor)                      │    │
│  │  Text selection + keyword marking                │    │
│  │  No sidebar competing for space                  │    │
│  │                                                  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  Selected: 5 sentences · 3 must-have · 1 mustn't-have   │
│                                                          │
│                          [← Back]    [Commit →]          │
└──────────────────────────────────────────────────────────┘
```

Key changes:
- Source editor gets full width (no sidebar)
- Stats bar at the bottom summarizes selections
- Back button to return to configuration

**Page 3: Success**

```
┌──────────────────────────────────────┐
│  Step  ✓ ── ✓ ── ③                   │
│  Committed!                          │
├──────────────────────────────────────┤
│                                      │
│  ✓ Successfully committed            │
│                                      │
│  5 sentences extracted               │
│  3 constraints set                   │
│  Branch: main                        │
│                                      │
│  Changes from parent:                │
│  + 2 sentences added                 │
│  ~ 1 sentence modified               │
│  - 0 sentences removed               │
│  [View full diff]                    │
│                                      │
│  ┌─ Next Step ────────────────────┐  │
│  │  Create Output             →   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ▸ View commit details               │
│  ▸ Create another commit             │
│                                      │
└──────────────────────────────────────┘
```

Key changes:
- Dedicated success page instead of jumping to CommittedCommitView
- Auto-generated change summary (diff with parent) shown passively
- "Next Step" guides the user to create a Leaf
- Secondary actions available but not prominent

---

## 6. Detailed Redesign: Canvas Node Cards

### 6.1 Current card

Displays all information by default: sentence list (up to 3), constraint badges, author badge, hash, V4 marker, leaves section with statuses. Dense for a canvas overview.

### 6.2 New card (Layer 1 default)

```
┌─────────────────────────────────┐
│  📝 My Commit Title    [main]  │
│  5 sentences · 3 constraints    │
│                                 │
│  ┌─ Next Step ───────────────┐  │
│  │  ✦ Create Output    →     │  │
│  └───────────────────────────┘  │
│                                 │
│  ▸ 3 sentences preview          │
│  ▸ 2 leaves attached            │
└─────────────────────────────────┘
```

Changes:
- Default: title + summary stats + Next Step button only
- Sentences and leaves are collapsed sections (Layer 2)
- Hash, author, V4 badge moved to expanded/modal view
- Next Step button is the most visually prominent element

### 6.3 Next Step button states (canvas level)

| Node state | Next Step | Action |
|------------|-----------|--------|
| Staging, empty conversation | "Start Conversation →" | Opens ConversationView |
| Staging, has conversation content | "Create Commit →" | Opens PendingCommitView |
| Committed, no Leaf | "Create Output →" | Opens LeafPanel |
| Committed, has Leaf (not run) | "Preview Output →" | Navigates to Leaf detail |
| Committed, has Leaf (complete) | "Export →" | Export action |

---

## 7. Diff Repositioning

### 7.1 Current placement

Diff lives in the right sidebar of CommittedCommitView as a secondary feature. Reaching full diff requires 4 interactions:

```
Select target commit → Click "Run Diff" → See mini preview → Click "Open Full Diff"
```

### 7.2 New placement (three entry points by layer)

**Layer 1 — Passive (0 clicks):**
On the commit success page (PendingCommitView Page 3), if a parent commit exists, automatically display a change summary:

```
Changes from parent:
+ 2 sentences added
~ 1 sentence modified
- 0 sentences removed
```

No user action required. The most common diff scenario (what just changed?) is answered immediately.

**Layer 2 — From history (2 clicks):**
In the "Version History" collapsible section of CommittedCommitView, each history entry has a "[see changes]" link. Clicking it opens DiffFullScreen directly with the parent as base and the selected commit as target.

```
● abc1234  "Add dark mode prefs"  2m ago
│  [see changes]  ← click → DiffFullScreen
● def5678  "Initial extract"     1h ago
```

**Layer 3 — Arbitrary comparison (2 clicks):**
"Compare Versions" in the Advanced section allows selecting any two commits for comparison. Opens DiffFullScreen with a commit selector.

### 7.3 DiffFullScreen component

The existing `DiffFullScreen` component is kept as-is. Only the entry points change — the mini sidebar preview and the "Run Diff" intermediate step are removed.

---

## 8. Empty State & Error Guidance

Every empty or error state becomes a teaching moment with actionable guidance:

| Scenario | Current behavior | New behavior |
|----------|-----------------|--------------|
| New unit, no conversation | Blank modal | "Start a conversation to capture knowledge. Type your first message below." |
| Draft, no source connection | "No source content" text | "Connect an upstream conversation or commit to provide source material." + [How to connect] link |
| Committed, no Leaf | No indication | Next Step: "Create Output →" + subtitle: "Outputs let you publish, evaluate, or deploy your knowledge." |
| Diff, only 1 commit exists | "Compare with..." button disabled | Diff entry point hidden entirely (nothing to compare against) |
| Commit failed | Error text in sidebar | Full-width error banner with specific guidance: "Could not find turn hash. The source conversation may have been modified." + [Retry] button |
| History, single commit | Empty timeline | "This is the first commit on this branch. Future commits will appear here as a timeline." |

---

## 9. Implementation Phases

Each phase produces an independently deployable PR. No phase depends on another being completed first.

### Phase 1: CommittedCommitView single-column redesign

Scope:
- Remove 3-column layout (left sidebar, right sidebar)
- Implement single-column view with Layer 1 (sentences + constraints + Next Step)
- Add collapsible sections for Layer 2 (source context, pins, history, leaves)
- Move diff/JSON to "Advanced" section at bottom

Files affected:
- `apps/web/src/components/canvas/NodeModal/CommittedCommitView.tsx` (rewrite)
- `apps/web/src/components/canvas/NodeModal/shared.tsx` (refactor shared components)

### Phase 2: PendingCommitView paginated wizard

Scope:
- Split 1560-line component into page sub-components
- Implement 3-page wizard (Configure → Curate → Success)
- Move template/cosine to "Advanced Settings" collapsible
- Give source editor full width on Page 2

Files affected:
- `apps/web/src/components/canvas/NodeModal/PendingCommitView.tsx` (split into sub-components)
- New: `PendingConfigPage.tsx`, `PendingCuratePage.tsx`, `CommitSuccessPage.tsx`

### Phase 3: Commit success page with auto-diff summary

Scope:
- Implement Page 3 of the commit wizard
- Auto-call diff API (current commit vs parent) on commit success
- Display change summary (added/modified/removed counts)
- "Next Step: Create Output" button

Files affected:
- New: `CommitSuccessPage.tsx` (or inline in PendingCommitView refactor)
- `apps/web/src/lib/api.ts` (may need a lightweight diff summary endpoint)

### Phase 4: Canvas node card simplification

Scope:
- Reduce default card content to title + stats + Next Step
- Make sentences/leaves collapsible
- Implement Next Step button with state machine logic

Files affected:
- `apps/web/src/components/canvas/CanvasNodes.tsx` (layout refactor)
- `apps/web/src/store/canvasStore.ts` (Next Step state derivation)

### Phase 5: Empty state guidance system

Scope:
- Add contextual guidance text to all empty/error states
- Create reusable `EmptyState` and `ErrorGuidance` components
- Apply across ConversationView, PendingCommitView, CommittedCommitView

Files affected:
- New: `apps/web/src/components/ui/EmptyState.tsx`
- Touch: all three NodeModal sub-views

---

## 10. File Impact Assessment

| File | Phase | Change level | Description |
|------|-------|-------------|-------------|
| `CommittedCommitView.tsx` (768 lines) | P1 | **Rewrite** | 3-column → single-column + collapsible sections |
| `PendingCommitView.tsx` (1560 lines) | P2 | **Split** | Monolith → 3 page sub-components |
| `CanvasNodes.tsx` | P4 | **Moderate** | Card layout simplification + Next Step button |
| `NodeModal.tsx` | P2 | **Small** | Add wizard page routing for PendingCommitView |
| `shared.tsx` | P1 | **Moderate** | Refactor shared components for new layouts |
| `CommitHistoryPanel.tsx` | P1 | **Moderate** | Sheet → inline collapsible section |
| `DiffFullScreen.tsx` | — | **None** | Component unchanged, only entry points change |
| `canvasStore.ts` | P4 | **Small** | Add Next Step state derivation helpers |
| `api.ts` | P3 | **Small** | Possible lightweight diff summary helper |
| New: `CommitSuccessPage.tsx` | P3 | **New** | Commit success page with auto-diff |
| New: `EmptyState.tsx` | P5 | **New** | Reusable empty/error state component |

---

## Appendix: Relationship to Existing Design Documents

This proposal builds on principles established in:
- `docs/frontend-design-principles.md` — particularly the 80/20 user split and "approachable surface" philosophy
- `docs/ui-polish-v1.md` — continues the trajectory of reducing information density on cards

It does not contradict existing design principles but proposes a more structured approach to information hierarchy through explicit layering.
