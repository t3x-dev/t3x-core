/**
 * Incremental Diff Algorithm (Item 13: 实时增量 Diff)
 *
 * Optimized diff that caches previous results and only re-diffs
 * sentences that changed since the last computation.
 *
 * Performance targets:
 * - <50 sentences: <10ms
 * - 50-200 sentences: <50ms
 * - >200 sentences: incremental <50ms (only re-diffs changes)
 *
 * Algorithm:
 * 1. On first call (no cache): run full diffCommits, populate cache
 * 2. On subsequent calls:
 *    a. Recompute exact matches (O(N+M), always fast)
 *    b. Identify stable similar pairs from cache (both sides unchanged)
 *    c. Re-diff only "dirty" sentences (new, changed, or lost partner)
 *    d. Merge stable pairs + new diff results
 */

import { diffCommits } from './diffCommits';
import type { CommitDiff, DiffableSentence, SentencePair } from './types';

/**
 * Cache structure for incremental diff.
 *
 * Stores previous input fingerprints and pair mappings
 * to enable partial reuse on subsequent calls.
 */
export interface DiffCache {
  /** Previous source sentences: id → text */
  sourceTexts: Map<string, string>;
  /** Previous target sentences: id → text */
  targetTexts: Map<string, string>;
  /** Previous diff result (for fast-path return when nothing changed) */
  result: CommitDiff;
  /** Previous similar pairs indexed by source id */
  pairBySourceId: Map<string, SentencePair>;
}

/**
 * Build a DiffCache from diff inputs and result.
 */
function buildCache(
  source: DiffableSentence[],
  target: DiffableSentence[],
  result: CommitDiff
): DiffCache {
  const sourceTexts = new Map(source.map((s) => [s.id, s.text]));
  const targetTexts = new Map(target.map((s) => [s.id, s.text]));

  const pairBySourceId = new Map<string, SentencePair>();
  for (const pair of result.similar) {
    pairBySourceId.set(pair.source.id, pair);
  }

  return { sourceTexts, targetTexts, result, pairBySourceId };
}

/**
 * Check whether inputs are identical to cached inputs.
 */
function inputsUnchanged(
  source: DiffableSentence[],
  target: DiffableSentence[],
  cache: DiffCache
): boolean {
  if (source.length !== cache.sourceTexts.size || target.length !== cache.targetTexts.size) {
    return false;
  }
  for (const s of source) {
    if (cache.sourceTexts.get(s.id) !== s.text) return false;
  }
  for (const t of target) {
    if (cache.targetTexts.get(t.id) !== t.text) return false;
  }
  return true;
}

/**
 * Incremental diff: compares source and target sentences,
 * reusing cached results for unchanged sentence pairs.
 *
 * @param source - Source sentences (e.g., parent commit)
 * @param target - Target sentences (e.g., current draft)
 * @param cache  - Previous DiffCache, or null/undefined for full diff
 * @returns Tuple of [CommitDiff, DiffCache]
 */
export function incrementalDiffCommits(
  source: DiffableSentence[],
  target: DiffableSentence[],
  cache?: DiffCache | null
): [CommitDiff, DiffCache] {
  // No cache → full diff
  if (!cache) {
    const result = diffCommits(source, target);
    return [result, buildCache(source, target, result)];
  }

  // Fast path: nothing changed
  if (inputsUnchanged(source, target, cache)) {
    return [cache.result, cache];
  }

  // ---------- Step 1: Exact match (O(N+M)) ----------
  const targetTextSet = new Set(target.map((s) => s.text));
  const sourceTextSet = new Set(source.map((s) => s.text));

  const identical = source.filter((s) => targetTextSet.has(s.text));
  const unmatchedSource = source.filter((s) => !targetTextSet.has(s.text));
  const unmatchedTarget = target.filter((s) => !sourceTextSet.has(s.text));

  // ---------- Step 2: Identify stable similar pairs ----------
  // A pair is stable if both sides still exist in unmatched with same text.
  const unmatchedSourceMap = new Map(unmatchedSource.map((s) => [s.id, s]));
  const unmatchedTargetMap = new Map(unmatchedTarget.map((s) => [s.id, s]));

  const stablePairs: SentencePair[] = [];
  const stableSourceIds = new Set<string>();
  const stableTargetIds = new Set<string>();

  for (const [sourceId, pair] of cache.pairBySourceId) {
    const targetId = pair.target.id;

    // Both must still be in the unmatched pool
    const curSource = unmatchedSourceMap.get(sourceId);
    const curTarget = unmatchedTargetMap.get(targetId);
    if (!curSource || !curTarget) continue;

    // Text must be unchanged from when the pair was computed
    if (cache.sourceTexts.get(sourceId) !== curSource.text) continue;
    if (cache.targetTexts.get(targetId) !== curTarget.text) continue;

    // Stable: reuse similarity and wordDiff
    stablePairs.push({
      source: curSource,
      target: curTarget,
      similarity: pair.similarity,
      wordDiff: pair.wordDiff,
    });
    stableSourceIds.add(sourceId);
    stableTargetIds.add(targetId);
  }

  // ---------- Step 3: Collect dirty sentences ----------
  const dirtySource = unmatchedSource.filter((s) => !stableSourceIds.has(s.id));
  const dirtyTarget = unmatchedTarget.filter((s) => !stableTargetIds.has(s.id));

  // ---------- Step 4: Re-diff dirty sentences ----------
  let newSimilar: SentencePair[] = [];
  let newOnlyInSource: DiffableSentence[] = dirtySource;
  let newOnlyInTarget: DiffableSentence[] = dirtyTarget;

  if (dirtySource.length > 0 && dirtyTarget.length > 0) {
    const dirtyDiff = diffCommits(dirtySource, dirtyTarget);
    newSimilar = dirtyDiff.similar;
    newOnlyInSource = dirtyDiff.onlyInSource;
    newOnlyInTarget = dirtyDiff.onlyInTarget;
    // By construction, dirtyDiff.identical should be empty
    // (texts already separated in step 1), but handle gracefully
    if (dirtyDiff.identical.length > 0) {
      identical.push(...dirtyDiff.identical);
    }
  }

  // ---------- Step 5: Merge results ----------
  const result: CommitDiff = {
    identical,
    similar: [...stablePairs, ...newSimilar],
    onlyInSource: newOnlyInSource,
    onlyInTarget: newOnlyInTarget,
  };

  return [result, buildCache(source, target, result)];
}
