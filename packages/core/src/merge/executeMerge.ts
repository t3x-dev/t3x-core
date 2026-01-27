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
  projectId: string
): CommitV4 {
  const sentences: SentenceV4[] = [];

  // Helper to convert DiffableSentence to SentenceV4 with deterministic V4 ID
  // 辅助函数：将 DiffableSentence 转换为 SentenceV4，使用确定性 V4 格式 ID
  // ID = s_ + sha256(sourceHash:targetHash:originalId).slice(0,12)
  // Benefits: deterministic, traceable, unique within/across merges
  const addSentence = (s: DiffableSentence) => {
    const hashInput = `${sourceCommitHash}:${targetCommitHash}:${s.id}`;
    const newId = `${ID_PREFIXES.sentence}${sha256(hashInput).slice(0, 12)}`;
    sentences.push({
      id: newId,
      text: s.text,
      // Note: source_ref and confidence are not preserved in merge
      // as DiffableSentence only has id and text
    });
  };

  // 1. Add identical sentences (from source, arbitrary choice)
  // 添加完全相同的句子（从 source 取，任意选择）
  for (const s of prepared.identical) {
    addSentence(s);
  }

  // 2. Add resolved similar pairs
  // 添加已解决的相似句子对
  for (const pair of prepared.similarPairs) {
    if (!pair.resolution) {
      throw new Error(`Unresolved similar pair: "${pair.source.text}" vs "${pair.target.text}"`);
    }

    if (pair.resolution === 'source') {
      addSentence(pair.source);
    } else {
      addSentence(pair.target);
    }
  }

  // 3. Add kept sentences from source-only
  // 添加保留的仅在 source 中的句子
  for (const candidate of prepared.onlyInSource) {
    if (candidate.keep) {
      addSentence(candidate.sentence);
    }
  }

  // 4. Add kept sentences from target-only
  // 添加保留的仅在 target 中的句子
  for (const candidate of prepared.onlyInTarget) {
    if (candidate.keep) {
      addSentence(candidate.sentence);
    }
  }

  const committedAt = new Date().toISOString();

  // Build first-class data for hash computation
  // 构建一等字段用于计算哈希
  const firstClassData = {
    schema: 't3x/commit/v4' as const,
    parents: [sourceCommitHash, targetCommitHash],
    author,
    committed_at: committedAt,
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
    committed_at: committedAt,
    content: {
      sentences,
    },
    project_id: projectId,
    message,
    // Note: branch should be set by caller based on merge target
    // 注意：branch 应由调用者根据合并目标设置
  };
}
