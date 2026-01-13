/**
 * Smart Diff - Two-layer intelligent diff system
 *
 * Combines deterministic text matching with semantic understanding:
 *
 * Layer 1 (Deterministic): Hungarian + Jaccard + LCS
 *   - Exact text matching → identical
 *   - Similar text matching → textSimilar (with word-level diff)
 *
 * Layer 2 (Semantic): Embedding similarity (optional)
 *   - Catches "rephrased" sentences that Layer 1 missed
 *   - Example: "I want to buy a car" ↔ "I'd like to purchase a vehicle"
 *
 * Usage:
 *   - Without embeddingProvider: Layer 1 only (deterministic)
 *   - With embeddingProvider: Layer 1 + Layer 2 (full semantic matching)
 */

import type { EmbeddingProvider } from '../providers/embedding';
import type { Sentence } from '../types/commit';
import { diffCommits } from './diffCommits';
import { jaccard } from './jaccard';
import { tokenize } from './tokenize';
import type { SemanticMatch, SmartDiffResult, SmartDiffStats } from './types';

/**
 * Threshold for semantic similarity (Layer 2)
 * 语义相似度阈值
 *
 * Why 0.8?
 * - Below 0.8: May include false positives (unrelated sentences)
 * - At 0.8: High confidence that sentences have similar meaning
 * - Above 0.9: Too strict, may miss valid rephrasings
 */
export const SEMANTIC_THRESHOLD = 0.8;

/**
 * Calculate smart diff statistics
 * 计算智能差异统计信息
 */
function calculateSmartDiffStats(
  source: Sentence[],
  target: Sentence[],
  identicalCount: number,
  textSimilarCount: number,
  semanticMatchCount: number,
  addedCount: number,
  removedCount: number
): SmartDiffStats {
  return {
    totalSource: source.length,
    totalTarget: target.length,
    identicalCount,
    textSimilarCount,
    semanticMatchCount,
    addedCount,
    removedCount,
  };
}

/**
 * Smart Diff - Two-layer intelligent diff
 * 智能差异 - 两层智能对比
 *
 * Layer 1: Hungarian + Jaccard + LCS (deterministic, always runs)
 * Layer 2: Embedding similarity (semantic, optional)
 *
 * @param source - Source sentences (源句子数组)
 * @param target - Target sentences (目标句子数组)
 * @param embeddingProvider - Optional embedding provider for Layer 2
 *                           (可选的 Embedding 提供者，用于语义匹配)
 * @returns SmartDiffResult with both text and semantic matches
 *
 * @example
 * // Layer 1 only (deterministic)
 * const result = await smartDiff(source, target);
 *
 * // Layer 1 + Layer 2 (full semantic)
 * const result = await smartDiff(source, target, embeddingProvider);
 */
export async function smartDiff(
  source: Sentence[],
  target: Sentence[],
  embeddingProvider?: EmbeddingProvider
): Promise<SmartDiffResult> {
  // Layer 1: Deterministic text matching (Hungarian + Jaccard + LCS)
  // 第一层：确定性文字匹配
  const textDiff = diffCommits(source, target);

  // If no embedding provider, return Layer 1 results only
  // 如果没有 Embedding 提供者，只返回第一层结果
  if (!embeddingProvider) {
    const stats = calculateSmartDiffStats(
      source,
      target,
      textDiff.identical.length,
      textDiff.similar.length,
      0,
      textDiff.onlyInTarget.length,
      textDiff.onlyInSource.length
    );

    return {
      identical: textDiff.identical,
      textSimilar: textDiff.similar,
      semanticMatch: [],
      onlyInSource: textDiff.onlyInSource,
      onlyInTarget: textDiff.onlyInTarget,
      stats,
    };
  }

  // Layer 2: Semantic matching for unmatched sentences
  // 第二层：对未匹配句子进行语义匹配
  const semanticMatches: SemanticMatch[] = [];
  const semanticMatchedSourceIds = new Set<string>();
  const semanticMatchedTargetIds = new Set<string>();

  // Only process sentences that Layer 1 couldn't match
  // 仅处理第一层未能匹配的句子
  const unmatchedSource = textDiff.onlyInSource;
  const unmatchedTarget = textDiff.onlyInTarget;

  if (unmatchedSource.length > 0 && unmatchedTarget.length > 0) {
    // Batch encode all unmatched sentences for efficiency
    // 批量编码所有未匹配句子以提高效率
    const sourceTexts = unmatchedSource.map((s) => s.text);
    const targetTexts = unmatchedTarget.map((s) => s.text);

    const [sourceVectors, targetVectors] = await Promise.all([
      embeddingProvider.encode(sourceTexts),
      embeddingProvider.encode(targetTexts),
    ]);

    // Find semantic matches using embedding similarity
    // 使用 Embedding 相似度寻找语义匹配
    for (let i = 0; i < unmatchedSource.length; i++) {
      if (semanticMatchedSourceIds.has(unmatchedSource[i].id)) continue;

      let bestMatch: {
        targetIndex: number;
        semanticSimilarity: number;
        textSimilarity: number;
      } | null = null;

      for (let j = 0; j < unmatchedTarget.length; j++) {
        if (semanticMatchedTargetIds.has(unmatchedTarget[j].id)) continue;

        const semanticSimilarity = embeddingProvider.similarity(sourceVectors[i], targetVectors[j]);

        if (semanticSimilarity >= SEMANTIC_THRESHOLD) {
          // Calculate text similarity for reference
          // 计算文字相似度作为参考
          const sourceTokens = tokenize(unmatchedSource[i].text);
          const targetTokens = tokenize(unmatchedTarget[j].text);
          const textSimilarity = jaccard(sourceTokens, targetTokens);

          if (!bestMatch || semanticSimilarity > bestMatch.semanticSimilarity) {
            bestMatch = {
              targetIndex: j,
              semanticSimilarity,
              textSimilarity,
            };
          }
        }
      }

      if (bestMatch) {
        semanticMatches.push({
          source: unmatchedSource[i],
          target: unmatchedTarget[bestMatch.targetIndex],
          semanticSimilarity: bestMatch.semanticSimilarity,
          textSimilarity: bestMatch.textSimilarity,
        });

        semanticMatchedSourceIds.add(unmatchedSource[i].id);
        semanticMatchedTargetIds.add(unmatchedTarget[bestMatch.targetIndex].id);
      }
    }
  }

  // Filter out semantically matched from onlyIn arrays
  // 从 onlyIn 数组中过滤掉已语义匹配的句子
  const finalOnlyInSource = unmatchedSource.filter((s) => !semanticMatchedSourceIds.has(s.id));
  const finalOnlyInTarget = unmatchedTarget.filter((s) => !semanticMatchedTargetIds.has(s.id));

  const stats = calculateSmartDiffStats(
    source,
    target,
    textDiff.identical.length,
    textDiff.similar.length,
    semanticMatches.length,
    finalOnlyInTarget.length,
    finalOnlyInSource.length
  );

  return {
    identical: textDiff.identical,
    textSimilar: textDiff.similar,
    semanticMatch: semanticMatches,
    onlyInSource: finalOnlyInSource,
    onlyInTarget: finalOnlyInTarget,
    stats,
  };
}
