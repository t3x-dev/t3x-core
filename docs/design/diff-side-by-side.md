# Side-by-Side Diff Full-Screen Page Design Document

## 1. Background & Goals

### Problem
The current diff display is crammed into the NodeModal right-side panel, with limited space. It only shows a simple card list (removed/added/modified) and lacks:
- **Source context** for each sentence (which conversation it came from)
- A left-right comparison view — not intuitive enough
- Word-level diff highlighting (modified items only show original and new text, no word diff)

### Goal
Design a **full-screen side-by-side diff page**, similar to GitHub PR diff, so users can clearly see all differences between two commits at a glance, with the ability to trace each sentence back to its original conversation context.

---

## 2. Interaction Flow

```
NodeModal (existing)
  ├── Select target commit
  ├── Click "Run Diff"
  ├── API returns diff result
  └── Click "Open Full Diff" button
       ↓
Full-Screen Diff Page (new)
  ├── Header: base commit ↔ target commit info
  ├── Stats Bar: summary (identical / modified / added / removed)
  ├── Side-by-Side main area
  │    ├── Left column: Base commit sentences
  │    └── Right column: Target commit sentences
  └── Source Context Modal (reuses existing)
```

### Navigation Approach
**Approach: Full-Screen Modal (Overlay)**

Instead of creating a new route page, a full-screen overlay is displayed on top of the current canvas page. Reasons:
- No draft persistence needed (diff is read-only, unlike merge which requires saving decisions)
- Closing returns directly to the canvas without losing context
- Simpler implementation, no new routes or stores needed

---

## 3. Data Flow

### 3.1 API Layer (Completed)

The existing `POST /v1/diff/two-way` has been adapted for V4 commits, returning:

```typescript
{
  baseId: string;
  targetId: string;
  segmentDiffs: SegmentDiff[];  // Diff type for each sentence
  threshold: number;
  stats: DiffStats;
  method: 'jaccard' | 'embedding';
}
```

Where `SegmentDiff`:
```typescript
{
  segmentId: string;       // Sentence ID
  text: string;            // Sentence text
  diffType: 'same' | 'added' | 'removed' | 'modified';
  similarity?: number;     // Similarity score (present for modified)
  matchedSegmentId?: string;  // Paired sentence ID (present for modified)
  matchedText?: string;       // Paired sentence text (present for modified)
  wordDiff?: WordDiffSegment[];  // Word-level diff segments (present for modified)
}
```

### 3.2 Additional API Requirements

**A field or endpoint is needed** to provide source context information for each sentence.

**Option A**: Extend diff API response to include full sentences (with source_ref) for both commits.

```typescript
// Add full sentence lists for both commits to the diff response
{
  ...existingFields,
  baseCommit: {
    hash: string;
    message?: string;
    branch?: string;
    sentences: Sentence[];  // Full V4 Sentence with source_ref
  },
  targetCommit: {
    hash: string;
    message?: string;
    branch?: string;
    sentences: Sentence[];
  }
}
```

The frontend can then look up each sentence's `source_ref` by `segmentId` and call the source context API.

**Option B (Chosen)**: Frontend separately calls `GET /v1/commits-v4/{hash}` to fetch both commits' sentences.

This keeps the diff API responsibility focused and avoids coupling.

### 3.3 Source Context API (Already Exists)

```
GET /v1/turns/{turn_hash}/context?before=2&after=2&highlight_start=X&highlight_end=Y
```

Returns `TurnContextData` containing conversation context with highlight positions. Directly reusable.

---

## 4. Page Layout Design

### 4.1 Overall Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER                                                          │
│  [← Back]   Base: main (sha256:abc1...)  →  Target: feat (sha2..)│
├──────────────────────────────────────────────────────────────────┤
│  STATS BAR                                                       │
│  ● 12 identical   ● 5 modified   ● 3 added   ● 2 removed        │
├────────────────────────────┬─────────────────────────────────────┤
│  BASE (Left)               │  TARGET (Right)                     │
│                            │                                     │
│  ┌─ Identical (collapsed)─┐│ ┌─ Identical (collapsed)─┐          │
│  │ sentence 1             ││ │ sentence 1             │          │
│  │ sentence 2             ││ │ sentence 2             │          │
│  └────────────────────────┘│ └────────────────────────┘          │
│                            │                                     │
│  ┌─ Modified ─────────────┐│ ┌─ Modified ─────────────┐          │
│  │ 📌 old sentence A      ││ │ 📌 new sentence A      │          │
│  │    [word diff inline]   ││ │    [word diff inline]   │          │
│  │ 📌 old sentence B      ││ │ 📌 new sentence B      │          │
│  └────────────────────────┘│ └────────────────────────┘          │
│                            │                                     │
│  ┌─ Removed ──────────────┐│                                     │
│  │ 📌 removed sentence 1  ││  (empty / placeholder)             │
│  │ 📌 removed sentence 2  ││                                     │
│  └────────────────────────┘│                                     │
│                            │ ┌─ Added ────────────────┐          │
│  (empty / placeholder)     │ │ 📌 added sentence 1    │          │
│                            │ │ 📌 added sentence 2    │          │
│                            │ └────────────────────────┘          │
├────────────────────────────┴─────────────────────────────────────┤
│  [Source Context Modal - reuses existing SourceContextModal]      │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Section Descriptions

#### Header
- Back button (closes full-screen overlay)
- Displays base commit info: branch + first 8 chars of hash + message
- Displays target commit info: same format
- Arrow indicates comparison direction

#### Stats Bar
- Four stat badges: identical (gray), modified (amber), added (green), removed (red)
- Click to jump to the corresponding section

#### Side-by-Side Main Area
- **Left column (Base)**: Base commit sentences
- **Right column (Target)**: Target commit sentences
- Four sections ordered: Identical → Modified → Removed / Added

#### Sentence Line
- 📌 icon: click to open Source Context Modal, showing original conversation context
- Sentence text: font-mono, supports word diff highlighting (modified lines)
- Modified lines: left side shows deleted words (red strikethrough), right side shows added words (green background)

#### Identical Section
- Collapsed by default, shows count only (e.g., "12 identical sentences")
- Click to expand full list
- Gray background, low contrast

#### Modified Section
- Left-right aligned display of paired sentences
- Separator between each pair
- Shows similarity score (e.g., similarity: 0.65)
- Word diff highlighting:
  - Left column: deleted words marked with `bg-red-100 line-through`
  - Right column: added words marked with `bg-green-100`

#### Removed Section (Left Column Only)
- Red background lines, right column shows empty placeholder
- Represents sentences in base commit that were deleted in target

#### Added Section (Right Column Only)
- Green background lines, left column shows empty placeholder
- Represents sentences newly added in target commit

---

## 5. Component Design

### 5.1 New Components

| Component | Responsibility |
|-----------|---------------|
| `DiffFullScreen.tsx` | Full-screen overlay container, manages diff data and state |
| `DiffSideBySide.tsx` | Left-right comparison main view, renders four sections |
| `DiffSectionHeader.tsx` | Collapsible section header (Identical / Modified / Removed / Added) |
| `DiffSentenceLine.tsx` | Single sentence line: 📌 + text + word diff |
| `DiffStatsBar.tsx` | Stats summary bar |
| `DiffHeader.tsx` | Top header: commit info + back button |
| `DiffSourceContextModal.tsx` | Standalone source context modal for diff page |

### 5.2 Reused Components

| Component | Source | Usage |
|-----------|--------|-------|
| `WordDiffDisplay` | `merge/WordDiffDisplay.tsx` | Word-level diff highlighting for modified lines |
| `Badge` | `ui/badge.tsx` | Stat labels, change type labels |
| `Dialog` | `ui/dialog.tsx` | Full-screen overlay container |
| `Button` | `ui/button.tsx` | Back button, etc. |

### 5.3 SourceContextModal Decoupling

The existing `SourceContextModal` depends on `useMergeWorkspaceStore`. The diff page has no merge store, so:

**Approach**: Create an independent `useSourceContext()` hook that extracts the context fetch logic, and a standalone `DiffSourceContextModal` component driven by this hook.

```typescript
// hooks/useSourceContext.ts
function useSourceContext() {
  const [open, setOpen] = useState(false);
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [data, setData] = useState<TurnContextData | null>(null);
  const [loading, setLoading] = useState(false);

  const openContext = async (s: Sentence) => {
    setSentence(s);
    setOpen(true);
    setLoading(true);
    // fetch turn context via API
    const ctx = await fetchTurnContext(s.source.turn_hash, { before: 2, after: 2 });
    setData(ctx);
    setLoading(false);
  };

  return { open, sentence, data, loading, openContext, close: () => setOpen(false) };
}
```

---

## 6. Data Types

### 6.1 DiffFullScreen Props

```typescript
interface DiffFullScreenProps {
  open: boolean;
  onClose: () => void;
  baseCommitHash: string;
  targetCommitHash: string;
  // Raw diff result from API (passed from NodeModal to avoid duplicate requests)
  diffData: DiffResultRaw;
}
```

### 6.2 Internal State

```typescript
// Inside DiffFullScreen
const [baseCommit, setBaseCommit] = useState<CommitV4 | null>(null);  // For source_ref lookup
const [targetCommit, setTargetCommit] = useState<CommitV4 | null>(null);
const [activeSection, setActiveSection] = useState<string | null>(null);  // Jump anchor

// Grouped from diffResult.segmentDiffs
const identical = segmentDiffs.filter(s => s.diffType === 'same');
const modified = segmentDiffs.filter(s => s.diffType === 'modified');
const removed = segmentDiffs.filter(s => s.diffType === 'removed');
const added = segmentDiffs.filter(s => s.diffType === 'added');
```

### 6.3 Word Diff Data

The V4 diff path includes `wordDiff` in the API response for modified segments. Data source: `diffCommits()` returns `CommitDiff.similar[].wordDiff` (Jaccard + LCS word-level diff, already computed by the core algorithm).

```typescript
interface SegmentDiff {
  // ...existing fields
  wordDiff?: WordDiffSegment[];  // Present for modified type
}
```

---

## 7. Implementation Steps

### Step 1: API Extension (apps/api)
- V4 diff path: add `wordDiff` field to modified `SegmentDiff` entries
- Data source: `diffCommits()` returns `CommitDiff.similar[].wordDiff`

### Step 2: Frontend Type Update (apps/web)
- Add `wordDiff` field to `DiffResultRaw`
- Export `DiffResultRaw` for use by diff components

### Step 3: Source Context Hook Extraction (apps/web)
- Extract context fetch logic from `mergeWorkspaceStore` into an independent hook
- Create standalone `DiffSourceContextModal` component, independent of merge store

### Step 4: New Diff Components (apps/web/src/components/diff/)
- `DiffFullScreen.tsx` - Full-screen container
- `DiffHeader.tsx` - Top info bar
- `DiffStatsBar.tsx` - Stats summary
- `DiffSideBySide.tsx` - Left-right comparison main view
- `DiffSectionHeader.tsx` - Collapsible section header
- `DiffSentenceLine.tsx` - Sentence line (📌 + text + word diff)
- `DiffSourceContextModal.tsx` - Standalone source context modal

### Step 5: Integration into NodeModal (apps/web)
- After "Run Diff" calculates results, show "Open Full Diff" button
- Clicking opens `DiffFullScreen` overlay
- Pass raw diff result data

### Step 6: Scroll & Interaction Details
- Stats Bar click-to-jump to corresponding section via refs
- Keyboard navigation: Escape to close (handled by Dialog component)

---

## 8. File Manifest

```
New files:
  apps/web/src/components/diff/DiffFullScreen.tsx
  apps/web/src/components/diff/DiffHeader.tsx
  apps/web/src/components/diff/DiffStatsBar.tsx
  apps/web/src/components/diff/DiffSideBySide.tsx
  apps/web/src/components/diff/DiffSectionHeader.tsx
  apps/web/src/components/diff/DiffSentenceLine.tsx
  apps/web/src/components/diff/DiffSourceContextModal.tsx
  apps/web/src/hooks/useSourceContext.ts

Modified files:
  apps/api/src/routes/diff.ts          — V4 path: add wordDiff field
  apps/web/src/lib/api.ts              — Export DiffResultRaw, add diffRaw(), add matchedText/wordDiff
  apps/web/src/components/canvas/NodeModal.tsx  — Integrate DiffFullScreen
```
