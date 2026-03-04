/**
 * LCS (Longest Common Subsequence) and Word Diff
 *
 * Provides word-level diff between two strings using dynamic programming.
 */

import { tokenize } from './tokenize';
import type { WordDiffSegment } from './types';

/** Maximum words for LCS to prevent O(n²) on very long sentences */
const MAX_LCS_WORDS = 50;

/**
 * Longest Common Subsequence using dynamic programming
 *
 * Returns the longest sequence of words that appear in both arrays in order.
 * Comparison is case-insensitive (tokens may preserve original case).
 * Inputs exceeding 50 words are truncated to prevent O(n²) on long sentences.
 *
 * @example
 * lcs(["the", "quick", "brown", "fox"], ["the", "slow", "brown", "dog"])
 * → ["the", "brown"]
 */
export function lcs(a: string[], b: string[]): string[] {
  // Guard: truncate to MAX_LCS_WORDS to prevent O(n²) on very long sentences
  if (a.length > MAX_LCS_WORDS || b.length > MAX_LCS_WORDS) {
    a = a.slice(0, MAX_LCS_WORDS);
    b = b.slice(0, MAX_LCS_WORDS);
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Build DP table (case-insensitive comparison)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS (case-insensitive comparison, return tokens from `a`)
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Case-insensitive token comparison helper.
 */
function tokensEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Compute word-level diff between two strings
 *
 * Uses LCS to identify unchanged words, then marks the rest as added/removed.
 * Comparison is case-insensitive; tokens preserve original case in output.
 *
 * @example
 * wordDiff("Budget is $3000", "Budget is $3500")
 * → [
 *     { type: 'unchanged', text: 'Budget' },
 *     { type: 'unchanged', text: 'is' },
 *     { type: 'removed', text: '3000' },
 *     { type: 'added', text: '3500' }
 *   ]
 */
export function wordDiff(from: string, to: string): WordDiffSegment[] {
  const fullWordsA = tokenize(from);
  const fullWordsB = tokenize(to);

  // Truncate to same limit as LCS to ensure consistent diff output
  const wordsA = fullWordsA.length > MAX_LCS_WORDS ? fullWordsA.slice(0, MAX_LCS_WORDS) : fullWordsA;
  const wordsB = fullWordsB.length > MAX_LCS_WORDS ? fullWordsB.slice(0, MAX_LCS_WORDS) : fullWordsB;
  const common = lcs(wordsA, wordsB);

  const segments: WordDiffSegment[] = [];
  let ai = 0;
  let bi = 0;
  let ci = 0;

  while (ai < wordsA.length || bi < wordsB.length) {
    // Collect removed words (in A but not in common)
    const removed: string[] = [];
    while (
      ai < wordsA.length &&
      (ci >= common.length || !tokensEqual(wordsA[ai], common[ci]))
    ) {
      removed.push(wordsA[ai++]);
    }
    if (removed.length > 0) {
      segments.push({ type: 'removed', text: removed.join(' ') });
    }

    // Collect added words (in B but not in common)
    const added: string[] = [];
    while (
      bi < wordsB.length &&
      (ci >= common.length || !tokensEqual(wordsB[bi], common[ci]))
    ) {
      added.push(wordsB[bi++]);
    }
    if (added.length > 0) {
      segments.push({ type: 'added', text: added.join(' ') });
    }

    // Collect unchanged word (in common)
    if (ci < common.length) {
      segments.push({ type: 'unchanged', text: common[ci] });
      ai++;
      bi++;
      ci++;
    }
  }

  // Handle tail beyond MAX_LCS_WORDS
  if (fullWordsA.length > MAX_LCS_WORDS) {
    segments.push({ type: 'removed', text: fullWordsA.slice(MAX_LCS_WORDS).join(' ') });
  }
  if (fullWordsB.length > MAX_LCS_WORDS) {
    segments.push({ type: 'added', text: fullWordsB.slice(MAX_LCS_WORDS).join(' ') });
  }

  return segments;
}
