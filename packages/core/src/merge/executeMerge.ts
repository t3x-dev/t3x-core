/**
 * Execute Merge
 *
 * Executes a merge after user has made all decisions.
 * Creates a new commit with 2 parents.
 *
 * 执行合并 - 在用户完成所有决策后创建新的合并 commit
 */

import type {
  CommitAuthor,
  CommitContent,
  CommitV3,
  Constraint,
  Sentence,
} from '../types/commit';
import { computeCommitV3Hash } from '../common/hash';
import type { Merge2WayResult } from './types';
import type {
  CommitV3 as CommitV3New,
  Sentence as SentenceNew,
  Constraint as ConstraintNew,
  RequireConstraint,
  ExcludeConstraint,
} from '../types/commit-v3';

/**
 * Convert old Sentence format to new CommitV3 Sentence format
 * 将旧的 Sentence 格式转换为新的 CommitV3 Sentence 格式
 */
function convertSentenceToV3(sentence: Sentence): SentenceNew {
  return {
    id: sentence.id,
    text: sentence.text,
    source: {
      turn_hash: sentence.source.id, // Map old source.id to turn_hash
      start_char: 0, // Default values since old format doesn't have these
      end_char: sentence.text.length,
    },
  };
}

/**
 * Convert old Constraint format to new CommitV3 Constraint format
 * 将旧的 Constraint 格式转换为新的 CommitV3 Constraint 格式
 */
function convertConstraintToV3(constraint: Constraint): ConstraintNew {
  if (constraint.type === 'require') {
    return {
      type: 'require',
      id: constraint.id,
      value: constraint.value,
      match: 'exact', // Default to exact match
      source_sentence_id: constraint.source_sentence_id,
      suggested: false,
    } as RequireConstraint;
  } else if (constraint.type === 'exclude') {
    return {
      type: 'exclude',
      id: constraint.id,
      value: constraint.value,
      match: 'exact',
      reason: undefined,
    } as ExcludeConstraint;
  }
  // Default to require constraint for unknown types
  return {
    type: 'require',
    id: constraint.id,
    value: constraint.value,
    match: 'exact',
    source_sentence_id: constraint.source_sentence_id,
  } as RequireConstraint;
}

/**
 * Execute a merge after user has made all decisions
 * 在用户完成所有决策后执行合并
 *
 * Creates a new commit with:
 * - parents: [sourceHash, targetHash]
 * - content: merged sentences + their constraints
 * - New IDs: sentences get 'm1', 'm2', ...; constraints get 'mc1', 'mc2', ...
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
 *   { name: 'Alice', identity: 'alice@example.com', verification: 'verified' },
 *   'Merge feature-branch into main'
 * )
 * → CommitV3 with parents: ['sha256:source123', 'sha256:target456']
 */
export function executeMerge(
  prepared: Merge2WayResult,
  sourceCommitHash: string,
  targetCommitHash: string,
  author: CommitAuthor,
  message: string
): CommitV3 {
  const sentences: Sentence[] = [];
  const constraints: Constraint[] = [];
  let sentenceId = 1;
  let constraintId = 1;

  // Helper to add a sentence and its constraints with new IDs
  // 辅助函数：添加句子及其约束，使用新ID
  const addSentence = (s: Sentence, sentenceConstraints: Constraint[]) => {
    const newId = `m${sentenceId++}`;
    sentences.push({ ...s, id: newId });

    for (const c of sentenceConstraints) {
      constraints.push({
        ...c,
        id: `mc${constraintId++}`,
        source_sentence_id: newId,
      });
    }
  };

  // 1. Add identical sentences (from source, arbitrary choice)
  // 添加完全相同的句子（从 source 取，任意选择）
  // Note: identical sentences don't carry constraints in this structure
  // because they come directly from diff.identical which is just Sentence[]
  for (const s of prepared.identical) {
    sentences.push({ ...s, id: `m${sentenceId++}` });
  }

  // 2. Add resolved similar pairs
  // 添加已解决的相似句子对
  for (const pair of prepared.similarPairs) {
    if (!pair.resolution) {
      throw new Error(
        `Unresolved similar pair: "${pair.source.text}" vs "${pair.target.text}"`
      );
    }

    if (pair.resolution === 'source') {
      addSentence(pair.source, pair.sourceConstraints);
    } else {
      addSentence(pair.target, pair.targetConstraints);
    }
  }

  // 3. Add kept sentences from source-only
  // 添加保留的仅在 source 中的句子
  for (const candidate of prepared.onlyInSource) {
    if (candidate.keep) {
      addSentence(candidate.sentence, candidate.constraints);
    }
  }

  // 4. Add kept sentences from target-only
  // 添加保留的仅在 target 中的句子
  for (const candidate of prepared.onlyInTarget) {
    if (candidate.keep) {
      addSentence(candidate.sentence, candidate.constraints);
    }
  }

  // Build commit content
  // 构建 commit 内容
  const content: CommitContent = {
    sentences,
    constraints: constraints.length > 0 ? constraints : undefined,
  };

  const committedAt = new Date().toISOString();

  // Convert to V3 format for hash computation
  // 转换为 V3 格式以计算哈希
  const contentV3 = {
    sentences: sentences.map(convertSentenceToV3),
    constraints: constraints.length > 0 ? constraints.map(convertConstraintToV3) : [],
  };

  // Prepare data for hash computation (excludes hash field)
  // 准备用于计算哈希的数据（不包含 hash 字段）
  const commitDataV3 = {
    schema: 'commit/v3' as const,
    parents: [sourceCommitHash, targetCommitHash],
    author,
    committed_at: committedAt,
    content: contentV3,
  };

  const hash = computeCommitV3Hash(commitDataV3);

  // Return using old format (for compatibility with existing code)
  // 返回旧格式（与现有代码兼容）
  return {
    hash,
    schema: 'commit/v3' as const,
    parents: [sourceCommitHash, targetCommitHash],
    author,
    committed_at: committedAt,
    content,
    message,
    // Note: branch should be set by caller based on merge target
    // 注意：branch 应由调用者根据合并目标设置
  };
}
