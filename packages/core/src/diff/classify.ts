/**
 * Four-Level Diff Classification (Upgrade #5)
 *
 * Classifies sentence pairs into four levels for UI display:
 *
 * - Identical:   Exact text match → grey, collapsible
 * - Equivalent:  Same meaning, different wording (cosine ≥ 0.90) → green
 * - Similar:     Same topic, content changed (Jaccard ≥ 0.4, cosine < 0.90) → yellow
 * - Different:   Completely different knowledge points → red
 *
 * IMPORTANT: Classification is purely for DISPLAY.
 * It does NOT affect the pairing logic (which remains Jaccard + Hungarian/Greedy).
 * Classification is an overlay on top of the pairing results.
 */

import type { EmbeddingProvider } from '../providers/embedding/base';
import { cosineSimilarity } from '../providers/embedding/base';
import type { CommitDiff, SentencePair } from './types';

/**
 * Four-level classification enum
 */
export type DiffClassification = 'identical' | 'equivalent' | 'similar' | 'different';

/** Cosine similarity threshold for "equivalent" classification */
export const EQUIVALENT_THRESHOLD = 0.9;

/**
 * A sentence pair with its display classification.
 */
export interface ClassifiedSentencePair extends SentencePair {
  classification: DiffClassification;
}

/**
 * CommitDiff with four-level classification overlay.
 */
export interface ClassifiedCommitDiff extends CommitDiff {
  /** Similar pairs with classification labels */
  classifiedSimilar: ClassifiedSentencePair[];
}

/**
 * Classify similar sentence pairs using embedding similarity.
 *
 * When an embedder is available, computes cosine similarity to distinguish
 * "equivalent" (same meaning, different words) from "similar" (same topic, different content).
 *
 * When no embedder is available, all similar pairs default to "similar" classification.
 *
 * @param diff - The CommitDiff result from diffCommits()
 * @param embedder - Optional embedding provider for semantic classification
 * @returns ClassifiedCommitDiff with classification labels on similar pairs
 */
export async function classifyDiff(
  diff: CommitDiff,
  embedder?: EmbeddingProvider
): Promise<ClassifiedCommitDiff> {
  if (!embedder || diff.similar.length === 0) {
    // No embedder or no similar pairs: all similar pairs default to 'similar'
    return {
      ...diff,
      classifiedSimilar: diff.similar.map((pair) => ({
        ...pair,
        classification: 'similar' as DiffClassification,
      })),
    };
  }

  // Batch encode all texts for efficiency
  const sourceTexts = diff.similar.map((p) => p.source.text);
  const targetTexts = diff.similar.map((p) => p.target.text);
  const allTexts = [...sourceTexts, ...targetTexts];

  const allVectors = await embedder.encode(allTexts);
  const n = diff.similar.length;

  const classifiedSimilar: ClassifiedSentencePair[] = diff.similar.map((pair, i) => {
    const sourceVec = allVectors[i];
    const targetVec = allVectors[n + i];
    const cosine = cosineSimilarity(sourceVec, targetVec);

    const classification: DiffClassification =
      cosine >= EQUIVALENT_THRESHOLD ? 'equivalent' : 'similar';

    return {
      ...pair,
      classification,
    };
  });

  return {
    ...diff,
    classifiedSimilar,
  };
}
