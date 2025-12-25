/**
 * Merge Type Definitions
 *
 * Types for three-way merge operations.
 */

/**
 * Conflict type enumeration
 */
export enum ConflictType {
  /** Both sides edited the same facet with different values */
  DIVERGENT_EDIT = "divergent_edit",
  /** Source deleted, target modified */
  DELETE_MODIFY = "delete_modify",
  /** Source modified, target deleted */
  MODIFY_DELETE = "modify_delete",
}

/**
 * Source of merged content
 */
export type MergeSource = "base" | "source" | "target" | "llm" | "manual";

/**
 * Input facet for merge operation
 */
export interface MergeFacet {
  /** Facet unique identifier (for tracking) */
  id?: string;
  /** Facet name/identifier (key for merge matching) */
  facet?: string;
  /** Facet type for grouping (e.g., "menu_item", "constraint") */
  type?: string;
  /** Facet text content */
  text: string | null;
  /** Associated keywords */
  keywords?: string[];
  /** Confidence score (0-1) for prioritizing during conflicts */
  confidence?: number;
}

/**
 * Auto-merged facet result
 */
export interface AutoMergedFacet {
  /** Facet name */
  facet: string;
  /** Merged text content */
  mergedText: string | null;
  /** Source of the merged content */
  source: MergeSource;
  /** Associated keywords */
  keywords: string[];
}

/**
 * Merge conflict
 */
export interface MergeConflict {
  /** Facet name */
  facet: string;
  /** Base version text */
  baseText: string | null;
  /** Source branch text */
  sourceText: string | null;
  /** Target branch text */
  targetText: string | null;
  /** Type of conflict */
  conflictType: ConflictType;
}

/**
 * Merge result
 */
export interface MergeResult {
  /** Auto-merged facets (no conflicts) */
  autoMerged: AutoMergedFacet[];
  /** Conflicts requiring manual resolution */
  conflicts: MergeConflict[];
  /** Merge status */
  status: "clean" | "conflicts";
  /** Statistics */
  stats: MergeStats;
}

/**
 * Merge statistics
 */
export interface MergeStats {
  /** Total number of facets processed */
  totalFacets: number;
  /** Number of auto-merged facets */
  autoMergedCount: number;
  /** Number of conflicts */
  conflictCount: number;
  /** Number of conflicts resolved by LLM */
  llmResolvedCount: number;
  /** Breakdown by source */
  bySource: {
    base: number;
    source: number;
    target: number;
    llm: number;
    manual: number;
  };
}
