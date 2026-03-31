/**
 * T3X Commit Types — Tree-Primary
 */

import type { SemanticContent } from '../semantic/types';

export const COMMIT_SCHEMA = 't3x/commit/1' as const;

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
  schema: typeof COMMIT_SCHEMA;
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
}

export interface CommitFirstClass {
  schema: typeof COMMIT_SCHEMA;
  parents: string[];
  author: Author;
  committed_at: string;
  content: SemanticContent;
}
