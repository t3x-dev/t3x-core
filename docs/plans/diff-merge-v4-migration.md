# Diff/Merge V4 Migration - GitHub Issues

> Copy each issue section below directly into GitHub "New Issue" form.
> Total: 7 issues

---

## Issue Overview

| ID | Title | Labels | Effort | Depends On |
|----|-------|--------|--------|------------|
| **DM-GATE** | Type contracts for diff/merge V4 migration | `blocking`, `type: infrastructure` | 15-30min | - |
| DM-0 | Define DiffableSentence interface | `type: infrastructure`, `package: core` | 20min | DM-GATE |
| DM-1 | Migrate diffCommits to DiffableSentence | `type: refactor`, `package: core` | 30min | DM-0 |
| DM-2 | Migrate merge types (remove constraints) | `type: refactor`, `package: core` | 20min | DM-0 |
| DM-3 | Rewrite prepareMerge for V4 | `type: refactor`, `package: core` | 45min | DM-1, DM-2 |
| DM-4 | Rewrite executeMerge to output CommitV4 | `type: refactor`, `package: core` | 1h | DM-2, DM-3 |
| DM-5 | Update exports and cleanup V3 types | `type: cleanup`, `package: core` | 30min | DM-4 |

### Dependency Graph

```
DM-GATE (create first, blocks all)
    │
    ▼
  DM-0
  ├──► DM-1 ──┐
  │           ├──► DM-3 ──► DM-4 ──► DM-5
  └──► DM-2 ──┘
```

---

## DM-GATE: Type Contracts for Diff/Merge V4 Migration

### Title
```
refactor(core): define type contracts for diff/merge V4 migration
```

### Labels
```
priority: P0, type: infrastructure, package: core, blocking
```

### Body

```markdown
## Summary

Define and freeze all type contracts for Diff/Merge V4 migration before implementation begins. This prevents field mismatches during parallel development.

**BLOCKING** - All DM-* issues depend on this.

## Problem

DM-0 through DM-5 will modify multiple shared types:
- `DiffableSentence` (new)
- `SentencePair` (modify)
- `CommitDiff` (modify)
- `MergeSimilarPair` (modify, remove constraints)
- `MergeCandidate` (modify, remove constraints)
- `Merge2WayResult` (modify)
- `executeMerge` function signature (modify)
- `prepareMerge` function signature (modify)

Without frozen contracts, parallel work may introduce field mismatches.

## Type Contracts

### Contract 1: DiffableSentence

Location: `packages/core/src/diff/types.ts`

```typescript
/**
 * Minimal interface for diff/merge operations.
 *
 * FROZEN - Do not modify without team agreement.
 */
export interface DiffableSentence {
  /** Unique sentence identifier */
  id: string;
  /** Sentence text content */
  text: string;
}
```

### Contract 2: SentencePair

Location: `packages/core/src/diff/types.ts`

```typescript
/**
 * A pair of similar sentences with their word-level diff.
 *
 * FROZEN - Do not modify without team agreement.
 */
export interface SentencePair {
  source: DiffableSentence;
  target: DiffableSentence;
  similarity: number;
  wordDiff: WordDiffSegment[];
}
```

### Contract 3: CommitDiff

Location: `packages/core/src/diff/types.ts`

```typescript
/**
 * Result of comparing two commits.
 *
 * FROZEN - Do not modify without team agreement.
 */
export interface CommitDiff {
  identical: DiffableSentence[];
  similar: SentencePair[];
  onlyInSource: DiffableSentence[];
  onlyInTarget: DiffableSentence[];
}
```

### Contract 4: MergeSimilarPair

Location: `packages/core/src/merge/types.ts`

```typescript
/**
 * A pair of similar sentences the user must choose between.
 *
 * V4 Change: No constraint fields (constraints belong to Leaf).
 * FROZEN - Do not modify without team agreement.
 */
export interface MergeSimilarPair {
  source: DiffableSentence;
  target: DiffableSentence;
  wordDiff: WordDiffSegment[];
  resolution?: 'source' | 'target';
  // REMOVED: sourceConstraints, targetConstraints
}
```

### Contract 5: MergeCandidate

Location: `packages/core/src/merge/types.ts`

```typescript
/**
 * A unique sentence the user can keep or discard.
 *
 * V4 Change: No constraints field (constraints belong to Leaf).
 * FROZEN - Do not modify without team agreement.
 */
export interface MergeCandidate {
  sentence: DiffableSentence;
  keep: boolean;
  // REMOVED: constraints
}
```

### Contract 6: Merge2WayResult

Location: `packages/core/src/merge/types.ts`

```typescript
/**
 * Result of preparing a merge - ready for user decisions.
 *
 * FROZEN - Do not modify without team agreement.
 */
export interface Merge2WayResult {
  identical: DiffableSentence[];
  similarPairs: MergeSimilarPair[];
  onlyInSource: MergeCandidate[];
  onlyInTarget: MergeCandidate[];
}
```

### Contract 7: prepareMerge Signature

Location: `packages/core/src/merge/prepareMerge.ts`

```typescript
/**
 * Prepare a merge between two sentence arrays.
 *
 * V4 Changes:
 * - Accepts DiffableSentence[] instead of CommitContent
 * - No constraint handling
 *
 * FROZEN - Do not modify without team agreement.
 */
export function prepareMerge(
  sourceSentences: DiffableSentence[],
  targetSentences: DiffableSentence[]
): Merge2WayResult;
```

### Contract 8: executeMerge Signature

Location: `packages/core/src/merge/executeMerge.ts`

```typescript
/**
 * Execute a merge after user has made all decisions.
 *
 * V4 Changes:
 * - Returns CommitV4 (not CommitV3)
 * - Added projectId parameter
 * - No constraint handling
 *
 * FROZEN - Do not modify without team agreement.
 */
export function executeMerge(
  prepared: Merge2WayResult,
  sourceCommitHash: string,
  targetCommitHash: string,
  author: CommitAuthor,  // from types/v4
  message: string,
  projectId: string      // NEW
): CommitV4;             // Returns V4
```

## Tasks

- [ ] Review all contracts with team
- [ ] Confirm no missing fields
- [ ] Confirm no extra fields
- [ ] All developers acknowledge contracts
- [ ] Add this issue link to DM-0 through DM-5 descriptions

## Contract Change Protocol

If any contract needs modification during implementation:
1. Stop work on affected issues
2. Create a comment on this issue with proposed change
3. Wait for team acknowledgment
4. Update contract in this issue
5. All developers rebase immediately

## Acceptance Criteria

- [ ] All contracts reviewed by team
- [ ] All developers confirmed understanding
- [ ] This issue is referenced in all DM-* issues

## Blocks

- DM-0, DM-1, DM-2, DM-3, DM-4, DM-5

## Estimated Effort

15-30 minutes (review and confirm)
```

---

## DM-0: Define DiffableSentence Interface

### Title
```
refactor(core): define DiffableSentence minimal interface for diff/merge
```

### Labels
```
priority: P0, type: infrastructure, package: core
```

### Body

```markdown
## Summary

Define a minimal interface `DiffableSentence` that diff/merge algorithms actually need. This decouples the algorithms from specific Sentence type implementations (V3 or V4).

## Problem

Current diff/merge code imports `Sentence` from `types/commit.ts` (V3 type), but the algorithms only use two fields:
- `id` - for tracking sentence identity
- `text` - for similarity calculation

Other fields (`confidence`, `source`/`source_ref`) are not used by diff/merge algorithms.

## Solution

Define a minimal interface that both V3 and V4 Sentence types satisfy:

```typescript
/**
 * Minimal interface for diff/merge operations.
 *
 * Only id and text are needed for diff algorithms.
 * Both V4 Sentence and any object with these fields can be used directly.
 */
export interface DiffableSentence {
  /** Unique sentence identifier */
  id: string;
  /** Sentence text content */
  text: string;
}
```

## Tasks

- [ ] Add `DiffableSentence` interface to `packages/core/src/diff/types.ts`
- [ ] Add JSDoc comments explaining the purpose
- [ ] Export `DiffableSentence` from `packages/core/src/diff/index.ts`
- [ ] Verify `pnpm build:core` passes

## Files to Modify

| File | Action |
|------|--------|
| `packages/core/src/diff/types.ts` | ADD interface |
| `packages/core/src/diff/index.ts` | ADD export |

## Acceptance Criteria

- [ ] `DiffableSentence` interface is defined with `id` and `text` fields
- [ ] Interface is exported from `diff/index.ts`
- [ ] `pnpm build:core` passes
- [ ] No changes to existing functionality

## Estimated Effort

20 minutes

## Dependencies

- Blocked by: DM-GATE

## Blocks

- DM-1, DM-2
```

---

## DM-1: Migrate diffCommits to DiffableSentence

### Title
```
refactor(core): migrate diffCommits to use DiffableSentence
```

### Labels
```
priority: P0, type: refactor, package: core
```

### Body

```markdown
## Summary

Update `diffCommits` function and related types to use `DiffableSentence` instead of V3 `Sentence` type.

## Problem

Current implementation:
- `diffCommits.ts` imports `Sentence` from `../types/commit` (V3 type)
- `SentencePair` and `CommitDiff` types use V3 `Sentence`

This creates a dependency on V3 types that we want to eliminate.

## Tasks

### Task 1: Update types in `diff/types.ts`

Modify `SentencePair`:
```typescript
// Before
import type { Sentence } from '../types/commit';

export interface SentencePair {
  source: Sentence;
  target: Sentence;
  similarity: number;
  wordDiff: WordDiffSegment[];
}

// After
export interface SentencePair {
  source: DiffableSentence;
  target: DiffableSentence;
  similarity: number;
  wordDiff: WordDiffSegment[];
}
```

Modify `CommitDiff`:
```typescript
// Before
export interface CommitDiff {
  identical: Sentence[];
  similar: SentencePair[];
  onlyInSource: Sentence[];
  onlyInTarget: Sentence[];
}

// After
export interface CommitDiff {
  identical: DiffableSentence[];
  similar: SentencePair[];
  onlyInSource: DiffableSentence[];
  onlyInTarget: DiffableSentence[];
}
```

### Task 2: Update `diffCommits.ts`

```typescript
// Before
import type { Sentence } from '../types/commit';

export function diffCommits(source: Sentence[], target: Sentence[]): CommitDiff

// After
import type { CommitDiff, DiffableSentence, SentencePair } from './types';
// Remove: import type { Sentence } from '../types/commit';

export function diffCommits(
  source: DiffableSentence[],
  target: DiffableSentence[]
): CommitDiff
```

### Task 3: Update tests if needed

Check `__tests__/diff/wordDiff.test.ts` and other diff tests for V3 Sentence usage.

## Files to Modify

| File | Action |
|------|--------|
| `packages/core/src/diff/types.ts` | MODIFY (update SentencePair, CommitDiff) |
| `packages/core/src/diff/diffCommits.ts` | MODIFY (update imports, function signature) |
| `packages/core/src/__tests__/diff/*.test.ts` | MODIFY if needed |

## Acceptance Criteria

- [ ] `diffCommits` accepts `DiffableSentence[]` parameters
- [ ] `SentencePair` uses `DiffableSentence` for source/target
- [ ] `CommitDiff` uses `DiffableSentence` for all arrays
- [ ] No imports from `types/commit.ts` in diff module
- [ ] All existing diff tests pass
- [ ] `pnpm build:core` passes
- [ ] `pnpm test:core` passes

## Dependencies

- Blocked by: DM-0

## Estimated Effort

30 minutes
```

---

## DM-2: Migrate Merge Types (Remove Constraints)

### Title
```
refactor(core): remove constraints from merge types for V4
```

### Labels
```
priority: P0, type: refactor, package: core
```

### Body

```markdown
## Summary

Update merge type definitions to remove all constraint-related fields. In V4 architecture, constraints belong to Leaf, not Commit.

## Problem

Current merge types include constraint handling:

```typescript
// Current MergeSimilarPair
export interface MergeSimilarPair {
  source: Sentence;
  target: Sentence;
  wordDiff: WordDiffSegment[];
  resolution?: 'source' | 'target';
  sourceConstraints: Constraint[];  // ❌ Remove
  targetConstraints: Constraint[];  // ❌ Remove
}

// Current MergeCandidate
export interface MergeCandidate {
  sentence: Sentence;
  constraints: Constraint[];  // ❌ Remove
  keep: boolean;
}
```

V4 architecture: Commit = pure knowledge (sentences only), Leaf = application (owns constraints).

## Tasks

### Task 1: Rewrite `merge/types.ts`

```typescript
/**
 * Merge Type Definitions (V4)
 *
 * Types for two-way merge operations.
 *
 * Key change from V3: No constraints in merge types.
 * Constraints now belong to Leaf (application layer).
 */

import type { DiffableSentence, WordDiffSegment } from '../diff/types';

/**
 * A pair of similar sentences the user must choose between
 */
export interface MergeSimilarPair {
  /** Source sentence */
  source: DiffableSentence;
  /** Target sentence */
  target: DiffableSentence;
  /** Word-level diff between source and target */
  wordDiff: WordDiffSegment[];
  /** User's choice: 'source' or 'target' */
  resolution?: 'source' | 'target';
}

/**
 * A unique sentence the user can keep or discard
 */
export interface MergeCandidate {
  /** The sentence */
  sentence: DiffableSentence;
  /** Whether to include in merged commit (default: true) */
  keep: boolean;
}

/**
 * Result of preparing a merge - ready for user decisions
 */
export interface Merge2WayResult {
  /** Sentences identical in both - auto-kept, no user action needed */
  identical: DiffableSentence[];
  /** Similar pairs requiring user decision (pick source or target) */
  similarPairs: MergeSimilarPair[];
  /** Sentences only in source - user decides keep/discard */
  onlyInSource: MergeCandidate[];
  /** Sentences only in target - user decides keep/discard */
  onlyInTarget: MergeCandidate[];
}
```

## Files to Modify

| File | Action |
|------|--------|
| `packages/core/src/merge/types.ts` | REWRITE |

## Acceptance Criteria

- [ ] `MergeSimilarPair` has no `sourceConstraints` or `targetConstraints` fields
- [ ] `MergeCandidate` has no `constraints` field
- [ ] All types use `DiffableSentence` instead of V3 `Sentence`
- [ ] No imports from `types/commit.ts`
- [ ] `pnpm build:core` passes

## Dependencies

- Blocked by: DM-0

## Estimated Effort

20 minutes
```

---

## DM-3: Rewrite prepareMerge for V4

### Title
```
refactor(core): rewrite prepareMerge without constraint handling
```

### Labels
```
priority: P0, type: refactor, package: core
```

### Body

```markdown
## Summary

Rewrite `prepareMerge` function to:
1. Accept `DiffableSentence[]` instead of `CommitContent`
2. Remove all constraint grouping logic
3. Simplify the function significantly

## Problem

Current implementation handles constraints:

```typescript
// Current signature
function prepareMerge(source: CommitContent, target: CommitContent): Merge2WayResult

// Current implementation includes:
const sourceConstraintsBySentence = groupConstraintsBySentence(
  source.constraints ?? [],
  source.sentences
);
// ... constraint handling throughout
```

In V4, commits don't have constraints, so this logic should be removed.

## Tasks

### Task 1: Rewrite `prepareMerge.ts`

```typescript
/**
 * Prepare Merge (V4)
 *
 * Prepares a merge between two sentence arrays for user decision-making.
 *
 * Key change from V3: No constraint handling.
 * Constraints now belong to Leaf (application layer).
 */

import type { DiffableSentence } from '../diff/types';
import { diffCommits } from '../diff';
import type { Merge2WayResult, MergeCandidate, MergeSimilarPair } from './types';

/**
 * Prepare a merge between two sentence arrays
 *
 * Returns a structure ready for user decisions:
 * - identical: auto-kept, no action needed
 * - similarPairs: user must pick source or target
 * - onlyInSource/onlyInTarget: user can keep or discard (default: keep)
 *
 * @param sourceSentences - Sentences from source commit
 * @param targetSentences - Sentences from target commit
 * @returns Merge2WayResult ready for user decisions
 *
 * @example
 * const source = [{ id: 's1', text: 'Budget is $3000' }];
 * const target = [{ id: 't1', text: 'Budget is $3500' }];
 *
 * const result = prepareMerge(source, target);
 * // result.similarPairs[0] contains both sentences
 * // User sets resolution to 'source' or 'target'
 */
export function prepareMerge(
  sourceSentences: DiffableSentence[],
  targetSentences: DiffableSentence[]
): Merge2WayResult {
  // Run diff algorithm
  const diff = diffCommits(sourceSentences, targetSentences);

  // Map diff results to merge format
  const similarPairs: MergeSimilarPair[] = diff.similar.map((pair) => ({
    source: pair.source,
    target: pair.target,
    wordDiff: pair.wordDiff,
    resolution: undefined, // User must decide
  }));

  const onlyInSource: MergeCandidate[] = diff.onlyInSource.map((s) => ({
    sentence: s,
    keep: true, // Default to keep
  }));

  const onlyInTarget: MergeCandidate[] = diff.onlyInTarget.map((s) => ({
    sentence: s,
    keep: true, // Default to keep
  }));

  return {
    identical: diff.identical,
    similarPairs,
    onlyInSource,
    onlyInTarget,
  };
}
```

### Task 2: Remove `groupConstraintsBySentence` function

Delete the entire `groupConstraintsBySentence` function from the file.

### Task 3: Update `merge/index.ts`

```typescript
// Before
export { executeMerge } from './executeMerge';
export { groupConstraintsBySentence, prepareMerge } from './prepareMerge';

// After
export { executeMerge } from './executeMerge';
export { prepareMerge } from './prepareMerge';
// Remove: groupConstraintsBySentence
```

## Files to Modify

| File | Action |
|------|--------|
| `packages/core/src/merge/prepareMerge.ts` | REWRITE |
| `packages/core/src/merge/index.ts` | MODIFY (remove export) |

## Acceptance Criteria

- [ ] `prepareMerge` accepts `(DiffableSentence[], DiffableSentence[])` parameters
- [ ] `groupConstraintsBySentence` function is deleted
- [ ] `groupConstraintsBySentence` export is removed from index.ts
- [ ] No imports from `types/commit.ts`
- [ ] No constraint handling logic remains
- [ ] `pnpm build:core` passes

## Dependencies

- Blocked by: DM-1, DM-2

## Estimated Effort

45 minutes
```

---

## DM-4: Rewrite executeMerge to Output CommitV4

### Title
```
refactor(core): rewrite executeMerge to output CommitV4
```

### Labels
```
priority: P0, type: refactor, package: core
```

### Body

```markdown
## Summary

Rewrite `executeMerge` function to:
1. Output `CommitV4` instead of `CommitV3`
2. Remove all constraint handling logic
3. Remove V3 conversion functions
4. Generate V4-style sentence IDs (`s_` prefix)
5. Add `projectId` parameter

## Problem

Current implementation:
- Outputs `CommitV3` with `schema: 'commit/v3'`
- Handles constraints (adds to merged commit)
- Has `convertSentenceToV3` and `convertConstraintToV3` helper functions
- Generates legacy IDs (`m1`, `mc1`)

## Tasks

### Task 1: Rewrite `executeMerge.ts`

```typescript
/**
 * Execute Merge (V4)
 *
 * Executes a merge after user has made all decisions.
 * Creates a new CommitV4 with 2 parents.
 *
 * Key changes from V3:
 * - Outputs CommitV4 (no constraints in content)
 * - Generates V4 sentence IDs (s_ prefix)
 * - Removed all constraint handling
 */

import { nanoid } from 'nanoid';
import type { DiffableSentence } from '../diff/types';
import { computeCommitV4Hash } from '../storage/hash-v4';
import type { CommitAuthor, CommitV4, Sentence, ID_PREFIXES } from '../types/v4';
import type { Merge2WayResult } from './types';

/**
 * Execute a merge after user has made all decisions
 *
 * Creates a new CommitV4 with:
 * - parents: [sourceHash, targetHash]
 * - content.sentences: merged sentences with new V4 IDs
 *
 * @param prepared - The prepared merge result with user decisions
 * @param sourceCommitHash - Hash of the source commit
 * @param targetCommitHash - Hash of the target commit
 * @param author - Author information
 * @param message - Commit message
 * @param projectId - Project ID
 * @returns CommitV4 with merged content
 *
 * @throws Error if any similarPair has no resolution
 *
 * @example
 * // After user resolves all pairs:
 * prepared.similarPairs[0].resolution = 'target';
 * prepared.onlyInSource[0].keep = false;
 *
 * const merged = executeMerge(
 *   prepared,
 *   'sha256:source123',
 *   'sha256:target456',
 *   { type: 'human', name: 'Alice' },
 *   'Merge feature-branch into main',
 *   'proj_abc123'
 * );
 */
export function executeMerge(
  prepared: Merge2WayResult,
  sourceCommitHash: string,
  targetCommitHash: string,
  author: CommitAuthor,
  message: string,
  projectId: string
): CommitV4 {
  const sentences: Sentence[] = [];

  // Helper to add a sentence with new V4 ID
  const addSentence = (s: DiffableSentence) => {
    const newId = `${ID_PREFIXES.sentence}${nanoid(12)}`;
    sentences.push({
      id: newId,
      text: s.text,
      // Note: source_ref is not inherited from old sentence
      // This is a new merged commit
    });
  };

  // 1. Add identical sentences
  for (const s of prepared.identical) {
    addSentence(s);
  }

  // 2. Add resolved similar pairs
  for (const pair of prepared.similarPairs) {
    if (!pair.resolution) {
      throw new Error(
        `Unresolved similar pair: "${pair.source.text}" vs "${pair.target.text}"`
      );
    }

    if (pair.resolution === 'source') {
      addSentence(pair.source);
    } else {
      addSentence(pair.target);
    }
  }

  // 3. Add kept sentences from source-only
  for (const candidate of prepared.onlyInSource) {
    if (candidate.keep) {
      addSentence(candidate.sentence);
    }
  }

  // 4. Add kept sentences from target-only
  for (const candidate of prepared.onlyInTarget) {
    if (candidate.keep) {
      addSentence(candidate.sentence);
    }
  }

  const committedAt = new Date().toISOString();

  // Build first-class fields for hash computation
  const firstClassFields = {
    schema: 't3x/commit/v4' as const,
    parents: [sourceCommitHash, targetCommitHash],
    author,
    committed_at: committedAt,
    content: { sentences },
  };

  const hash = computeCommitV4Hash(firstClassFields);

  // Build full CommitV4
  const commit: CommitV4 = {
    ...firstClassFields,
    hash,
    project_id: projectId,
    message,
    // Note: branch should be set by caller based on merge target
  };

  return commit;
}
```

### Task 2: Delete helper functions

Remove these functions from the file:
- `convertSentenceToV3`
- `convertConstraintToV3`

### Task 3: Check nanoid dependency

```bash
# Verify nanoid is available in @t3x/core
grep "nanoid" packages/core/package.json
```

If not present, add it:
```bash
cd packages/core && pnpm add nanoid
```

## Files to Modify

| File | Action |
|------|--------|
| `packages/core/src/merge/executeMerge.ts` | REWRITE |
| `packages/core/package.json` | MODIFY (add nanoid if needed) |

## Signature Change

```typescript
// Before
function executeMerge(
  prepared: Merge2WayResult,
  sourceCommitHash: string,
  targetCommitHash: string,
  author: CommitAuthor,
  message: string
): CommitV3

// After
function executeMerge(
  prepared: Merge2WayResult,
  sourceCommitHash: string,
  targetCommitHash: string,
  author: CommitAuthor,
  message: string,
  projectId: string  // NEW parameter
): CommitV4
```

## Acceptance Criteria

- [ ] `executeMerge` returns `CommitV4` type
- [ ] Output commit has `schema: 't3x/commit/v4'`
- [ ] Sentence IDs use `s_` prefix (V4 format)
- [ ] Commit hash uses `computeCommitV4Hash`
- [ ] No `content.constraints` field in output
- [ ] `projectId` parameter is required
- [ ] `convertSentenceToV3` and `convertConstraintToV3` are deleted
- [ ] No imports from `types/commit.ts` or `types/commit-v3.ts`
- [ ] `pnpm build:core` passes

## Dependencies

- Blocked by: DM-2, DM-3

## Estimated Effort

1 hour
```

---

## DM-5: Update Exports and Cleanup V3 Types

### Title
```
refactor(core): update exports and cleanup V3 type files
```

### Labels
```
priority: P0, type: cleanup, package: core
```

### Body

```markdown
## Summary

Final cleanup tasks:
1. Update `packages/core/src/index.ts` exports
2. Check and remove unused V3 type files
3. Update merge tests to use new types
4. Verify no remaining V3 dependencies in diff/merge

## Tasks

### Task 1: Check V3 type file references

Run these commands to find remaining references:

```bash
# Check types/commit.ts references
grep -r "from.*['\"].*types/commit['\"]" packages/core/src --include="*.ts" | grep -v ".test.ts" | grep -v "types/commit-v3"

# Check types/commit-v3.ts references
grep -r "from.*['\"].*types/commit-v3['\"]" packages/core/src --include="*.ts" | grep -v ".test.ts"

# Check groupConstraintsBySentence usage
grep -r "groupConstraintsBySentence" packages/ apps/ --include="*.ts"
```

### Task 2: Update `packages/core/src/index.ts`

```typescript
// Remove from exports (if no external dependencies):
// - groupConstraintsBySentence

// Add to exports:
export { type DiffableSentence } from './diff';

// Keep V4 exports as-is
// Keep other exports as-is
```

### Task 3: Evaluate V3 type files

| File | Condition | Action |
|------|-----------|--------|
| `types/commit.ts` | No remaining references | DELETE |
| `types/commit-v3.ts` | No remaining references | DELETE |
| `types/index.ts` | Only exports V3 types | DELETE or UPDATE |

If files have external references (from storage, api, etc.), keep them but add deprecation notice:

```typescript
/**
 * @deprecated Use types from './v4' instead. Will be removed in next major version.
 */
```

### Task 4: Rewrite merge tests

Create new test file `__tests__/merge/prepareMerge.test.ts`:

```typescript
import { describe, expect, test, vi } from 'vitest';
import type { DiffableSentence } from '../../diff/types';
import type { CommitAuthor } from '../../types/v4';
import { executeMerge, prepareMerge } from '../../merge';

// Test helpers
const createSentence = (id: string, text: string): DiffableSentence => ({
  id,
  text,
});

const author: CommitAuthor = {
  type: 'human',
  name: 'Test User',
  id: 'test@example.com',
};

const projectId = 'proj_test123';

// ============================================================================
// prepareMerge Tests
// ============================================================================

describe('prepareMerge', () => {
  test('identifies similar pairs', () => {
    const source = [createSentence('s1', 'Budget is $3000')];
    const target = [createSentence('t1', 'Budget is $3500')];

    const result = prepareMerge(source, target);

    expect(result.similarPairs).toHaveLength(1);
    expect(result.similarPairs[0].source.text).toBe('Budget is $3000');
    expect(result.similarPairs[0].target.text).toBe('Budget is $3500');
    expect(result.similarPairs[0].resolution).toBeUndefined();
  });

  test('defaults unique sentences to keep: true', () => {
    const source = [createSentence('s1', 'The quick brown fox jumps over the lazy dog')];
    const target = [createSentence('t1', 'Lorem ipsum dolor sit amet consectetur')];

    const result = prepareMerge(source, target);

    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInSource[0].keep).toBe(true);
    expect(result.onlyInTarget).toHaveLength(1);
    expect(result.onlyInTarget[0].keep).toBe(true);
  });

  test('identifies identical sentences', () => {
    const source = [createSentence('s1', 'Same text in both')];
    const target = [createSentence('t1', 'Same text in both')];

    const result = prepareMerge(source, target);

    expect(result.identical).toHaveLength(1);
    expect(result.identical[0].text).toBe('Same text in both');
    expect(result.similarPairs).toHaveLength(0);
  });

  test('handles empty inputs', () => {
    const result = prepareMerge([], []);

    expect(result.identical).toHaveLength(0);
    expect(result.similarPairs).toHaveLength(0);
    expect(result.onlyInSource).toHaveLength(0);
    expect(result.onlyInTarget).toHaveLength(0);
  });

  test('has no constraint-related fields', () => {
    const source = [createSentence('s1', 'Budget is $3000')];
    const target = [createSentence('t1', 'Budget is $3500')];

    const result = prepareMerge(source, target);

    // Verify no constraint fields exist
    expect((result.similarPairs[0] as any).sourceConstraints).toBeUndefined();
    expect((result.similarPairs[0] as any).targetConstraints).toBeUndefined();
  });
});

// ============================================================================
// executeMerge Tests
// ============================================================================

describe('executeMerge', () => {
  test('creates CommitV4 with 2 parents', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(
      prepared,
      'sha256:aaa',
      'sha256:bbb',
      author,
      'Merge',
      projectId
    );

    expect(result.parents).toEqual(['sha256:aaa', 'sha256:bbb']);
    expect(result.schema).toBe('t3x/commit/v4');
    expect(result.hash).toMatch(/^sha256:/);
    expect(result.project_id).toBe(projectId);
  });

  test('throws on unresolved similar pair', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Source text'),
          target: createSentence('t1', 'Target text'),
          wordDiff: [],
          resolution: undefined,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    expect(() =>
      executeMerge(prepared, 'a', 'b', author, 'Merge', projectId)
    ).toThrow('Unresolved similar pair');
  });

  test('includes source sentence when resolution is source', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Budget is $3000'),
          target: createSentence('t1', 'Budget is $3500'),
          wordDiff: [],
          resolution: 'source' as const,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences[0].text).toBe('Budget is $3000');
  });

  test('includes target sentence when resolution is target', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Budget is $3000'),
          target: createSentence('t1', 'Budget is $3500'),
          wordDiff: [],
          resolution: 'target' as const,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences[0].text).toBe('Budget is $3500');
  });

  test('excludes sentences with keep: false', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        {
          sentence: createSentence('s1', 'Discard me'),
          keep: false,
        },
      ],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences).toHaveLength(0);
  });

  test('includes sentences with keep: true', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        {
          sentence: createSentence('s1', 'Keep me'),
          keep: true,
        },
      ],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences).toHaveLength(1);
    expect(result.content.sentences[0].text).toBe('Keep me');
  });

  test('generates new sentence IDs with s_ prefix', () => {
    const prepared = {
      identical: [createSentence('old-id-1', 'Keep me')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences[0].id).toMatch(/^s_/);
    expect(result.content.sentences[0].id).not.toBe('old-id-1');
  });

  test('includes identical sentences in merged content', () => {
    const prepared = {
      identical: [
        createSentence('s1', 'Identical 1'),
        createSentence('s2', 'Identical 2'),
      ],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences).toHaveLength(2);
    expect(result.content.sentences[0].text).toBe('Identical 1');
    expect(result.content.sentences[1].text).toBe('Identical 2');
  });

  test('sets message and author correctly', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(
      prepared,
      'a',
      'b',
      author,
      'Merge feature into main',
      projectId
    );

    expect(result.message).toBe('Merge feature into main');
    expect(result.author).toEqual(author);
  });

  test('content has no constraints field', () => {
    const prepared = {
      identical: [createSentence('s1', 'Test')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    // V4 content only has sentences, no constraints
    expect(result.content).toEqual({
      sentences: expect.any(Array),
    });
    expect((result.content as any).constraints).toBeUndefined();
  });
});
```

### Task 5: Final verification

```bash
# Build
pnpm build:core

# Test
pnpm test:core

# Full build (ensure no breakage in other packages)
pnpm build
```

## Files to Modify

| File | Action |
|------|--------|
| `packages/core/src/index.ts` | MODIFY (update exports) |
| `packages/core/src/types/commit.ts` | DELETE (if no references) |
| `packages/core/src/types/commit-v3.ts` | DELETE (if no references) |
| `packages/core/src/types/index.ts` | DELETE or MODIFY |
| `packages/core/src/__tests__/merge/prepareMerge.test.ts` | REWRITE |

## Acceptance Criteria

- [ ] `DiffableSentence` is exported from `@t3x/core`
- [ ] `groupConstraintsBySentence` is NOT exported
- [ ] No diff/merge code imports from `types/commit.ts`
- [ ] No diff/merge code imports from `types/commit-v3.ts`
- [ ] All merge tests use new types and pass
- [ ] `pnpm build:core` passes
- [ ] `pnpm test:core` passes
- [ ] `pnpm build` (full) passes

## Dependencies

- Blocked by: DM-4

## Estimated Effort

30 minutes
```

---

## Quick Reference

### Issue Creation Order

1. **DM-GATE** (create first, blocks all - type contracts)
2. **DM-0** (after DM-GATE, define DiffableSentence)
3. **DM-1**, **DM-2** (can create in parallel after DM-0)
4. **DM-3** (after DM-1 and DM-2)
5. **DM-4** (after DM-3)
6. **DM-5** (after DM-4, final cleanup)

### Labels to Create

```
priority: P0
type: infrastructure
type: refactor
type: cleanup
package: core
blocking
```

### Branch Strategy

```
main
 └── feat/v4-diff-merge-migration
      ├── DM-GATE (review contracts)
      ├── DM-0 commit
      ├── DM-1 commit
      ├── DM-2 commit
      ├── DM-3 commit
      ├── DM-4 commit
      └── DM-5 commit
```

### Total Estimated Effort

| Issue | Effort |
|-------|--------|
| DM-GATE | 15-30 min |
| DM-0 | 20 min |
| DM-1 | 30 min |
| DM-2 | 20 min |
| DM-3 | 45 min |
| DM-4 | 1 hour |
| DM-5 | 30 min |
| **Total** | **~4 hours** |

---

*Document Version: 2.1*
*Last Updated: 2026-01-26*
