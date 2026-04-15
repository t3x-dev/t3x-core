/**
 * T3X Commit Types — Tree-Primary
 */

import type { SemanticContent } from '../semantic/types';

export const COMMIT_SCHEMA = 't3x/commit' as const;

/**
 * Historical schema strings that may appear on commits written by older code.
 *
 * `schema` is a first-class (hashed) field, so rewriting it in-memory would
 * invalidate the stored hash. We read whatever the row contains and verify
 * against it. New commits always use `COMMIT_SCHEMA`.
 *
 * Audit 2026-04-15, B-8. See docs/audits/2026-04-15/B-bucket-issues/
 * diagnosis-B-8-hash-mismatch.md.
 */
export const LEGACY_COMMIT_SCHEMAS = ['t3x/commit', 't3x/commit/1'] as const;
export type CommitSchemaTag = (typeof LEGACY_COMMIT_SCHEMAS)[number];

export interface Author {
  type: 'human' | 'agent' | 'system';
  id?: string;
  name?: string;
}

export interface Provenance {
  method: 'llm_extraction' | 'human_curation' | 'import' | 'merge' | 'squash';
  model?: string;
  extracted_at?: string;
  /** For squash/rebase: the original commit hashes that were replaced */
  source_commits?: string[];
}

export interface Commit {
  // first-class (in hash)
  hash: string;
  schema: CommitSchemaTag;
  parents: string[];
  author: Author;
  committed_at: string;
  content: SemanticContent;
  // second-class (not in hash)
  project_id: string;
  message: string | null;
  branch: string;
  provenance: Provenance | null;
  /** YOps log entry IDs that produced this commit (second-class, not in hash) */
  yops_log_ids: string[];
  /** Source references (conversations, imports, leaves that contributed) */
  sources?: Array<{ type: 'conversation' | 'import' | 'leaf'; id: string; title?: string }> | null;
}

export interface CommitFirstClass {
  schema: CommitSchemaTag;
  parents: string[];
  author: Author;
  committed_at: string;
  content: SemanticContent;
}
