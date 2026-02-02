# T3X Frontend Design Principles

> Status: Active
> Last Updated: 2026-01-30
> Scope: apps/web (t3x-webui)

This document defines the frontend design principles and design direction for T3X WebUI. It is grounded in T3X's product nature as a semantic version control system for AI conversations, designed to be accessible to a broad audience while offering depth for technical users.

---

## Table of Contents

1. [Product Positioning & Design Philosophy](#1-product-positioning--design-philosophy)
2. [Core Design Principles](#2-core-design-principles)
3. [Information Architecture](#3-information-architecture)
4. [Visual Design](#4-visual-design)
5. [Interaction Design](#5-interaction-design)
6. [Performance Budget](#6-performance-budget)
7. [Accessibility](#7-accessibility)
8. [User Testing & Validation](#8-user-testing--validation)
9. [Personalization](#9-personalization)
10. [Priority Matrix](#10-priority-matrix)

---

## 1. Product Positioning & Design Philosophy

### 1.1 What T3X Is

T3X is "Git for Meaning" — a semantic version control system for AI conversations. Its underlying architecture borrows from Git (branch, commit, merge, diff), but the product's surface must be far more approachable than Git itself.

**Two user groups**:

| Group | Proportion | Profile | Expectation |
|-------|-----------|---------|-------------|
| **General users** | ~80% | Non-technical: researchers, writers, product managers, knowledge workers. Not familiar with Git. | "I want to organize and track my AI conversations. Show me what changed and help me combine knowledge." |
| **Technical users** | ~20% | Developers, data scientists. Familiar with Git concepts. | "I want commit DAGs, semantic diffs, branch management, and keyboard shortcuts." |

**Core task**: Organize, track, compare, and merge semantic knowledge extracted from AI conversations.

**Reference frame**: The product should feel like **Notion meets version history** for the 80%, and like a **semantic Git GUI** for the 20%. The entry barrier must be lower than GitHub, not higher.

**Design implication**: Git is the engine under the hood, not the dashboard on the windshield. Users should benefit from version control without needing to understand version control terminology.

### 1.2 Design Philosophy: Orange to Blue

T3X has established a clear visual metaphor:

```
Orange (Pending / Draft) → Blue (Committed / Stable)
```

This is not just a color scheme — it is the **state narrative** of the entire product. Every UI element should let users visually perceive "what stage is this object at" without reading labels.

**Principle**: Color is state, state is color.

### 1.3 Not a Dashboard — a Workspace

The core T3X interface is a **Canvas Workspace** — a graph-based spatial operating environment. This means:

- The traditional dashboard "top-to-bottom scanning" pattern does not apply
- T3X requires **spatial navigation**: zoom, pan, focus, path tracing
- Information hierarchy is not vertical (important things at the top) but **topological** (important things are on critical paths of the graph)

---

## 2. Core Design Principles

### Principle 1: Accessible Surface, Powerful Depth

T3X must serve two audiences with one interface. The 80% (non-technical) define the default experience; the 20% (technical) get optional power features.

**Surface layer (for 80% general users)**:

The default UI should use **everyday language**, not Git terminology:

| Git Concept | T3X Surface Term | Why |
|-------------|-----------------|-----|
| Commit | Save / Snapshot | "Commit" means nothing to non-technical users |
| Branch | Version / Variant | "Let me try a different version" is natural |
| Merge | Combine / Unify | "Combine these two versions" is self-explanatory |
| Diff | Compare / Changes | "What changed between these two?" |
| HEAD | Current / Latest | No one outside Git knows what HEAD means |

The UI should present these as default labels. General users think in terms of "I saved this knowledge," "I want to compare two versions," "Let me combine them."

**Depth layer (for 20% technical users)**:

Technical users can opt into a "Developer Mode" or "Advanced View" that exposes:
- Git-native terminology (commit hash, branch DAG, merge conflicts)
- Raw similarity scores (cosine similarity: 0.82)
- Command Palette with Git-style commands (`> merge into main`)
- Keyboard shortcuts following Git/IDE conventions

**Implementation guideline**:

```
General user sees: "These two sentences are similar but slightly different"
  → Clear, no jargon. Color gradient (green → yellow → red) shows degree.

Technical user (Developer Mode) sees: "MODIFIED (similarity: 0.82, cosine)"
  → Precise metric, familiar to data-oriented users.

Both users can: click to see the original source, choose which version to keep.
```

**Key rule**: The general user path must work without ever encountering Git terminology. Technical features are additive, never prerequisites.

### Principle 2: Canvas Is a First-Class Citizen

The T3X canvas is not a decorative visualization — it is the **primary operating interface**. All design decisions should center on canvas experience.

**Spatial cognition**:
- Node position should be meaningful. ELK.js auto-layout (hierarchical downward) presents a natural top-to-bottom flow that general users can read as a timeline
- For technical users, this also maps to the Git DAG mental model
- Main version line should be on the left/center, variants extending rightward
- User-adjusted positions should be persisted

**Zoom levels and information density** — Implement **semantic zoom**:

| Zoom Level | Content Shown | User Goal |
|-----------|--------------|-----------|
| Level 1 (Overview) | Node shapes, colors, connections only | Understand overall structure: "What branches exist? Where are merge points?" |
| Level 2 (Mid-range) | Node titles, status badges, sentence counts | Locate target: "Where is the commit I need?" |
| Level 3 (Close-up) | Sentence previews, constraint lists | Inspect details: "Does this commit contain content about X?" |

Rather than simply scaling up/down the same content, render different detail levels at different zoom levels.

**Canvas performance**:
- Node drag/pan/zoom must maintain 60fps
- Beyond 100 nodes: virtualize (only render nodes within viewport)
- ELK layout computation should run in a Web Worker to avoid blocking the main thread
- For large projects: prioritize rendering the visible area, lazy-load the rest

### Principle 3: State Visibility — Users Always Know "Where Am I, What Happened"

T3X involves multiple layers of state:

| Layer | State Type | Current Implementation | Suggested Improvement |
|-------|-----------|----------------------|----------------------|
| **Node state** | Pending / Committed / Branch | Color coding (Orange/Blue/Amber) | Already good, maintain |
| **Operation state** | Merging / Generating / Validating | Toast notifications | Add progress indicators |
| **Data freshness** | Last sync time | Not explicitly shown | Add "last synced" indicator |
| **Context state** | Which resources are pinned | Pin button + Context Panel | Add global pin overview |
| **History position** | User's position in the DAG | Breadcrumb navigation | Add "you are here" marker on minimap |

**Recommendation**: Add a **Status Bar** at the bottom of the canvas, similar to VS Code's bottom status bar:

```
[main] | 12 commits | 3 branches | 2 leaves | Last sync: 5s ago | Connected
```

This gives users a persistent anchor to understand current project state.

### Principle 4: Progressive Disclosure — Layer Complexity Exposure

T3X's concept hierarchy is deep:

```
Project → Conversation → Turn → Commit → Sentence → Constraint
                                    ↓
                              Leaf → Assertion → Output
                                    ↓
                              Pin → Context → LLM Memory
```

New users should not need to understand all concepts at once. This is especially critical because 80% of users are non-technical — they need to feel productive on day one. Expose in layers:

**Layer 1 (Core flow — everyone)**:
- Create project → Add conversation → Save snapshot → View result
- Minimum viable flow using simple language: "Add a conversation, save what matters, see the result"
- No mention of commits, branches, or DAGs at this stage

**Layer 2 (Comparison and versions — after comfort)**:
- Create a version → Compare changes → Combine versions
- Introduced naturally after user has Layer 1 experience
- Surface language: "Try a different version," "What changed?", "Combine these"

**Layer 3 (Advanced control — power users)**:
- Leaf constraint editing → Pin context management → Output validation
- Exposed on demand or via Developer Mode
- This is where Git-like terminology and raw metrics become available

**Implementation**:
- Canvas toolbar defaults to core operations only (Add Conversation, Save, View)
- "Version", "Compare", "Combine" operations are prominent but introduced progressively
- Advanced features (Constraints, Pins, Assertions) live in secondary panels or menus
- On first use, a guided flow walks through the core path — no skippable splash screen, but a brief interactive walkthrough
- Command Palette (Cmd+K, already implemented) serves as the power-user fast track
- Tooltips and contextual hints appear at moments of discovery, not all at once

### Principle 5: Compare and Combine Are Core Experiences — Must Be Best-in-Class

This is the interaction that differentiates T3X from all other products. The underlying engine is Diff and Merge, but the surface experience must be intuitive for non-technical users.

**Compare experience** (Diff):

T3X comparison is semantic-level, not text-level. The side-by-side view (already implemented) is the foundation, but needs two-layer enhancement:

General user layer:
- Use natural language labels: "Same," "Changed," "New," "Removed" — not SAME/MODIFIED/ADDED/REMOVED
- Color gradient from green (similar) to red (different) — users intuitively understand this without needing to know similarity scores
- Hovering over a sentence on one side highlights the closest match on the other side
- Summary at top: "3 things changed, 2 new items, 1 removed" — scannable at a glance

Technical user layer (Developer Mode):
- Each sentence shows similarity score: `(similarity: 0.82)`
- Stats bar with exact counts (SAME / MODIFIED / ADDED / REMOVED) + clickable filtering
- Threshold configuration: adjust the similarity cutoff

Both layers:
- Color gradient for similarity degree:
  ```
  0.95+     → Nearly identical (light green background)
  0.80–0.95 → Changed (light yellow background)
  0.70–0.80 → Significantly different (light orange background)
  <0.70     → Completely different (light red background)
  ```

**Combine experience** (Merge):

Combining is the most complex user task in T3X. The language matters: for general users, this is "combining two versions," not "resolving merge conflicts."

- **Reduce decision fatigue**:
  - Auto-recommend: pairs with similarity > 0.90 auto-select the newer version (user can override)
  - Batch operations: "Keep all from Version A" / "Keep all from Version B"
  - Progress indicator: "Reviewed 8 of 15 items"
  - For general users, frame each decision as a simple question: "Which version do you want to keep?"
- **Real-time preview**: Each user decision instantly updates the combined result preview (<100ms)
- **Undo support**: Every decision must be reversible until final save
- **Smart defaults**: For general users, auto-resolve obvious cases (identical items, clearly newer content) and only surface genuinely ambiguous items for manual review

### Principle 6: Evidence Chain Traceability — Every Conclusion Traces Back to Source

A core T3X value proposition is "evidence-backed". Every sentence has a `source_ref` (pointing to turn_hash + character range). This traceability must be a first-class UI feature:

- In Commit view, every sentence should have a "View Source" link (ViewSourceLink already exists)
- Clicking it should **precisely jump** to the conversation turn and highlight the character range
- In Leaf assertion validation results, failed assertions should link directly to the causing source
- Implement **Source Breadcrumb**: `Leaf → Commit → Sentence → Turn` complete trace path

```
User sees a failed assertion
  → Clicks "View Source"
    → Jumps to the corresponding sentence in the Commit
      → Clicks the sentence's source link
        → Jumps to the exact position in the original conversation (character range highlighted)
```

If any link in this chain breaks, T3X's "evidence-backed" value is diminished.

### Principle 7: Empty and Error States Are Guidance Opportunities

T3X has many states that need thoughtful empty state design:

| Scenario | Current State | Recommendation |
|---------|--------------|----------------|
| New project, no conversations | Empty canvas | Show guide: "Add your first conversation to get started" + example button |
| Conversations exist, no commits | Conversation nodes with no children | Show "Ready to commit" prompt on node |
| Commit with no leaves | No leaf section in commit detail | Prompt: "Create a Leaf to generate verifiable output" |
| Diff with no differences | Empty diff view | "These two commits are identical" + suggested action |
| Merge with no conflicts | Empty conflict list | "No conflicts — you can fast-forward merge" |
| Empty pin list | Empty Context Panel | "Pin conversations or leaves to provide LLM context" |

Every empty state should answer three questions:
1. Why is it empty?
2. What does this mean?
3. What should the user do next?

### Principle 8: Restrained Motion — Serves Understanding, Not Showing Off

The `lib/motion.ts` system already establishes a solid animation foundation. The governing principle:

**Where motion is appropriate**:
- Node creation/deletion (scaleIn/fadeOut) → helps users track spatial changes
- Edge connection flow animation → communicates data flow direction
- Merge conflict resolution transitions → gives "choice registered" feedback
- State change (Pending → Committed) → color gradient transition, communicates state transfer

**Where motion is not appropriate**:
- Node content updates → replace directly, no bouncing
- Filter result changes → apply immediately, no fade transitions that delay information access
- Frequent real-time data updates → keep calm, not chaotic

**What's already done well**:
- `useReducedMotion` hook and complete `reducedMotion` variants for accessibility
- Tiered spring configs (snappy/gentle/bouncy/smooth) with clear use cases

**Suggested improvements**:
- When many nodes appear simultaneously (project load), use stagger animation to let nodes appear sequentially — reduces visual shock
- Long operations (Merge, Generate Output) should use skeleton loading or progress bars, not just spinners

---

## 3. Information Architecture

### 3.1 Navigation Structure

The current fixed narrow left sidebar (64px) is sound — it does not consume canvas space. Information architecture can be enhanced:

```
Current:
├── Projects (list page)
├── Agent Demo
├── Deploy & Eval
├── Insights
└── Docs / GitHub

Suggested:
├── Projects (list page)
│   └── [Project] (canvas + sub-navigation)
│       ├── Canvas (default view)
│       ├── Conversations (list view)
│       ├── Commits (timeline view)
│       ├── Branches (comparison view)
│       └── Settings (project config)
├── Agent Workspace
│   ├── Chat
│   ├── Optimizer
│   └── Deploy
└── Settings / Docs
```

Rationale: After entering a Project, users should have multiple perspectives on the same data. Canvas is the default, but sometimes users need a list view (find a specific conversation), timeline view (see commit history), or comparison view (see branch differences). These are not different pages — they are different projections of the same data.

### 3.2 Command Palette (Cmd+K) as Efficiency Portal

CommandPalette is already implemented. Suggested extensions to make it T3X's "semantic search entry point":

- Search projects, conversations, commits, sentence content
- Quick actions: `> Create Branch`, `> Merge into main`, `> New Leaf`
- Navigation: `Go to Commit sha256:abc...`
- Recent access: Show the 5 most recently operated objects

For the 20% technical users, this is faster than any menu. For the 80%, the Command Palette also serves as a discoverable search box — type what you want in natural language and see matching actions.

---

## 4. Visual Design

### 4.1 Current Design System Evaluation

The existing design system (`lib/theme.ts`) is high quality:

- **Clear semantic color mapping**: Blue=Committed, Orange=Pending, Amber=Branch, Indigo=Conversation, Emerald=Leaf
- **Complete typography system**: 14px body text, Geist font, full weight/tracking definitions
- **Well-layered shadow system**: From xs to xl + glow variants
- **Dedicated canvas tokens**: 16px grid, standardized node dimensions

### 4.2 Visual Directions to Strengthen

**Balancing data density and breathing room**:

T3X is not an information-sparse product. A Commit may have 20+ sentences, a Merge may have 15+ conflict pairs. At this data density:

- Use `text-sm` (13px) as the base font size for list items instead of `text-base` (14px) — saves 1-2px per line with significant cumulative effect
- Sentence lists should use alternating background colors (zebra striping) for scanning efficiency
- Long lists must have virtual scrolling — do not render 200 sentences at once

**Dark and light modes as equals**:

With 80% non-technical users, light mode is likely the more common preference (matching mainstream apps like Notion, Google Docs). Light mode should be the default, but dark mode must be fully polished:

- Dark mode node colors need separate tuning (not simply inverted)
- Edge colors on dark canvas must be sufficiently visible
- Diff view color contrast in dark mode needs specific verification
- Both themes should feel intentionally designed, not one derived from the other

### 4.3 Charts and Data Visualization

The Optimizer module already has Bar/Radar/Dual Charts. For the overall product:

- **Version history visual refinement**: For general users, present it as a clear timeline with branching paths. For technical users (Developer Mode), reference the `git log --graph` visual language with explicit branch lines
- **Diff statistics**: Do not rely only on numbers — add proportion bars (like GitHub PR green/red ratio bars)
- **Sentence similarity**: Consider a heatmap — rows are source sentences, columns are target sentences, color intensity represents similarity

---

## 5. Interaction Design

### 5.1 Two Interaction Tiers: Click-First, Keyboard-Accelerated

The default interaction mode must be **click-and-drag** — intuitive for the 80% who use tools like Notion, Figma, or Google Docs. Keyboard shortcuts are the acceleration layer for the 20%.

**Primary tier (everyone)**: All actions accessible via buttons, menus, and drag-and-drop. No action should require a keyboard shortcut to perform.

**Acceleration tier (power users)**: Keyboard shortcuts for frequent operations:

| Action | Shortcut | Rationale |
|--------|----------|-----------|
| Search / Command Palette | Cmd+K | Already implemented |
| Save snapshot | Cmd+S | Universal convention |
| Undo | Cmd+Z | Universal convention |
| Zoom canvas to fit | Cmd+0 | IDE convention |
| Focus selected node | F | XYFlow common pattern |
| Switch version | Cmd+B | Power user shortcut |
| Compare | Cmd+D | Power user shortcut |
| Delete selected | Backspace / Delete | Universal |
| Combine versions | Cmd+M | Power user shortcut |

**Discoverability**: Keyboard shortcuts should be shown as hints in tooltips and menus (e.g., a button labeled "Save" with a subtle "Cmd+S" badge). This helps general users learn shortcuts organically without requiring them upfront.

### 5.2 Context Menus

Canvas node context menus should be a primary action entry point:

```
Right-click Conversation node:
├── Open Conversation
├── Create Commit from this
├── Pin to Context
├── Create Branch
└── Delete

Right-click Commit node:
├── View Details
├── Diff with... (select another commit)
├── Create Leaf
├── Branch from here
├── Merge into...
└── View Source Turns

Right-click empty canvas:
├── Add Conversation
├── Paste (if copied node)
├── Auto Layout
├── Zoom to Fit
└── Toggle Grid
```

### 5.3 Drag and Drop

The canvas naturally suits drag-and-drop interactions:

- Drag a Conversation onto another Conversation → trigger Merge preparation
- Drag a Commit onto a Leaf node → set that Commit as the Leaf's data source
- Drag a text file from outside → create a new Conversation and import content
- Drag between nodes to draw an edge → establish parent relationship

---

## 6. Performance Budget

### 6.1 Canvas Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| First canvas render | < 1s (50 nodes) | Priority: render viewport area first |
| Node drag frame rate | 60fps | Depends on XYFlow + number of visible nodes |
| ELK layout computation | < 500ms (100 nodes) | Should run in Web Worker |
| Diff computation | < 2s (100 sentence pairs) | Core layer computation |
| Max canvas nodes | 500+ (with virtualization) | Only render viewport nodes |

### 6.2 Loading Strategy

- **Canvas**: Render visible-area nodes first, off-screen nodes deferred
- **Node content**: Summary info loads immediately, details (sentence list) lazy-loaded
- **Diff results**: Skeleton loading + block-by-block streaming render
- **API calls**: Use SWR / stale-while-revalidate for frequently accessed data (project list, pin list)
- **Large datasets**: Paginate sentence lists, virtual scroll for 50+ items

---

## 7. Accessibility

### 7.1 What's Already Done Well

- `useReducedMotion` hook and complete reduced motion variants
- shadcn/ui components with built-in ARIA attributes
- `getVariants()` and `getSpring()` utility functions that respect motion preferences

### 7.2 Areas to Strengthen

**Canvas accessibility**:
- XYFlow Canvas is not screen-reader friendly. Provide an alternative **list view** so users who cannot use a mouse or see the canvas can still operate
- Ensure all canvas actions (add node, connect, delete) are available via keyboard

**Color cannot be the sole information channel**:
- Currently using color to distinguish Pending/Committed/Branch. Must also use icons or text labels
- Color-blind users cannot distinguish Orange from Green
- Diff view should use icons (+/-/~) or border styles in addition to color for ADDED/REMOVED/MODIFIED

**Keyboard navigation**:
- Nodes within the canvas should be navigable with Tab/Arrow keys
- Focus states must be clearly visible

**Contrast verification**:
- Verify that `text-xs` (12px) on light backgrounds meets WCAG AA standard (4.5:1 ratio)
- Dark mode contrast needs separate verification pass
- Badge text on gradient backgrounds needs contrast check

---

## 8. User Testing & Validation

### 8.1 Priority Test Scenarios

Testing must cover both user groups separately. A feature that works for the 20% technical users may completely block the 80% general users.

**For general users (80%)**:
1. **First-use flow**: Can a non-technical user create a project, add a conversation, and save a snapshot within 5 minutes — without external help or documentation?
2. **Vocabulary comprehension**: When shown the canvas, does the user understand what "Save," "Compare," "Combine" mean? Do they hesitate or look confused at any label?
3. **Combine decisions**: Can a non-technical user successfully combine two versions by answering "which one do you want to keep?" — without understanding similarity scores?
4. **Canvas navigation**: In a project with 20+ nodes, can a new user find and open a specific conversation within 30 seconds?
5. **Source tracing**: Can a user trace back to the original conversation from a result? Is the path obvious?

**For technical users (20%)**:
1. **Developer Mode efficiency**: After enabling Developer Mode, can a Git-familiar user leverage commit hashes, branch DAGs, and keyboard shortcuts to work faster than the default mode?
2. **Diff precision**: Do technical users find the similarity scores and threshold controls useful and accurate?
3. **Power user shortcuts**: Are Cmd+K, Cmd+S, and context menus discoverable and functional?

### 8.2 Quantitative Metrics

| Metric | User Group | Measurement | Target |
|--------|-----------|-------------|--------|
| Time to first snapshot | General | Event tracking | < 3 min |
| Time to first commit | Technical | Event tracking | < 2 min |
| Combine completion rate | General | Funnel analysis | > 85% |
| Merge completion rate | Technical | Funnel analysis | > 90% |
| Canvas navigation time | General | Session recording | < 30s |
| Source trace click count | Both | Event tracking | ≤ 3 clicks |
| Empty state conversion | Both | Event tracking | > 50% |
| Vocabulary confusion rate | General | Usability test observation | < 10% of interactions |

### 8.3 What Not to Do

- **Do not assume Git knowledge in any default flow**: If a non-technical user encounters "commit hash" or "merge conflict" in the standard path, that is a bug
- **Do not A/B test fundamental navigation**: User base may not be large enough for statistical significance at early stages
- **Do not add gamification**: T3X is a knowledge tool — no points, badges, or achievement systems
- **Do not skip non-technical user testing**: It is tempting to test only with the team (who are all technical). Recruit non-technical testers deliberately

---

## 9. Personalization

### 9.1 Appropriate for T3X

- **Experience mode**: General Mode (default) vs Developer Mode — the single most important personalization axis
- **Canvas layout persistence**: User-adjusted node positions should be saved
- **Filter presets**: Frequently used version filters, time range filters can be saved as presets
- **Dark/Light mode**: Already supported (light mode default)
- **Information density preference**: Allow users to choose "compact" or "comfortable" list density
- **Default view**: Users can set whether entering a project shows Canvas or Timeline
- **Onboarding path**: Ask during onboarding whether the user is familiar with version control concepts. Route to appropriate first-use experience:
  - Non-technical: Guided walkthrough with simple language, focus on "save, compare, combine"
  - Technical: Quick overview with Git mapping, surface Developer Mode option early

### 9.2 Not Appropriate for T3X

- **Widget drag-and-arrange**: T3X is not a dashboard — no widget concept
- **AI-recommended content**: T3X data is the user's own semantic knowledge — no recommendations needed
- **Overly granular role configuration**: Two modes (General / Developer) are sufficient. Do not create 5+ role templates — that adds complexity without proportional value

---

## 10. Priority Matrix

Ordered by importance:

| Priority | Area | Key Actions |
|----------|------|-------------|
| **P0** | Approachable default experience | Simple vocabulary, guided first-use flow, no Git jargon in default mode |
| **P0** | Canvas experience | Semantic zoom, performance optimization, intuitive spatial navigation |
| **P0** | Compare / Combine | Natural-language labels, smart defaults, batch operations, real-time preview |
| **P0** | Source tracing | Complete evidence chain UI, Leaf → Commit → Turn without breaks |
| **P1** | Progressive disclosure | Layered feature exposure, empty state guidance, contextual tooltips |
| **P1** | Two-mode system | General Mode / Developer Mode toggle, onboarding path split |
| **P1** | State visibility | Status bar, operation progress indicators, data freshness |
| **P2** | Power-user efficiency | Keyboard shortcuts, Command Palette enhancement, context menus |
| **P2** | Accessibility | Alternative list view, color + icon dual channel, keyboard canvas navigation |
| **P2** | Multiple views | Canvas / Timeline / List — three project views |
| **P2** | Dark mode polish | Node color tuning, contrast verification for both themes |
| **P3** | Personalization | Layout persistence, filter presets, information density preference |

---

## Fundamental Stance

T3X is a knowledge management tool that happens to be powered by version control. The barrier to entry must be **lower than GitHub, not higher**. 80% of users will never know or care that there is a Git-like engine underneath — and that is a success, not a failure.

The design serves two audiences through one interface:
- **General users (80%)** experience T3X as an intuitive tool for saving, comparing, and combining knowledge from their AI conversations. The vocabulary is simple. The flows are guided. The defaults are smart.
- **Technical users (20%)** can unlock a deeper layer — commit DAGs, similarity metrics, keyboard-driven workflows — that gives them the precision and speed they expect from developer tools.

Design decisions should always be validated against this question: **Can a non-technical user accomplish this task without encountering jargon, confusion, or a dead end?**

If the answer is no, the default experience needs to be simplified. The advanced capability can still exist — but it must not be a gate that blocks the majority of users.

Git is the engine. The user sees the road.
