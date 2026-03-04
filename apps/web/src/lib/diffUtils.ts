/**
 * Diff utilities for comparing commits
 *
 * Extracted from DiffDisplayView for reusability and testability.
 *
 * @see https://github.com/t3x-dev/T3X/issues/220
 */

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Sentence with minimal fields for diff */
export interface DiffableSentence {
  id: string;
  text: string;
}

/** Word-level diff segment */
export interface WordDiffSegment {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

/** Pair of similar sentences with word diff */
export interface SentencePair {
  source: DiffableSentence;
  target: DiffableSentence;
  similarity: number;
  wordDiff: WordDiffSegment[];
}

/** Result of comparing two commits */
export interface CommitDiff {
  identical: DiffableSentence[];
  equivalent: SentencePair[];
  similar: SentencePair[];
  onlyInSource: DiffableSentence[];
  onlyInTarget: DiffableSentence[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

export const JACCARD_THRESHOLD = 0.3;
export const EQUIVALENT_THRESHOLD = 0.85;

// ═══════════════════════════════════════════════════════════════════════════
// Tokenization
// ═══════════════════════════════════════════════════════════════════════════

/** Split text into words, preserving original case for display */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Tokenize for comparison (lowercase) */
export function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// Jaccard Similarity
// ═══════════════════════════════════════════════════════════════════════════

export function jaccard(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;

  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ═══════════════════════════════════════════════════════════════════════════
// LCS Algorithm
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LCS algorithm that returns indices instead of values
 * This allows us to preserve original case when building the diff
 */
export function lcsIndices(a: string[], b: string[]): { aIndices: number[]; bIndices: number[] } {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Build DP table using lowercase comparison
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS indices
  const aIndices: number[] = [];
  const bIndices: number[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      aIndices.unshift(i - 1);
      bIndices.unshift(j - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return { aIndices, bIndices };
}

/**
 * Classic LCS that returns values (lowercase)
 * Kept for backward compatibility with tests
 */
export function lcs(a: string[], b: string[]): string[] {
  const { aIndices } = lcsIndices(a, b);
  return aIndices.map((i) => a[i].toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// Word Diff
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Word-level diff that preserves original case
 *
 * @example
 * wordDiff("Budget is $3000", "Budget is $3500")
 * → [
 *     { type: 'unchanged', text: 'Budget' },
 *     { type: 'unchanged', text: 'is' },
 *     { type: 'removed', text: '$3000' },
 *     { type: 'added', text: '$3500' }
 *   ]
 */
export function wordDiff(from: string, to: string): WordDiffSegment[] {
  const wordsA = splitWords(from); // Original case
  const wordsB = splitWords(to); // Original case
  const { aIndices, bIndices } = lcsIndices(wordsA, wordsB);

  const segments: WordDiffSegment[] = [];
  let ai = 0;
  let bi = 0;
  let ci = 0;

  while (ai < wordsA.length || bi < wordsB.length) {
    // Collect removed words (in A but not in common)
    const removed: string[] = [];
    while (ai < wordsA.length && (ci >= aIndices.length || ai !== aIndices[ci])) {
      removed.push(wordsA[ai++]);
    }
    if (removed.length > 0) {
      segments.push({ type: 'removed', text: removed.join(' ') });
    }

    // Collect added words (in B but not in common)
    const added: string[] = [];
    while (bi < wordsB.length && (ci >= bIndices.length || bi !== bIndices[ci])) {
      added.push(wordsB[bi++]);
    }
    if (added.length > 0) {
      segments.push({ type: 'added', text: added.join(' ') });
    }

    // Collect unchanged word (use original case from source)
    if (ci < aIndices.length) {
      segments.push({ type: 'unchanged', text: wordsA[aIndices[ci]] });
      ai++;
      bi++;
      ci++;
    }
  }

  return segments;
}

// ═══════════════════════════════════════════════════════════════════════════
// Commit Diff
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compare two commits and produce a structured diff.
 *
 * @param source - Sentences from source commit (old/base version)
 * @param target - Sentences from target commit (new version)
 * @returns CommitDiff with identical, similar, onlyInSource, onlyInTarget arrays
 */
export function diffCommits(source: DiffableSentence[], target: DiffableSentence[]): CommitDiff {
  // Stage 1: Exact match
  const textsB = new Set(target.map((s) => s.text));
  const textsA = new Set(source.map((s) => s.text));

  const identical = source.filter((s) => textsB.has(s.text));
  const unmatchedA = source.filter((s) => !textsB.has(s.text));
  const unmatchedB = target.filter((s) => !textsA.has(s.text));

  // Stage 2-3: Build similarity matrix and find best matches
  const similar: SentencePair[] = [];
  const matchedSourceIds = new Set<string>();
  const matchedTargetIds = new Set<string>();

  const tokenizedA = unmatchedA.map((s) => ({ sentence: s, tokens: tokenize(s.text) }));
  const tokenizedB = unmatchedB.map((s) => ({ sentence: s, tokens: tokenize(s.text) }));

  // Simple greedy matching (for smaller sets, sufficient)
  for (const a of tokenizedA) {
    let bestMatch: { index: number; similarity: number } | null = null;

    for (let j = 0; j < tokenizedB.length; j++) {
      if (matchedTargetIds.has(tokenizedB[j].sentence.id)) continue;
      const sim = jaccard(a.tokens, tokenizedB[j].tokens);
      if (sim >= JACCARD_THRESHOLD && (!bestMatch || sim > bestMatch.similarity)) {
        bestMatch = { index: j, similarity: sim };
      }
    }

    if (bestMatch) {
      const b = tokenizedB[bestMatch.index];
      similar.push({
        source: a.sentence,
        target: b.sentence,
        similarity: bestMatch.similarity,
        wordDiff: wordDiff(a.sentence.text, b.sentence.text),
      });
      matchedSourceIds.add(a.sentence.id);
      matchedTargetIds.add(b.sentence.id);
    }
  }

  // Stage 4: Split similar by threshold → equivalent (≥ 0.85) vs similar (< 0.85)
  const equivalent = similar.filter((p) => p.similarity >= EQUIVALENT_THRESHOLD);
  const modified = similar.filter((p) => p.similarity < EQUIVALENT_THRESHOLD);

  // Stage 5: Classify remainder
  const onlyInSource = unmatchedA.filter((s) => !matchedSourceIds.has(s.id));
  const onlyInTarget = unmatchedB.filter((s) => !matchedTargetIds.has(s.id));

  return { identical, equivalent, similar: modified, onlyInSource, onlyInTarget };
}

// ═══════════════════════════════════════════════════════════════════════════
// Incremental Diff (Item 13: Real-Time Incremental Diff)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cache for incremental diff.
 * Stores previous inputs/results so unchanged pairs can be reused.
 */
export interface DiffCache {
  sourceTexts: Map<string, string>;
  targetTexts: Map<string, string>;
  result: CommitDiff;
  /** All pairs (equivalent + similar) keyed by source id */
  pairBySourceId: Map<string, SentencePair>;
}

function buildDiffCache(
  source: DiffableSentence[],
  target: DiffableSentence[],
  result: CommitDiff
): DiffCache {
  const sourceTexts = new Map(source.map((s) => [s.id, s.text]));
  const targetTexts = new Map(target.map((s) => [s.id, s.text]));
  const pairBySourceId = new Map<string, SentencePair>();
  for (const pair of [...result.equivalent, ...result.similar]) {
    pairBySourceId.set(pair.source.id, pair);
  }
  return { sourceTexts, targetTexts, result, pairBySourceId };
}

/**
 * Incremental diff: reuses cached pair results for unchanged sentences.
 *
 * On first call (no cache): runs full diffCommits.
 * On subsequent calls: only re-diffs sentences that changed.
 *
 * @returns Tuple of [CommitDiff, DiffCache]
 */
export function incrementalDiffCommits(
  source: DiffableSentence[],
  target: DiffableSentence[],
  cache?: DiffCache | null
): [CommitDiff, DiffCache] {
  if (!cache) {
    const result = diffCommits(source, target);
    return [result, buildDiffCache(source, target, result)];
  }

  // Fast path: nothing changed
  if (
    source.length === cache.sourceTexts.size &&
    target.length === cache.targetTexts.size &&
    source.every((s) => cache.sourceTexts.get(s.id) === s.text) &&
    target.every((t) => cache.targetTexts.get(t.id) === t.text)
  ) {
    return [cache.result, cache];
  }

  // Step 1: Exact match (always O(N+M))
  const targetTextSet = new Set(target.map((s) => s.text));
  const sourceTextSet = new Set(source.map((s) => s.text));
  const identical = source.filter((s) => targetTextSet.has(s.text));
  const unmatchedSource = source.filter((s) => !targetTextSet.has(s.text));
  const unmatchedTarget = target.filter((s) => !sourceTextSet.has(s.text));

  // Step 2: Find stable pairs from cache
  const unmatchedSourceMap = new Map(unmatchedSource.map((s) => [s.id, s]));
  const unmatchedTargetMap = new Map(unmatchedTarget.map((s) => [s.id, s]));
  const stablePairs: SentencePair[] = [];
  const stableSourceIds = new Set<string>();
  const stableTargetIds = new Set<string>();

  for (const [sourceId, pair] of cache.pairBySourceId) {
    const targetId = pair.target.id;
    const curSource = unmatchedSourceMap.get(sourceId);
    const curTarget = unmatchedTargetMap.get(targetId);
    if (!curSource || !curTarget) continue;
    if (cache.sourceTexts.get(sourceId) !== curSource.text) continue;
    if (cache.targetTexts.get(targetId) !== curTarget.text) continue;

    stablePairs.push({
      source: curSource,
      target: curTarget,
      similarity: pair.similarity,
      wordDiff: pair.wordDiff,
    });
    stableSourceIds.add(sourceId);
    stableTargetIds.add(targetId);
  }

  // Step 3: Re-diff dirty sentences
  const dirtySource = unmatchedSource.filter((s) => !stableSourceIds.has(s.id));
  const dirtyTarget = unmatchedTarget.filter((s) => !stableTargetIds.has(s.id));

  let newEquivalent: SentencePair[] = [];
  let newSimilar: SentencePair[] = [];
  let newOnlyInSource: DiffableSentence[] = dirtySource;
  let newOnlyInTarget: DiffableSentence[] = dirtyTarget;

  if (dirtySource.length > 0 && dirtyTarget.length > 0) {
    const dirtyDiff = diffCommits(dirtySource, dirtyTarget);
    newEquivalent = dirtyDiff.equivalent;
    newSimilar = dirtyDiff.similar;
    newOnlyInSource = dirtyDiff.onlyInSource;
    newOnlyInTarget = dirtyDiff.onlyInTarget;
    if (dirtyDiff.identical.length > 0) {
      identical.push(...dirtyDiff.identical);
    }
  }

  // Step 4: Split stable pairs into equivalent/similar
  const stableEquivalent = stablePairs.filter((p) => p.similarity >= EQUIVALENT_THRESHOLD);
  const stableSimilar = stablePairs.filter((p) => p.similarity < EQUIVALENT_THRESHOLD);

  const result: CommitDiff = {
    identical,
    equivalent: [...stableEquivalent, ...newEquivalent],
    similar: [...stableSimilar, ...newSimilar],
    onlyInSource: newOnlyInSource,
    onlyInTarget: newOnlyInTarget,
  };

  return [result, buildDiffCache(source, target, result)];
}
