/**
 * Shared commit-adjacent metadata types.
 *
 * The tree-primary commit object model and hash surface were removed in the CommitV2
 * hard cutover. Keep these generic metadata shapes here for fixtures and
 * product projections that do not depend on that retired object.
 */

export interface Author {
  type: 'human' | 'agent' | 'system';
  id?: string;
  name?: string;
}

export interface Provenance {
  method: 'llm_extraction' | 'human_curation' | 'import' | 'merge' | 'squash' | 'fixture_replay';
  model?: string;
  extracted_at?: string;
  /** Explicit human confirmation used to commit despite validation review blockers. */
  validation_override?: {
    kind: 'schema_review';
    reason: string;
    blockers: string[];
  };
  /** For squash/rebase: the original commit hashes that were replaced */
  source_commits?: string[];
  /** Schema contract pinned by the workspace that produced this commit. */
  schema_ref?: {
    name: string;
    version?: string;
    hash?: string;
  };
}
