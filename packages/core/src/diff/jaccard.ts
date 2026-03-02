/**
 * Jaccard Similarity
 *
 * Jaccard similarity coefficient: |A ∩ B| / |A ∪ B|
 * Returns 0-1 where 1 means identical word sets.
 *
 * @example
 * jaccard(["budget", "is", "$3000"], ["budget", "is", "$3500"])
 * → intersection: ["budget", "is"] = 2
 * → union: ["budget", "is", "$3000", "$3500"] = 4
 * → 2/4 = 0.5
 */
export function jaccard(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Minimum Jaccard score to consider sentences "similar"
 *
 * Why 0.4?
 * - Below 0.4 → sentences share too few words, diff produces noise/false pairs
 * - At 0.4 → at least 40% word overlap, indicating genuinely related content
 * - Above 0.5 → clearly related, diff will be informative
 *
 * Upgraded from 0.3 → 0.4 to reduce false positive pairings
 * (e.g., "fox jumps" vs "dog runs" would no longer be erroneously paired)
 */
export const JACCARD_THRESHOLD = 0.4;
