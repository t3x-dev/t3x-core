/**
 * T3X Commit Types — Frame-Based Semantic Version Control
 *
 * Clean names, no version suffixes. The schema version string
 * in serialized data handles backward compatibility.
 */

import type { Frame, Relation, SemanticContent } from '../semantic/types';

// Re-export semantic types as part of the commit API
export type { Frame, Relation, SemanticContent };

// ── Schema ──

export const COMMIT_SCHEMA = 't3x/commit/5' as const;

// ── Author ──

export interface Author {
  type: 'human' | 'agent' | 'system';
  id?: string;
  name?: string;
}

// ── Source ──

export interface Source {
  type: 'conversation' | 'import' | 'leaf';
  id: string;
  title?: string;
}

// ── Provenance ──

export interface Provenance {
  method: 'llm_extraction' | 'human_curation' | 'import' | 'merge';
  model?: string;
  extracted_at?: string;
}

// ── Commit ──

export interface Commit {
  // ── Identity ──
  hash: string;
  schema: typeof COMMIT_SCHEMA;

  // ── First-class (in hash) ──
  parents: string[];
  author: Author;
  committed_at: string;
  content: SemanticContent;

  // ── Second-class (not in hash) ──
  project_id: string;
  message: string | null;
  branch: string;
  sources: Source[] | null;
  provenance: Provenance | null;
  position_x?: number;
  position_y?: number;
}

/**
 * First-class fields only — used for hash computation.
 */
export interface CommitFirstClass {
  schema: typeof COMMIT_SCHEMA;
  parents: string[];
  author: Author;
  committed_at: string;
  content: SemanticContent;
}
