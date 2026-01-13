/**
 * Commit-related Type Definitions
 *
 * Types for semantic commit structures and sentence-level data.
 */

/**
 * Source reference for a sentence
 * Tracks where the sentence originated from
 * 句子来源引用 - 追踪句子的原始出处
 */
export interface SentenceSource {
  /** Type of source (e.g., 'conversation', 'turn') */
  type: string;
  /** Source identifier */
  id: string;
}

/**
 * A sentence extracted from a commit
 *
 * Represents a semantic unit with its source reference and confidence score.
 * 从 commit 中提取的句子 - 表示一个语义单元
 */
export interface Sentence {
  /** Unique sentence ID (句子唯一标识符) */
  id: string;
  /** Sentence text content (句子文本内容) */
  text: string;
  /** Confidence score [0, 1] (置信度分数) */
  confidence: number;
  /** Source reference (来源引用) */
  source: SentenceSource;
}

/**
 * A constraint extracted from sentences
 *
 * Constraints are requirements or exclusions tied to specific sentences.
 * 约束 - 从句子中提取的要求或排除条件
 */
export interface Constraint {
  /** Unique constraint ID (约束唯一标识符) */
  id: string;
  /** ID of the sentence this constraint belongs to (关联的句子ID) */
  source_sentence_id: string;
  /** Constraint type: 'require', 'exclude', etc. (约束类型) */
  type: string;
  /** Constraint value, e.g., '$3000', '30 days' (约束值) */
  value: string;
  /** Confidence score [0, 1] (置信度分数) */
  confidence: number;
  /** Optional match text from extraction (可选的匹配文本) */
  match?: string;
}

/**
 * Author information for a commit
 * 提交作者信息
 */
export interface CommitAuthor {
  /** Author name (作者名称) */
  name: string;
  /** Author identity, e.g., email (作者身份标识，如邮箱) */
  identity: string;
  /** Verification status (验证状态) */
  verification?: 'verified' | 'unverified';
}

/**
 * Content of a commit
 * 提交内容
 */
export interface CommitContent {
  /** Sentences in this commit (句子列表) */
  sentences: Sentence[];
  /** Constraints tied to sentences (约束列表，与句子关联) */
  constraints?: Constraint[];
}

/**
 * CommitV3 - Version 3 commit structure with multi-parent support
 *
 * Supports merge commits with multiple parents.
 * Hash is computed from JCS-canonicalized JSON of the commit data.
 * CommitV3 - 第三版提交结构，支持多父节点（用于合并）
 */
export interface CommitV3 {
  /** Commit hash (SHA-256 of canonicalized data) (提交哈希) */
  hash: string;
  /** Schema version identifier (schema 版本标识) */
  schema: 'commit/v3';
  /** Parent commit hashes (supports merge with 2+ parents) (父提交哈希列表) */
  parents: string[];
  /** Author information (作者信息) */
  author: CommitAuthor;
  /** Commit timestamp in ISO8601 format (提交时间) */
  committed_at: string;
  /** Commit content (提交内容) */
  content: CommitContent;
  /** Commit message (提交消息) */
  message: string;
  /** Branch name (optional, set by caller) (分支名称，可选) */
  branch?: string;
}
