# Words-Based Diff & Merge Architecture

> Technical specification for comparing and merging semantic commits at the word level.

**Design Principle**: Storage = Sentence, Diff = Word, Merge = Three-Way

---

## Executive Summary

T3X stores meaning as **sentences** (the minimum semantic unit), displays differences at the **word** level (for human clarity), and merges branches using **three-way sentence comparison** with word-level conflict resolution.

This document specifies:
1. **Two-Way Diff** — Comparing two commits to show what changed
2. **Three-Way Merge** — Combining divergent branches with conflict detection

**Key Insight**: This architecture is sound for 50+ years because it's built on:
1. **Linguistic primitives** — sentences and words are fundamental units of language
2. **Mathematical foundations** — set theory, Jaccard similarity, LCS algorithm
3. **Proven patterns** — Git's three-way merge, unified diff format

---

## Part 1: Two-Way Diff Architecture

### Why This Will Last 50 Years

| Foundation | Why It's Timeless |
|------------|-------------------|
| **Sentence as semantic unit** | Linguistic consensus — a sentence expresses a complete thought |
| **Word as diff unit** | Atomic display element humans can process |
| **Set comparison** | Mathematical primitive — doesn't change |
| **Jaccard similarity** | 100+ years old, well-understood statistics |
| **LCS (Longest Common Subsequence)** | 50+ year algorithm, used in every diff tool |

### What Could Change (And Why It Doesn't Matter)

| Future Change | Impact |
|---------------|--------|
| Better tokenization | Swap tokenizer, algorithm unchanged |
| Semantic similarity | Add as optional filter stage, core unchanged |
| Multilingual | Word boundary rules change, algorithm unchanged |
| AI-powered diff | Add as enhancement layer, core unchanged |

**The algorithm is extraction-agnostic — just like T3X itself.**

---

## Core Principles

### Principle 1: Storage = Sentence

```
[Commit A]                    [Commit B]
├── "Budget is $3000"         ├── "Budget is $3500"
├── "Destination is Tokyo"    ├── "Destination is Tokyo"
├── "Prefer window seats"     ├── "Prefer aisle seats"
└── "Travel in spring"        ├── "Travel in spring"
                              └── "Need vegetarian meals"
```

- **Sentences are the semantic unit** — each represents a complete thought
- **Stored as arrays** — order can matter for display, not for comparison
- **Duplicates allowed** — same sentence can appear multiple times

### Principle 2: Diff = Word

For display, we show word-level changes within modified sentences:

```diff
- Budget is $3000
+ Budget is $3500
         ~~~~~ (word changed)

- Prefer window seats
+ Prefer aisle seats
        ~~~~~~ (word changed)
```

This gives humans clarity about exactly what changed.

### Principle 3: Tiered Matching

To avoid O(N²) comparisons for large commits, we use tiered matching:

```
Stage 1: Exact Match (O(N+M))
  └─► Identical sentences: skip diff entirely

Stage 2: Jaccard Filter (O(N×M) but fast)
  └─► Find candidate pairs: Jaccard ≥ 0.3

Stage 3: LCS Word Diff (O(L²) per pair)
  └─► Only for paired sentences

Stage 4: Classify Remainder
  └─► Unpaired sentences: added/removed
```

---

## Algorithm Design

### Stage Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Commit Diff Pipeline                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────┐│
│  │   Stage 1   │    │   Stage 2   │    │   Stage 3   │    │  Stage 4  ││
│  │   Exact     │───►│  Jaccard    │───►│   LCS       │───►│  Output   ││
│  │   Match     │    │   Filter    │    │   Word Diff │    │  Format   ││
│  └─────────────┘    └─────────────┘    └─────────────┘    └───────────┘│
│                                                                         │
│  Input:             Find candidates   Word-level diff    Final result: │
│  Two sentence       by similarity     for each pair      identical,    │
│  sets               threshold                            modified,     │
│                                                          added,        │
│                                                          removed       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: Exact Match

**Goal**: Quickly identify identical sentences (no diff needed).

```typescript
// O(N + M) using Set
const setA = new Set(commitA);
const setB = new Set(commitB);

const identical = commitA.filter(s => setB.has(s));
const unmatchedA = commitA.filter(s => !setB.has(s));
const unmatchedB = commitB.filter(s => !setA.has(s));
```

**Why this works**: String equality is exact and fast.

### Stage 2: Jaccard Filter

**Goal**: Find sentence pairs that are "similar enough" to word-diff.

```typescript
function jaccard(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;

  return union === 0 ? 0 : intersection / union;
}

const JACCARD_THRESHOLD = 0.3;
```

**Why 0.3?**
- Below 0.3 → sentences share so few words that diff is meaningless noise
- At 0.3 → at least 30% word overlap, indicating related content
- Above 0.5 → clearly related, diff will be informative

**Greedy Pairing**: Match highest-similarity pairs first, prevent double-matching.

### Stage 3: LCS Word Diff

**Goal**: For each paired sentence, compute word-level diff.

The LCS (Longest Common Subsequence) algorithm finds the longest sequence of words that appear in both sentences in the same order.

```typescript
function lcs(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i-1] === b[j-1]) {
        dp[i][j] = dp[i-1][j-1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
  }

  // Backtrack to find LCS
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) {
      result.unshift(a[i-1]);
      i--; j--;
    } else if (dp[i-1][j] > dp[i][j-1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}
```

**Diff Generation**: Compare original words against LCS to mark additions/removals.

### Stage 4: Output Format

```typescript
interface CommitDiff {
  identical: string[];
  modified: {
    from: string;
    to: string;
    wordDiff: WordDiffSegment[];
  }[];
  added: string[];
  removed: string[];
}

interface WordDiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}
```

---

## Examples

### Example 1: Related Commits (High Overlap)

**Commit A (Parent)**:
```
1. "Budget is $3000"
2. "Destination is Tokyo"
3. "Prefer window seats"
```

**Commit B (Child)**:
```
1. "Budget is $3500"
2. "Destination is Tokyo"
3. "Prefer aisle seats"
```

**Algorithm Trace**:

```
Stage 1 - Exact Match:
  identical: ["Destination is Tokyo"]
  unmatchedA: ["Budget is $3000", "Prefer window seats"]
  unmatchedB: ["Budget is $3500", "Prefer aisle seats"]

Stage 2 - Jaccard:
  "Budget is $3000" ↔ "Budget is $3500"
    tokens A: [Budget, is, $3000]
    tokens B: [Budget, is, $3500]
    intersection: {Budget, is} = 2
    union: {Budget, is, $3000, $3500} = 4
    jaccard: 2/4 = 0.5 ✓ (≥ 0.3)

  "Prefer window seats" ↔ "Prefer aisle seats"
    tokens A: [Prefer, window, seats]
    tokens B: [Prefer, aisle, seats]
    intersection: {Prefer, seats} = 2
    union: {Prefer, window, aisle, seats} = 4
    jaccard: 2/4 = 0.5 ✓ (≥ 0.3)

Stage 3 - LCS Word Diff:
  Pair 1: "Budget is $3000" → "Budget is $3500"
    LCS: [Budget, is]
    Diff: Budget is [-$3000-] [+$3500+]

  Pair 2: "Prefer window seats" → "Prefer aisle seats"
    LCS: [Prefer, seats]
    Diff: Prefer [-window-] [+aisle+] seats
```

**Result**:
```typescript
{
  identical: ["Destination is Tokyo"],
  modified: [
    {
      from: "Budget is $3000",
      to: "Budget is $3500",
      wordDiff: [
        { type: "unchanged", text: "Budget is" },
        { type: "removed", text: "$3000" },
        { type: "added", text: "$3500" }
      ]
    },
    {
      from: "Prefer window seats",
      to: "Prefer aisle seats",
      wordDiff: [
        { type: "unchanged", text: "Prefer" },
        { type: "removed", text: "window" },
        { type: "added", text: "aisle" },
        { type: "unchanged", text: "seats" }
      ]
    }
  ],
  added: [],
  removed: []
}
```

### Example 2: Unrelated Commits (New Topic)

**Commit A**:
```
1. "Budget is $3000"
2. "Destination is Tokyo"
```

**Commit B**:
```
1. "Meeting scheduled for Tuesday"
2. "Agenda includes Q4 review"
```

**Algorithm Trace**:

```
Stage 1 - Exact Match:
  identical: []
  unmatchedA: ["Budget is $3000", "Destination is Tokyo"]
  unmatchedB: ["Meeting scheduled for Tuesday", "Agenda includes Q4 review"]

Stage 2 - Jaccard:
  "Budget is $3000" ↔ "Meeting scheduled for Tuesday"
    tokens A: [Budget, is, $3000]
    tokens B: [Meeting, scheduled, for, Tuesday]
    intersection: {} = 0
    union: 7 words
    jaccard: 0/7 = 0.0 ✗ (< 0.3)

  (All other pairs also score 0.0 - no shared vocabulary)

Stage 3 - LCS Word Diff:
  No pairs to diff
```

**Result**:
```typescript
{
  identical: [],
  modified: [],
  added: [
    "Meeting scheduled for Tuesday",
    "Agenda includes Q4 review"
  ],
  removed: [
    "Budget is $3000",
    "Destination is Tokyo"
  ]
}
```

**Display**: No noisy word-by-word diff — just clean add/remove.

### Example 3: Partially Related (Mixed)

**Commit A**:
```
1. "Budget is $3000"
2. "Destination is Tokyo"
3. "Travel dates are flexible"
```

**Commit B**:
```
1. "Budget increased to $4000"
2. "Destination is Tokyo"
3. "Hotel must be near station"
```

**Algorithm Trace**:

```
Stage 1 - Exact Match:
  identical: ["Destination is Tokyo"]
  unmatchedA: ["Budget is $3000", "Travel dates are flexible"]
  unmatchedB: ["Budget increased to $4000", "Hotel must be near station"]

Stage 2 - Jaccard:
  "Budget is $3000" ↔ "Budget increased to $4000"
    tokens A: [Budget, is, $3000]
    tokens B: [Budget, increased, to, $4000]
    intersection: {Budget} = 1
    union: {Budget, is, $3000, increased, to, $4000} = 6
    jaccard: 1/6 = 0.167 ✗ (< 0.3)

  "Budget is $3000" ↔ "Hotel must be near station"
    jaccard: 0/8 = 0.0 ✗

  "Travel dates are flexible" ↔ "Budget increased to $4000"
    jaccard: 0/7 = 0.0 ✗

  "Travel dates are flexible" ↔ "Hotel must be near station"
    jaccard: 0/8 = 0.0 ✗

Stage 3 - LCS Word Diff:
  No pairs qualify (all below threshold)
```

**Result**:
```typescript
{
  identical: ["Destination is Tokyo"],
  modified: [],
  added: [
    "Budget increased to $4000",
    "Hotel must be near station"
  ],
  removed: [
    "Budget is $3000",
    "Travel dates are flexible"
  ]
}
```

**Note**: Even though both sentences mention "Budget", they share only 1/6 = 16.7% vocabulary. A word diff would be more noise than signal:

```
❌ Budget [-is-] [+increased to+] [-$3000-] [+$4000+]
```

Better to show as clean remove/add:
```
✓ - Budget is $3000
✓ + Budget increased to $4000
```

---

## Full Implementation

```typescript
// ============================================
// Types
// ============================================

export interface WordDiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

export interface ModifiedSentence {
  from: string;
  to: string;
  wordDiff: WordDiffSegment[];
}

export interface CommitDiff {
  identical: string[];
  modified: ModifiedSentence[];
  added: string[];
  removed: string[];
}

// ============================================
// Configuration
// ============================================

const JACCARD_THRESHOLD = 0.3;

// ============================================
// Tokenization
// ============================================

/**
 * Tokenize a sentence into words.
 * Can be swapped for language-specific tokenizers.
 */
function tokenize(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 0);
}

// ============================================
// Similarity
// ============================================

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
function jaccard(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;

  return union === 0 ? 0 : intersection / union;
}

// ============================================
// LCS Algorithm
// ============================================

/**
 * Longest Common Subsequence via dynamic programming.
 * O(m × n) time and space.
 */
function lcs(a: string[], b: string[]): string[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to reconstruct LCS
  const result: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

// ============================================
// Word Diff
// ============================================

/**
 * Generate word-level diff segments from two sentences.
 */
function wordDiff(from: string, to: string): WordDiffSegment[] {
  const wordsA = tokenize(from);
  const wordsB = tokenize(to);
  const common = lcs(wordsA, wordsB);

  const segments: WordDiffSegment[] = [];
  let ai = 0, bi = 0, ci = 0;

  while (ai < wordsA.length || bi < wordsB.length) {
    // Collect removed words (in A but not in common)
    const removed: string[] = [];
    while (ai < wordsA.length && (ci >= common.length || wordsA[ai] !== common[ci])) {
      removed.push(wordsA[ai]);
      ai++;
    }
    if (removed.length > 0) {
      segments.push({ type: 'removed', text: removed.join(' ') });
    }

    // Collect added words (in B but not in common)
    const added: string[] = [];
    while (bi < wordsB.length && (ci >= common.length || wordsB[bi] !== common[ci])) {
      added.push(wordsB[bi]);
      bi++;
    }
    if (added.length > 0) {
      segments.push({ type: 'added', text: added.join(' ') });
    }

    // Collect unchanged words (in common)
    if (ci < common.length) {
      segments.push({ type: 'unchanged', text: common[ci] });
      ai++; bi++; ci++;
    }
  }

  return segments;
}

// ============================================
// Main Diff Function
// ============================================

/**
 * Compare two commits (arrays of sentences) and produce a diff.
 */
export function diffCommits(commitA: string[], commitB: string[]): CommitDiff {
  // Stage 1: Exact match
  const setA = new Set(commitA);
  const setB = new Set(commitB);

  const identical = commitA.filter(s => setB.has(s));
  const unmatchedA = commitA.filter(s => !setB.has(s));
  const unmatchedB = commitB.filter(s => !setA.has(s));

  // Stage 2: Jaccard filter for candidate pairs
  const tokenCacheA = unmatchedA.map(s => ({
    sentence: s,
    tokens: tokenize(s)
  }));
  const tokenCacheB = unmatchedB.map(s => ({
    sentence: s,
    tokens: tokenize(s)
  }));

  const candidates: { i: number; j: number; score: number }[] = [];

  for (let i = 0; i < tokenCacheA.length; i++) {
    for (let j = 0; j < tokenCacheB.length; j++) {
      const score = jaccard(tokenCacheA[i].tokens, tokenCacheB[j].tokens);
      if (score >= JACCARD_THRESHOLD) {
        candidates.push({ i, j, score });
      }
    }
  }

  // Greedy best-match pairing
  candidates.sort((a, b) => b.score - a.score);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: [number, number][] = [];

  for (const { i, j } of candidates) {
    if (!usedA.has(i) && !usedB.has(j)) {
      pairs.push([i, j]);
      usedA.add(i);
      usedB.add(j);
    }
  }

  // Stage 3: Word diff for each pair
  const modified: ModifiedSentence[] = pairs.map(([i, j]) => ({
    from: unmatchedA[i],
    to: unmatchedB[j],
    wordDiff: wordDiff(unmatchedA[i], unmatchedB[j])
  }));

  // Stage 4: Collect unpaired as added/removed
  const added = unmatchedB.filter((_, j) => !usedB.has(j));
  const removed = unmatchedA.filter((_, i) => !usedA.has(i));

  return { identical, modified, added, removed };
}
```

---

## Complexity Analysis

### Time Complexity

| Stage | Complexity | Notes |
|-------|------------|-------|
| **Stage 1: Exact Match** | O(N + M) | Set operations |
| **Stage 2: Jaccard Filter** | O(N × M × W) | W = avg words per sentence |
| **Stage 3: LCS Word Diff** | O(P × L²) | P = pairs, L = words in sentence |
| **Stage 4: Output** | O(N + M) | Array filtering |

**Total**: O(N × M × W + P × L²)

### Space Complexity

| Component | Complexity | Notes |
|-----------|------------|-------|
| Token cache | O((N + M) × W) | Store tokenized sentences |
| Jaccard candidates | O(N × M) | Worst case: all pairs qualify |
| LCS DP table | O(L²) | Per pair, can be O(L) with optimization |

**Total**: O((N + M) × W + N × M)

### Practical Performance

| Scenario | N × M | Expected Time |
|----------|-------|---------------|
| Small commit (10 sentences) | 100 | < 1ms |
| Medium commit (50 sentences) | 2,500 | < 10ms |
| Large commit (100 sentences) | 10,000 | < 50ms |
| Very large (500 sentences) | 250,000 | < 500ms |

**Optimizations available**:
1. Early termination when Jaccard can't reach threshold
2. Use rolling hash for faster token comparison
3. Parallel pair processing for Stage 3
4. Cache LCS results for similar sentence patterns

---

## Edge Cases

### Duplicate Sentences

```typescript
commitA: ["Budget is $3000", "Budget is $3000"]
commitB: ["Budget is $3000"]
```

**Handling**: Each occurrence is matched independently. One exact match, one removed.

### Empty Commits

```typescript
commitA: []
commitB: ["New sentence"]
```

**Handling**: All sentences in B are "added", none removed.

### Very Long Sentences

For sentences with 100+ words, LCS becomes expensive (O(10000)).

**Mitigation**:
- Cap sentence length at 50 words for diff
- Show truncated diff with "..." indicator
- Full sentence shown in detail view

### Non-English Text

```typescript
commitA: ["予算は3000ドルです"]  // Japanese
commitB: ["予算は3500ドルです"]
```

**Handling**: Tokenization should be language-aware. Current implementation uses whitespace, which works for CJK if pre-segmented.

---

## Integration with T3X

### Usage in Merge Flow

```typescript
// When comparing branch commit with main commit
const diff = diffCommits(
  mainCommit.sentences,
  branchCommit.sentences
);

// Display in merge UI
// - identical: show as unchanged (gray)
// - modified: show word diff (highlight changes)
// - added: show as new (green)
// - removed: show as deleted (red)
```

### Usage in Commit History

```typescript
// Comparing parent → child commit
const diff = diffCommits(
  parentCommit.sentences,
  childCommit.sentences
);

// "What changed in this commit?"
```

### Delta Commit Model

The diff algorithm supports the delta commit workflow:

1. **New commit starts with parent's sentences** (inherited)
2. **User marks changes** (add/remove/modify)
3. **Diff shows only what changed** (not entire commit)

---

## Part 2: Three-Way Merge Architecture

### The Merge Model

When merging a branch into another (e.g., feature branch → main), we have three commits:

```
         Base (Common Ancestor)
        /                      \
   Source (Branch)         Target (Main)
        \                      /
         \                    /
          └──── Merge ───────┘
```

**The elegant insight**: Merge reuses the same Jaccard pairing from diff — just applied twice (Base→Source and Base→Target).

### Merge Algorithm

```
Merge(Base, Source, Target):

  1. Pair sentences using Jaccard matching:
     source_pairs = pair(Base, Source)
     target_pairs = pair(Base, Target)

  2. For each sentence in Base:
     source_state = lookup(source_pairs)  // same | modified(text) | removed
     target_state = lookup(target_pairs)  // same | modified(text) | removed

     Apply decision matrix (see below)

  3. Handle additions:
     - Source additions → include
     - Target additions → include
     - Same addition in both → dedupe

  4. Conflicts get word-level diff for resolution
```

### Decision Matrix

For each sentence in Base, classify its state in Source and Target:

| Source State | Target State | Result |
|--------------|--------------|--------|
| same | same | keep base |
| modified(s) | same | take source |
| same | modified(t) | take target |
| modified(s) | modified(t), s = t | take either (same change) |
| modified(s) | modified(t), s ≠ t | **CONFLICT** |
| removed | same | remove |
| same | removed | remove |
| removed | removed | remove |
| removed | modified(t) | **CONFLICT** (delete vs modify) |
| modified(s) | removed | **CONFLICT** (modify vs delete) |

### Merge Output Types

```typescript
interface MergeResult {
  // Auto-resolved sentences
  autoMerged: {
    sentence: string;
    source: 'base' | 'source' | 'target';
  }[];

  // New sentences from both branches
  additions: {
    sentence: string;
    from: 'source' | 'target' | 'both';
  }[];

  // Conflicts requiring human resolution
  conflicts: MergeConflict[];

  // Status
  status: 'clean' | 'conflicts';
}

interface MergeConflict {
  type: 'divergent_edit' | 'delete_vs_modify';
  baseSentence: string;
  sourceSentence: string | null;  // null if deleted
  targetSentence: string | null;  // null if deleted

  // Word-level diffs for UI
  baseToSourceDiff?: WordDiffSegment[];
  baseToTargetDiff?: WordDiffSegment[];
}
```

### Merge Example

**Base (Common Ancestor)**:
```
├── "Budget is $3000"
├── "Destination is Tokyo"
└── "Travel in spring"
```

**Source (Feature Branch)**:
```
├── "Budget is $3500"          ← modified ($3000 → $3500)
├── "Destination is Tokyo"     ← same
├── "Travel in spring"         ← same
└── "Prefer window seats"      ← added
```

**Target (Main)**:
```
├── "Budget is $4000"          ← modified ($3000 → $4000) — DIFFERENT!
├── "Destination is Tokyo"     ← same
└── "Need vegetarian meals"    ← added
                               ← "Travel in spring" removed
```

**Merge Process**:

```
Step 1: Pair Base → Source
  "Budget is $3000" → "Budget is $3500" (Jaccard 0.5, modified)
  "Destination is Tokyo" → "Destination is Tokyo" (exact, same)
  "Travel in spring" → "Travel in spring" (exact, same)

Step 2: Pair Base → Target
  "Budget is $3000" → "Budget is $4000" (Jaccard 0.5, modified)
  "Destination is Tokyo" → "Destination is Tokyo" (exact, same)
  "Travel in spring" → (no match, removed)

Step 3: Apply Decision Matrix

  "Budget is $3000":
    Source: modified → "Budget is $3500"
    Target: modified → "Budget is $4000"
    $3500 ≠ $4000 → CONFLICT ⚠️

  "Destination is Tokyo":
    Source: same
    Target: same
    → keep base ✓

  "Travel in spring":
    Source: same
    Target: removed
    → remove ✓

Step 4: Handle Additions
  Source added: "Prefer window seats" → include ✓
  Target added: "Need vegetarian meals" → include ✓
```

**Merge Result**:

```typescript
{
  autoMerged: [
    { sentence: "Destination is Tokyo", source: "base" }
  ],
  additions: [
    { sentence: "Prefer window seats", from: "source" },
    { sentence: "Need vegetarian meals", from: "target" }
  ],
  conflicts: [
    {
      type: "divergent_edit",
      baseSentence: "Budget is $3000",
      sourceSentence: "Budget is $3500",
      targetSentence: "Budget is $4000",
      baseToSourceDiff: [
        { type: "unchanged", text: "Budget is" },
        { type: "removed", text: "$3000" },
        { type: "added", text: "$3500" }
      ],
      baseToTargetDiff: [
        { type: "unchanged", text: "Budget is" },
        { type: "removed", text: "$3000" },
        { type: "added", text: "$4000" }
      ]
    }
  ],
  status: "conflicts"
}
```

### Conflict Resolution UI

For each conflict, show both word diffs side-by-side:

```
┌─────────────────────────────────────────────────────────────────┐
│ CONFLICT: Budget constraint                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Base:    "Budget is $3000"                                     │
│                                                                 │
│  ┌─── Source (feature-branch) ───┐  ┌─── Target (main) ───┐    │
│  │                               │  │                      │    │
│  │  Budget is [-$3000-] [+$3500+]│  │  Budget is [-$3000-] │    │
│  │                               │  │             [+$4000+]│    │
│  └───────────────────────────────┘  └──────────────────────┘    │
│                                                                 │
│  Resolution:                                                    │
│  ○ Take Source ($3500)                                         │
│  ○ Take Target ($4000)                                         │
│  ○ Keep Base ($3000)                                           │
│  ○ Custom: [____________________]                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Full Merge Implementation

```typescript
/**
 * Three-way merge using word diff's Jaccard pairing
 */
export function mergeCommits(
  base: string[],
  source: string[],
  target: string[]
): MergeResult {
  // Step 1: Pair base sentences with source and target
  const sourcePairs = pairSentences(base, source);
  const targetPairs = pairSentences(base, target);

  const autoMerged: { sentence: string; source: 'base' | 'source' | 'target' }[] = [];
  const conflicts: MergeConflict[] = [];
  const processedSource = new Set<string>();
  const processedTarget = new Set<string>();

  // Step 2: Process each base sentence
  for (const baseSentence of base) {
    const sourceMatch = sourcePairs.get(baseSentence);
    const targetMatch = targetPairs.get(baseSentence);

    const sourceState = classifyState(baseSentence, sourceMatch);
    const targetState = classifyState(baseSentence, targetMatch);

    // Track which source/target sentences we've processed
    if (sourceMatch?.matchedSentence) processedSource.add(sourceMatch.matchedSentence);
    if (targetMatch?.matchedSentence) processedTarget.add(targetMatch.matchedSentence);

    // Apply decision matrix
    if (sourceState.type === 'same' && targetState.type === 'same') {
      // Both kept unchanged → keep base
      autoMerged.push({ sentence: baseSentence, source: 'base' });
    }
    else if (sourceState.type === 'modified' && targetState.type === 'same') {
      // Only source modified → take source
      autoMerged.push({ sentence: sourceState.text!, source: 'source' });
    }
    else if (sourceState.type === 'same' && targetState.type === 'modified') {
      // Only target modified → take target
      autoMerged.push({ sentence: targetState.text!, source: 'target' });
    }
    else if (sourceState.type === 'modified' && targetState.type === 'modified') {
      if (sourceState.text === targetState.text) {
        // Both modified the same way → take either
        autoMerged.push({ sentence: sourceState.text!, source: 'source' });
      } else {
        // Divergent edit → CONFLICT
        conflicts.push({
          type: 'divergent_edit',
          baseSentence,
          sourceSentence: sourceState.text!,
          targetSentence: targetState.text!,
          baseToSourceDiff: wordDiff(baseSentence, sourceState.text!),
          baseToTargetDiff: wordDiff(baseSentence, targetState.text!),
        });
      }
    }
    else if (sourceState.type === 'removed' && targetState.type === 'same') {
      // Source removed, target kept → remove
      // (intentionally not added to autoMerged)
    }
    else if (sourceState.type === 'same' && targetState.type === 'removed') {
      // Target removed, source kept → remove
      // (intentionally not added to autoMerged)
    }
    else if (sourceState.type === 'removed' && targetState.type === 'removed') {
      // Both removed → remove
      // (intentionally not added to autoMerged)
    }
    else if (sourceState.type === 'removed' && targetState.type === 'modified') {
      // Delete vs modify → CONFLICT
      conflicts.push({
        type: 'delete_vs_modify',
        baseSentence,
        sourceSentence: null,
        targetSentence: targetState.text!,
        baseToTargetDiff: wordDiff(baseSentence, targetState.text!),
      });
    }
    else if (sourceState.type === 'modified' && targetState.type === 'removed') {
      // Modify vs delete → CONFLICT
      conflicts.push({
        type: 'delete_vs_modify',
        baseSentence,
        sourceSentence: sourceState.text!,
        targetSentence: null,
        baseToSourceDiff: wordDiff(baseSentence, sourceState.text!),
      });
    }
  }

  // Step 3: Handle additions (sentences not in base)
  const additions: { sentence: string; from: 'source' | 'target' | 'both' }[] = [];
  const sourceAdditions = source.filter(s => !processedSource.has(s) && !base.includes(s));
  const targetAdditions = target.filter(s => !processedTarget.has(s) && !base.includes(s));

  const targetAddSet = new Set(targetAdditions);
  for (const s of sourceAdditions) {
    if (targetAddSet.has(s)) {
      additions.push({ sentence: s, from: 'both' });
      targetAddSet.delete(s);
    } else {
      additions.push({ sentence: s, from: 'source' });
    }
  }
  for (const s of targetAddSet) {
    additions.push({ sentence: s, from: 'target' });
  }

  return {
    autoMerged,
    additions,
    conflicts,
    status: conflicts.length > 0 ? 'conflicts' : 'clean',
  };
}

/**
 * Pair base sentences with target sentences using Jaccard similarity
 */
function pairSentences(base: string[], target: string[]): Map<string, SentenceMatch | null> {
  const pairs = new Map<string, SentenceMatch | null>();
  const targetSet = new Set(target);
  const usedTarget = new Set<string>();

  for (const baseSentence of base) {
    // Check for exact match first
    if (targetSet.has(baseSentence)) {
      pairs.set(baseSentence, { matchedSentence: baseSentence, similarity: 1.0 });
      usedTarget.add(baseSentence);
      continue;
    }

    // Find best Jaccard match
    const baseTokens = tokenize(baseSentence);
    let bestMatch: SentenceMatch | null = null;

    for (const targetSentence of target) {
      if (usedTarget.has(targetSentence)) continue;

      const targetTokens = tokenize(targetSentence);
      const similarity = jaccard(baseTokens, targetTokens);

      if (similarity >= JACCARD_THRESHOLD) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { matchedSentence: targetSentence, similarity };
        }
      }
    }

    if (bestMatch) {
      usedTarget.add(bestMatch.matchedSentence);
    }
    pairs.set(baseSentence, bestMatch);
  }

  return pairs;
}

interface SentenceMatch {
  matchedSentence: string;
  similarity: number;
}

interface SentenceState {
  type: 'same' | 'modified' | 'removed';
  text?: string;
}

function classifyState(baseSentence: string, match: SentenceMatch | null): SentenceState {
  if (!match) {
    return { type: 'removed' };
  }
  if (match.similarity === 1.0) {
    return { type: 'same', text: match.matchedSentence };
  }
  return { type: 'modified', text: match.matchedSentence };
}
```

### Merge Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Three-Way Merge Flow                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐                                                            │
│  │  Base   │────────────────────────────────────┐                       │
│  │ Commit  │                                    │                       │
│  └────┬────┘                                    │                       │
│       │                                         │                       │
│       │ Jaccard Pair                            │ Jaccard Pair          │
│       │                                         │                       │
│       ▼                                         ▼                       │
│  ┌─────────┐                               ┌─────────┐                  │
│  │ Source  │                               │ Target  │                  │
│  │ Commit  │                               │ Commit  │                  │
│  └────┬────┘                               └────┬────┘                  │
│       │                                         │                       │
│       └──────────────┬──────────────────────────┘                       │
│                      │                                                  │
│                      ▼                                                  │
│              ┌───────────────┐                                          │
│              │   Decision    │                                          │
│              │    Matrix     │                                          │
│              └───────┬───────┘                                          │
│                      │                                                  │
│         ┌────────────┼────────────┐                                     │
│         │            │            │                                     │
│         ▼            ▼            ▼                                     │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                               │
│   │  Auto    │ │ Additions│ │ Conflicts│                               │
│   │  Merged  │ │ (dedupe) │ │          │                               │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘                               │
│        │            │            │                                      │
│        │            │            ▼                                      │
│        │            │     ┌──────────────┐                              │
│        │            │     │  Word Diff   │                              │
│        │            │     │  Both Sides  │                              │
│        │            │     └──────┬───────┘                              │
│        │            │            │                                      │
│        │            │            ▼                                      │
│        │            │     ┌──────────────┐                              │
│        │            │     │    User      │                              │
│        │            │     │   Resolves   │                              │
│        │            │     └──────┬───────┘                              │
│        │            │            │                                      │
│        └────────────┴────────────┘                                      │
│                      │                                                  │
│                      ▼                                                  │
│              ┌───────────────┐                                          │
│              │    Merge      │                                          │
│              │    Commit     │                                          │
│              └───────────────┘                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why This Merge is Elegant

| Aspect | Elegance |
|--------|----------|
| **Reuses diff infrastructure** | Same Jaccard pairing, same LCS word diff |
| **Deterministic** | No LLM or embeddings required for merge logic |
| **Minimal conflicts** | Only true divergent edits create conflicts |
| **Git-compatible semantics** | Developers already understand three-way merge |
| **Word-level resolution** | Users see exactly which words differ in conflicts |
| **Additive by default** | New sentences from both branches are included |

### Conflict Types Summary

| Conflict Type | Cause | Resolution Options |
|---------------|-------|-------------------|
| **Divergent Edit** | Both modified same sentence differently | Pick source, target, base, or custom |
| **Delete vs Modify** | One side deleted, other modified | Keep modification or confirm deletion |

---

## Future Enhancements

### Semantic Similarity (Optional Layer)

Add embedding-based similarity as a Stage 2.5:

```typescript
// If Jaccard fails but embedding similarity is high,
// the sentences might be paraphrases
if (jaccardScore < 0.3 && embeddingSimilarity > 0.8) {
  // Treat as "semantically modified" (different words, same meaning)
}
```

### Character-Level Diff

For single-word changes (e.g., "$3000" → "$3500"), show character diff:

```diff
$3[-0-][+5+]00
```

### Multilingual Tokenization

Integrate language-aware tokenizers:
- Chinese: jieba
- Japanese: MeCab
- Arabic: CAMeL Tools

---

*Architecture documented January 2025. Designed for 50-year stability.*
