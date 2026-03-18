/**
 * Three-Way Merge Algorithm
 *
 * Uses a common ancestor (base) to determine which side made changes,
 * enabling automatic resolution of non-conflicting edits.
 *
 * Algorithm overview:
 * 1. Diff base↔source to find what source changed
 * 2. Diff base↔target to find what target changed
 * 3. Apply decision matrix:
 *    - Unchanged in both → unchanged
 *    - Changed in one side only → autoMerged
 *    - Changed in both to same text → autoMerged
 *    - Changed in both to different text → conflict (divergent_edit)
 *    - Deleted in one, modified in other → conflict (delete_vs_modify)
 * 4. Collect additions from both sides (deduplicate identical)
 * 5. Generate word diffs for conflicts
 */

import { sha256 } from '../common/hash';
import { diffCommits } from '../diff/diffCommits';
import { wordDiff } from '../diff/lcs';
import type { DiffableSentence, WordDiffSegment } from '../diff/types';
import {
  type CommitAuthor,
  type SentenceCommit,
  ID_PREFIXES,
  type Sentence as SentenceV4,
} from '../types/v4';

// ============================================================================
// Types
// ============================================================================

/**
 * A conflict detected during three-way merge.
 *
 * Two types of conflicts:
 * - divergent_edit: both sides modified the same base sentence differently
 * - delete_vs_modify: one side deleted while the other modified
 */
export interface ThreeWayConflict {
  /** Type of conflict */
  type: 'divergent_edit' | 'delete_vs_modify';
  /** The original base sentence */
  base: DiffableSentence;
  /** Source version (null if deleted in source) */
  source: DiffableSentence | null;
  /** Target version (null if deleted in target) */
  target: DiffableSentence | null;
  /** Word diff: base → source */
  baseToSourceDiff?: WordDiffSegment[];
  /** Word diff: base → target */
  baseToTargetDiff?: WordDiffSegment[];
  /** User's resolution choice */
  resolution?: 'source' | 'target' | 'both' | 'edit';
  /** Custom text when resolution is 'edit' */
  editedText?: string;
}

/**
 * Result of a three-way merge preparation.
 *
 * Categorizes all sentences into:
 * - unchanged: same in both branches (from base)
 * - autoMerged: changed by one side only, auto-resolved
 * - additions: new sentences not in base
 * - conflicts: require user resolution
 */
export interface ThreeWayMergeResult {
  /** Sentences unchanged in both branches (from base) */
  unchanged: DiffableSentence[];
  /** Sentences changed by one side only (auto-resolved) */
  autoMerged: Array<{
    sentence: DiffableSentence;
    from: 'source' | 'target';
    /** Original base sentence that was modified */
    baseSentence?: DiffableSentence;
  }>;
  /** New sentences added by one side (not in base) */
  additions: Array<{
    sentence: DiffableSentence;
    from: 'source' | 'target';
  }>;
  /** Conflicts requiring user resolution */
  conflicts: ThreeWayConflict[];
  /** Whether merge can auto-complete (no conflicts) */
  status: 'clean' | 'conflicts';
}

// ============================================================================
// Core Algorithm
// ============================================================================

/**
 * Prepare a three-way merge using a common ancestor (base).
 *
 * Uses the existing diffCommits algorithm to compute base↔source and base↔target
 * diffs, then applies a decision matrix to categorize each sentence.
 *
 * @param base - Sentences from the common ancestor commit
 * @param source - Sentences from the source branch
 * @param target - Sentences from the target branch
 * @returns ThreeWayMergeResult with categorized sentences
 *
 * @example
 * const base = [{ id: 'b1', text: 'Budget is $3000' }];
 * const source = [{ id: 's1', text: 'Budget is $3500' }];
 * const target = [{ id: 't1', text: 'Budget is $3000' }];
 *
 * const result = prepareThreeWayMerge(base, source, target);
 * // result.autoMerged[0].sentence.text === 'Budget is $3500' (from source)
 * // result.status === 'clean'
 */
export function prepareThreeWayMerge(
  base: DiffableSentence[],
  source: DiffableSentence[],
  target: DiffableSentence[]
): ThreeWayMergeResult {
  // Step 1: Diff base↔source
  const baseToSource = diffCommits(base, source);

  // Step 2: Diff base↔target
  const baseToTarget = diffCommits(base, target);

  // Build lookup structures for base sentence status in each diff
  // For base↔source diff:
  //   - identical: base sentences unchanged in source
  //   - similar: base sentences modified in source (paired)
  //   - onlyInSource (from base perspective): base sentences MISSING in source = deleted in source
  //   - onlyInTarget (target=source): sentences only in source = added in source
  //
  // Note: diffCommits(base, source) treats base as "source" and source as "target"
  // So the result categories are:
  //   identical = base sentences found identically in source
  //   similar[i].source = base sentence, similar[i].target = source sentence
  //   onlyInSource = base sentences not found in source (deleted in source branch)
  //   onlyInTarget = source sentences not found in base (added in source branch)

  // Map base sentence IDs to their status in source branch
  const baseIdenticalInSource = new Set<string>();
  for (const s of baseToSource.identical) {
    baseIdenticalInSource.add(s.id);
  }

  // Base sentences modified in source: baseId → source version
  const baseModifiedInSource = new Map<string, DiffableSentence>();
  for (const pair of baseToSource.similar) {
    baseModifiedInSource.set(pair.source.id, pair.target);
  }

  // Base sentences deleted in source
  const baseDeletedInSource = new Set<string>();
  for (const s of baseToSource.onlyInSource) {
    baseDeletedInSource.add(s.id);
  }

  // Sentences added in source (not in base)
  const addedInSource = baseToSource.onlyInTarget;

  // Map base sentence IDs to their status in target branch
  const baseIdenticalInTarget = new Set<string>();
  for (const s of baseToTarget.identical) {
    baseIdenticalInTarget.add(s.id);
  }

  // Base sentences modified in target: baseId → target version
  const baseModifiedInTarget = new Map<string, DiffableSentence>();
  for (const pair of baseToTarget.similar) {
    baseModifiedInTarget.set(pair.source.id, pair.target);
  }

  // Base sentences deleted in target
  const baseDeletedInTarget = new Set<string>();
  for (const s of baseToTarget.onlyInSource) {
    baseDeletedInTarget.add(s.id);
  }

  // Sentences added in target (not in base)
  const addedInTarget = baseToTarget.onlyInTarget;

  // Step 3: Decision matrix for each base sentence
  const unchanged: DiffableSentence[] = [];
  const autoMerged: ThreeWayMergeResult['autoMerged'] = [];
  const conflicts: ThreeWayConflict[] = [];

  for (const baseSentence of base) {
    const id = baseSentence.id;

    const identicalInSource = baseIdenticalInSource.has(id);
    const identicalInTarget = baseIdenticalInTarget.has(id);
    const modifiedInSource = baseModifiedInSource.has(id);
    const modifiedInTarget = baseModifiedInTarget.has(id);
    const deletedInSource = baseDeletedInSource.has(id);
    const deletedInTarget = baseDeletedInTarget.has(id);

    // Case 1: Unchanged in both → unchanged
    if (identicalInSource && identicalInTarget) {
      unchanged.push(baseSentence);
      continue;
    }

    // Case 2: Modified in source only (identical or absent in target doesn't change source)
    if (modifiedInSource && identicalInTarget) {
      const sourceSentence = baseModifiedInSource.get(id)!;
      autoMerged.push({
        sentence: sourceSentence,
        from: 'source',
        baseSentence,
      });
      continue;
    }

    // Case 3: Modified in target only (identical in source)
    if (identicalInSource && modifiedInTarget) {
      const targetSentence = baseModifiedInTarget.get(id)!;
      autoMerged.push({
        sentence: targetSentence,
        from: 'target',
        baseSentence,
      });
      continue;
    }

    // Case 4: Deleted in source only (identical in target)
    if (deletedInSource && identicalInTarget) {
      // Auto-resolve: remove (source deleted it, target didn't touch it)
      // We don't add to any result — the sentence is simply removed
      continue;
    }

    // Case 5: Deleted in target only (identical in source)
    if (identicalInSource && deletedInTarget) {
      // Auto-resolve: remove (target deleted it, source didn't touch it)
      continue;
    }

    // Case 6: Modified in both
    if (modifiedInSource && modifiedInTarget) {
      const sourceSentence = baseModifiedInSource.get(id)!;
      const targetSentence = baseModifiedInTarget.get(id)!;

      // Check if they modified to the same text → auto-resolve
      if (sourceSentence.text === targetSentence.text) {
        autoMerged.push({
          sentence: sourceSentence,
          from: 'source', // Arbitrary: both are the same
          baseSentence,
        });
      } else {
        // Divergent edit → conflict
        conflicts.push({
          type: 'divergent_edit',
          base: baseSentence,
          source: sourceSentence,
          target: targetSentence,
          baseToSourceDiff: wordDiff(baseSentence.text, sourceSentence.text),
          baseToTargetDiff: wordDiff(baseSentence.text, targetSentence.text),
        });
      }
      continue;
    }

    // Case 7: Deleted in source, modified in target → conflict
    if (deletedInSource && modifiedInTarget) {
      const targetSentence = baseModifiedInTarget.get(id)!;
      conflicts.push({
        type: 'delete_vs_modify',
        base: baseSentence,
        source: null,
        target: targetSentence,
        baseToTargetDiff: wordDiff(baseSentence.text, targetSentence.text),
      });
      continue;
    }

    // Case 8: Modified in source, deleted in target → conflict
    if (modifiedInSource && deletedInTarget) {
      const sourceSentence = baseModifiedInSource.get(id)!;
      conflicts.push({
        type: 'delete_vs_modify',
        base: baseSentence,
        source: sourceSentence,
        target: null,
        baseToSourceDiff: wordDiff(baseSentence.text, sourceSentence.text),
      });
      continue;
    }

    // Case 9: Deleted in both → just remove (not a conflict)
    if (deletedInSource && deletedInTarget) {
      continue;
    }

    // Fallback: shouldn't happen, but treat as unchanged for safety.
    unchanged.push(baseSentence);
  }

  // Step 4: Collect additions from both sides
  const additions: ThreeWayMergeResult['additions'] = [];
  const addedTexts = new Set<string>();

  // Add from source
  for (const s of addedInSource) {
    additions.push({ sentence: s, from: 'source' });
    addedTexts.add(s.text);
  }

  // Add from target, deduplicating identical text additions
  for (const s of addedInTarget) {
    if (!addedTexts.has(s.text)) {
      additions.push({ sentence: s, from: 'target' });
      addedTexts.add(s.text);
    }
  }

  return {
    unchanged,
    autoMerged,
    additions,
    conflicts,
    status: conflicts.length > 0 ? 'conflicts' : 'clean',
  };
}

// ============================================================================
// Execute Three-Way Merge
// ============================================================================

/**
 * Execute a three-way merge after all conflicts have been resolved.
 *
 * Takes a ThreeWayMergeResult with resolved conflicts and produces
 * a final SentenceCommit with deterministic sentence IDs.
 *
 * @param result - The three-way merge result with all conflicts resolved
 * @param sourceCommitHash - Hash of the source commit
 * @param targetCommitHash - Hash of the target commit
 * @param author - Author of the merge commit
 * @param message - Merge commit message
 * @param projectId - Project ID
 * @param committedAt - Optional fixed timestamp (for deterministic tests)
 * @returns SentenceCommit with merged content
 *
 * @throws Error if any conflict is unresolved
 * @throws Error if a conflict with resolution 'edit' has no editedText
 *
 * @example
 * const result = prepareThreeWayMerge(base, source, target);
 * result.conflicts[0].resolution = 'source';
 * const commit = executeThreeWayMerge(
 *   result, 'sha256:src', 'sha256:tgt',
 *   { type: 'human', name: 'Alice' },
 *   'Merge feature into main', 'proj_123'
 * );
 */
export function executeThreeWayMerge(
  result: ThreeWayMergeResult,
  sourceCommitHash: string,
  targetCommitHash: string,
  author: CommitAuthor,
  message: string,
  projectId: string,
  committedAt?: string
): SentenceCommit {
  // Validate: all conflicts must be resolved
  for (const conflict of result.conflicts) {
    if (!conflict.resolution) {
      const baseText = conflict.base.text;
      throw new Error(`Unresolved conflict for base sentence: "${baseText}"`);
    }
    if (conflict.resolution === 'edit' && !conflict.editedText) {
      throw new Error(
        `Conflict resolved as 'edit' but no editedText provided for: "${conflict.base.text}"`
      );
    }
  }

  // Collect all sentences with position info for ordering
  const collected: Array<{
    sentence: DiffableSentence;
    sortPosition: number;
    insertionOrder: number;
  }> = [];
  let insertionCounter = 0;

  const getPosition = (s: DiffableSentence): number => s.position ?? Number.POSITIVE_INFINITY;

  // 1. Unchanged sentences (use base position)
  for (const s of result.unchanged) {
    collected.push({
      sentence: s,
      sortPosition: getPosition(s),
      insertionOrder: insertionCounter++,
    });
  }

  // 2. Auto-merged sentences (use the modified sentence's position)
  for (const item of result.autoMerged) {
    collected.push({
      sentence: item.sentence,
      sortPosition: getPosition(item.baseSentence ?? item.sentence),
      insertionOrder: insertionCounter++,
    });
  }

  // 3. Resolved conflicts
  for (const conflict of result.conflicts) {
    const basePosition = getPosition(conflict.base);

    switch (conflict.resolution) {
      case 'source':
        if (conflict.source) {
          collected.push({
            sentence: conflict.source,
            sortPosition: basePosition,
            insertionOrder: insertionCounter++,
          });
        }
        break;
      case 'target':
        if (conflict.target) {
          collected.push({
            sentence: conflict.target,
            sortPosition: basePosition,
            insertionOrder: insertionCounter++,
          });
        }
        break;
      case 'both': {
        // Keep both: source first, then target
        if (conflict.source) {
          collected.push({
            sentence: conflict.source,
            sortPosition: basePosition,
            insertionOrder: insertionCounter++,
          });
        }
        if (conflict.target) {
          collected.push({
            sentence: conflict.target,
            sortPosition: basePosition + 0.1,
            insertionOrder: insertionCounter++,
          });
        }
        break;
      }
      case 'edit': {
        // User-edited text: create a new sentence based on base
        const editedSentence: DiffableSentence = {
          id: conflict.base.id,
          text: conflict.editedText!,
          source_ref: conflict.base.source_ref,
          position: conflict.base.position,
        };
        collected.push({
          sentence: editedSentence,
          sortPosition: basePosition,
          insertionOrder: insertionCounter++,
        });
        break;
      }
    }
  }

  // 4. Additions (appended after existing content)
  for (const item of result.additions) {
    // Additions get position offset to appear after base sentences
    const offset = item.from === 'target' ? 0.5 : 0;
    collected.push({
      sentence: item.sentence,
      sortPosition: getPosition(item.sentence) + offset,
      insertionOrder: insertionCounter++,
    });
  }

  // Sort by position, with stable tie-breaking by insertion order
  collected.sort((a, b) => {
    if (a.sortPosition !== b.sortPosition) {
      return a.sortPosition - b.sortPosition;
    }
    return a.insertionOrder - b.insertionOrder;
  });

  // Convert to SentenceV4 with deterministic V4 IDs
  const sentences: SentenceV4[] = [];

  for (const { sentence: s } of collected) {
    const hashInput = `${sourceCommitHash}:${targetCommitHash}:${s.id}`;
    const newId = `${ID_PREFIXES.sentence}${sha256(hashInput).slice(0, 12)}`;
    const sentence: SentenceV4 = {
      id: newId,
      text: s.text,
    };
    // Preserve source_ref for source context display
    if (s.source_ref) {
      sentence.source_ref = s.source_ref;
    }
    sentences.push(sentence);
  }

  const timestamp = committedAt ?? new Date().toISOString();

  // Build first-class data for hash computation
  const firstClassData = {
    schema: 't3x/commit/v4' as const,
    parents: [sourceCommitHash, targetCommitHash],
    author,
    committed_at: timestamp,
    content: {
      sentences,
    },
  };

  // Inline V4 hash computation (sha256 of first-class fields)
  const hashableData = {
    schema: firstClassData.schema,
    parents: firstClassData.parents,
    author: firstClassData.author,
    committed_at: firstClassData.committed_at,
    content: {
      sentences: firstClassData.content.sentences.map((s) => ({
        id: s.id,
        text: s.text,
        ...(s.confidence !== undefined ? { confidence: s.confidence } : {}),
        ...(s.source_ref ? { source_ref: s.source_ref } : {}),
      })),
    },
  };
  const hash = `sha256:${sha256(hashableData)}`;

  return {
    hash,
    schema: 't3x/commit/v4',
    parents: [sourceCommitHash, targetCommitHash],
    author,
    committed_at: timestamp,
    content: {
      sentences,
    },
    project_id: projectId,
    message,
  };
}
