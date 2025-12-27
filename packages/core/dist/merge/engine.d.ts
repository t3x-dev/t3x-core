/**
 * Three-Way Merge Engine
 *
 * Implements facet-based three-way merge algorithm.
 * Migrated from Python core_api/routes/merge.py
 *
 * Algorithm:
 * For each facet in base ∪ source ∪ target:
 * 1. Compare source vs base → source_changed
 * 2. Compare target vs base → target_changed
 * 3. Classify:
 *    - source_changed && target_changed && source != target → CONFLICT
 *    - source_changed → take source
 *    - target_changed → take target
 *    - neither changed → keep base
 */
import type { LLMProvider } from '../llm';
import { type MergeFacet, type MergeResult } from './types';
/**
 * Merge engine options
 */
export interface MergeEngineOptions {
    /** LLM provider for conflict resolution (optional) */
    llmProvider?: LLMProvider;
    /** Automatically resolve conflicts using LLM */
    autoResolveConflicts?: boolean;
}
/**
 * Three-Way Merge Engine
 *
 * Performs deterministic three-way merge on facet data.
 * Does not use embeddings - uses exact text comparison.
 * Optionally uses LLM to resolve conflicts.
 */
export declare class MergeEngine {
    private readonly llmProvider?;
    private readonly autoResolveConflicts;
    constructor(options?: MergeEngineOptions);
    /**
     * Execute three-way merge
     *
     * @param baseFacets - Facets from common ancestor
     * @param sourceFacets - Facets from source branch
     * @param targetFacets - Facets from target branch
     * @returns Merge result with auto-merged facets and conflicts
     */
    merge(baseFacets: MergeFacet[], sourceFacets: MergeFacet[], targetFacets: MergeFacet[]): Promise<MergeResult>;
    /**
     * Apply conflict resolution to merge result
     *
     * @param mergeResult - Original merge result with conflicts
     * @param resolutions - Map of facet name to resolved text
     * @returns Updated merge result with resolved conflicts
     */
    applyResolutions(mergeResult: MergeResult, resolutions: Map<string, string>): MergeResult;
    /**
     * Get the merge key for a facet
     * Priority: facet > id > type:text hash
     */
    private getFacetKey;
    /**
     * Build facet lookup map
     * Groups facets by key, with support for multiple matching strategies
     */
    private buildFacetMap;
    /**
     * Determine the type of conflict
     */
    private determineConflictType;
    /**
     * Calculate merge statistics
     */
    private calculateStats;
}
/**
 * Factory function to create Merge Engine
 */
export declare function createMergeEngine(options?: MergeEngineOptions): MergeEngine;
//# sourceMappingURL=engine.d.ts.map