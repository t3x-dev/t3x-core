/**
 * Execute Merge
 *
 * Executes a merge after user has made all decisions.
 * Creates a new CommitV4 with 2 parents.
 *
 * 执行合并 - 在用户完成所有决策后创建新的合并 CommitV4
 *
 * V4 Changes:
 * - Returns CommitV4 (not CommitV3)
 * - Added projectId parameter
 * - No constraint handling (constraints belong to Leaf)
 */

import { sha256 } from '../common/hash';
import type { DiffableSentence } from '../diff/types';
import { computeCommitV4Hash } from '../storage/hash-v4';
import {
  type CommitAuthor,
  type CommitV4,
  ID_PREFIXES,
  type Sentence as SentenceV4,
} from '../types/v4';
import type { Merge2WayResult } from './types';

/**
 * Execute a merge after user has made all decisions.
 * 在用户完成所有决策后执行合并
 *
 * V4 Changes:
 * - Returns CommitV4 (not CommitV3)
 * - Added projectId parameter
 * - No constraint handling
 *
 * FROZEN - Do not modify without team agreement.
 *
 * Creates a new commit with:
 * - parents: [sourceHash, targetHash]
 * - content: merged sentences (no constraints - they belong to Leaf)
 * - New IDs: deterministic V4 format 's_' + sha256(parentHashes + originalId).slice(0,12)
 *
 * @throws Error if any similarPair has no resolution
 *
 * @example
 * // After user resolves all pairs and toggles keep/discard:
 * prepared.similarPairs[0].resolution = 'target';
 * prepared.onlyInSource[0].keep = false;
 *
 * executeMerge(
 *   prepared,
 *   'sha256:source123',
 *   'sha256:target456',
 *   { type: 'human', name: 'Alice' },
 *   'Merge feature-branch into main',
 *   'proj_abc123'
 * )
 * → CommitV4 with parents: ['sha256:source123', 'sha256:target456']
 */
export function executeMerge(
  prepared: Merge2WayResult,
  sourceCommitHash: string,
  targetCommitHash: string,
  author: CommitAuthor,
  message: string,
  projectId: string,
  committedAt?: string
): CommitV4 {
  // Collect sentences with their sort position for order preservation
  // 收集句子及其排序位置，用于保持原始文档顺序
  const collected: Array<{
    sentence: DiffableSentence;
    sortPosition: number;
    insertionOrder: number;
  }> = [];
  let insertionCounter = 0;

  // Helper to get the position from a DiffableSentence (falls back to Infinity)
  const getPosition = (s: DiffableSentence): number => s.position ?? Number.POSITIVE_INFINITY;

  // 1. Collect identical sentences (use source position)
  // 收集完全相同的句子（使用 source 位置）
  for (const s of prepared.identical) {
    collected.push({
      sentence: s,
      sortPosition: getPosition(s),
      insertionOrder: insertionCounter++,
    });
  }

  // 2. Collect resolved similar pairs
  // 收集已解决的相似句子对
  for (const pair of prepared.similarPairs) {
    if (!pair.resolution) {
      throw new Error(`Unresolved similar pair: "${pair.source.text}" vs "${pair.target.text}"`);
    }

    if (pair.resolution === 'source') {
      collected.push({
        sentence: pair.source,
        sortPosition: getPosition(pair.source),
        insertionOrder: insertionCounter++,
      });
    } else {
      // Use target position for target resolution
      collected.push({
        sentence: pair.target,
        sortPosition: getPosition(pair.target),
        insertionOrder: insertionCounter++,
      });
    }
  }

  // 3. Collect kept sentences from source-only (use source position)
  // 收集保留的仅在 source 中的句子（使用 source 位置）
  for (const candidate of prepared.onlyInSource) {
    if (candidate.keep) {
      collected.push({
        sentence: candidate.sentence,
        sortPosition: getPosition(candidate.sentence),
        insertionOrder: insertionCounter++,
      });
    }
  }

  // 4. Collect kept sentences from target-only (use target position + offset)
  // Target-only sentences get position + 0.5 offset so they appear after
  // source sentences at the same integer position (interleaving)
  // 收集保留的仅在 target 中的句子（位置 + 0.5 偏移，穿插排列）
  for (const candidate of prepared.onlyInTarget) {
    if (candidate.keep) {
      collected.push({
        sentence: candidate.sentence,
        sortPosition: getPosition(candidate.sentence) + 0.5,
        insertionOrder: insertionCounter++,
      });
    }
  }

  // Sort by position, with stable tie-breaking by insertion order
  // 按位置排序，位置相同时按插入顺序（稳定排序）
  collected.sort((a, b) => {
    if (a.sortPosition !== b.sortPosition) {
      return a.sortPosition - b.sortPosition;
    }
    return a.insertionOrder - b.insertionOrder;
  });

  // Convert to SentenceV4 with deterministic V4 IDs
  // 转换为 SentenceV4，使用确定性 V4 格式 ID
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
  // 构建一等字段用于计算哈希
  const firstClassData = {
    schema: 't3x/commit/v4' as const,
    parents: [sourceCommitHash, targetCommitHash],
    author,
    committed_at: timestamp,
    content: {
      sentences,
    },
  };

  const hash = computeCommitV4Hash(firstClassData);

  // Return CommitV4
  // 返回 CommitV4
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
    // Note: branch should be set by caller based on merge target
    // 注意：branch 应由调用者根据合并目标设置
  };
}
