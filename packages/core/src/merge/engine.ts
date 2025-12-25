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

import {
  type MergeFacet,
  type MergeResult,
  type AutoMergedFacet,
  type MergeConflict,
  ConflictType,
  type MergeStats,
} from "./types";
import type { LLMProvider } from "../llm";

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
export class MergeEngine {
  private readonly llmProvider?: LLMProvider;
  private readonly autoResolveConflicts: boolean;

  constructor(options?: MergeEngineOptions) {
    this.llmProvider = options?.llmProvider;
    this.autoResolveConflicts = options?.autoResolveConflicts ?? false;
  }

  /**
   * Execute three-way merge
   *
   * @param baseFacets - Facets from common ancestor
   * @param sourceFacets - Facets from source branch
   * @param targetFacets - Facets from target branch
   * @returns Merge result with auto-merged facets and conflicts
   */
  async merge(
    baseFacets: MergeFacet[],
    sourceFacets: MergeFacet[],
    targetFacets: MergeFacet[]
  ): Promise<MergeResult> {
    // Build lookup maps by key
    const baseMap = this.buildFacetMap(baseFacets);
    const sourceMap = this.buildFacetMap(sourceFacets);
    const targetMap = this.buildFacetMap(targetFacets);

    // Get all unique facet keys
    const allFacetKeys = new Set([
      ...baseMap.keys(),
      ...sourceMap.keys(),
      ...targetMap.keys(),
    ]);

    const autoMerged: AutoMergedFacet[] = [];
    const conflicts: MergeConflict[] = [];

    // Process each facet by key
    for (const facetKey of allFacetKeys) {
      const baseFacet = baseMap.get(facetKey);
      const sourceFacet = sourceMap.get(facetKey);
      const targetFacet = targetMap.get(facetKey);

      // Determine facet type for type-aware merging
      const facetType = baseFacet?.type ?? sourceFacet?.type ?? targetFacet?.type;

      const baseText = baseFacet?.text ?? null;
      const sourceText = sourceFacet?.text ?? null;
      const targetText = targetFacet?.text ?? null;

      // Determine change status
      const sourceChanged = sourceText !== baseText;
      const targetChanged = targetText !== baseText;

      if (sourceChanged && targetChanged && sourceText !== targetText) {
        // Both sides modified differently
        // For constraint types (like budget), this is a real conflict
        // For additive types (like menu_item), both can be kept
        if (facetType === "constraint") {
          // Real conflict for constraints - prefer higher confidence
          const sourceConf = sourceFacet?.confidence ?? 0.5;
          const targetConf = targetFacet?.confidence ?? 0.5;

          if (sourceConf > targetConf + 0.1) {
            // Source has significantly higher confidence
            autoMerged.push({
              facet: facetKey,
              mergedText: sourceText,
              source: "source",
              keywords: sourceFacet?.keywords ?? [],
            });
          } else if (targetConf > sourceConf + 0.1) {
            // Target has significantly higher confidence
            autoMerged.push({
              facet: facetKey,
              mergedText: targetText,
              source: "target",
              keywords: targetFacet?.keywords ?? [],
            });
          } else {
            // Similar confidence - real conflict
            conflicts.push({
              facet: facetKey,
              baseText,
              sourceText,
              targetText,
              conflictType: this.determineConflictType(baseText, sourceText, targetText),
            });
          }
        } else {
          // For non-constraint types, merge both versions
          autoMerged.push({
            facet: facetKey,
            mergedText: [sourceText, targetText].filter(Boolean).join("\n"),
            source: "target",
            keywords: [...(sourceFacet?.keywords ?? []), ...(targetFacet?.keywords ?? [])],
          });
        }
      } else if (sourceChanged) {
        // Only source modified → take source
        autoMerged.push({
          facet: facetKey,
          mergedText: sourceText,
          source: "source",
          keywords: sourceFacet?.keywords ?? [],
        });
      } else if (targetChanged) {
        // Only target modified → take target
        autoMerged.push({
          facet: facetKey,
          mergedText: targetText,
          source: "target",
          keywords: targetFacet?.keywords ?? [],
        });
      } else {
        // No change → keep base (if exists)
        if (baseText !== null) {
          autoMerged.push({
            facet: facetKey,
            mergedText: baseText,
            source: "base",
            keywords: baseFacet?.keywords ?? [],
          });
        }
      }
    }

    // Try to resolve conflicts with LLM if enabled
    let llmResolvedCount = 0;
    const remainingConflicts: MergeConflict[] = [];

    if (this.autoResolveConflicts && this.llmProvider && conflicts.length > 0) {
      for (const conflict of conflicts) {
        try {
          const resolved = await this.llmProvider.resolveConflict(
            conflict.baseText,
            conflict.sourceText,
            conflict.targetText
          );
          autoMerged.push({
            facet: conflict.facet,
            mergedText: resolved,
            source: "llm",
            keywords: [],
          });
          llmResolvedCount++;
        } catch {
          // LLM resolution failed, keep as conflict
          remainingConflicts.push(conflict);
        }
      }
    } else {
      remainingConflicts.push(...conflicts);
    }

    // Calculate statistics
    const stats = this.calculateStats(autoMerged, remainingConflicts, allFacetKeys.size, llmResolvedCount);

    return {
      autoMerged,
      conflicts: remainingConflicts,
      status: remainingConflicts.length > 0 ? "conflicts" : "clean",
      stats,
    };
  }

  /**
   * Apply conflict resolution to merge result
   *
   * @param mergeResult - Original merge result with conflicts
   * @param resolutions - Map of facet name to resolved text
   * @returns Updated merge result with resolved conflicts
   */
  applyResolutions(
    mergeResult: MergeResult,
    resolutions: Map<string, string>
  ): MergeResult {
    const remainingConflicts: MergeConflict[] = [];
    const additionalMerged: AutoMergedFacet[] = [];

    for (const conflict of mergeResult.conflicts) {
      const resolvedText = resolutions.get(conflict.facet);
      if (resolvedText !== undefined) {
        // Conflict resolved
        additionalMerged.push({
          facet: conflict.facet,
          mergedText: resolvedText,
          source: "manual",
          keywords: [],
        });
      } else {
        // Conflict unresolved
        remainingConflicts.push(conflict);
      }
    }

    const allMerged = [...mergeResult.autoMerged, ...additionalMerged];
    const stats = this.calculateStats(
      allMerged,
      remainingConflicts,
      allMerged.length + remainingConflicts.length,
      0
    );

    return {
      autoMerged: allMerged,
      conflicts: remainingConflicts,
      status: remainingConflicts.length > 0 ? "conflicts" : "clean",
      stats,
    };
  }

  /**
   * Get the merge key for a facet
   * Priority: facet > id > type:text hash
   */
  private getFacetKey(facet: MergeFacet): string {
    if (facet.facet) return facet.facet;
    if (facet.id) return facet.id;
    // Fallback: use type and first few words of text
    const textKey = facet.text?.toLowerCase().split(/\s+/).slice(0, 3).join("_") ?? "empty";
    return `${facet.type ?? "unknown"}:${textKey}`;
  }

  /**
   * Build facet lookup map
   * Groups facets by key, with support for multiple matching strategies
   */
  private buildFacetMap(facets: MergeFacet[]): Map<string, MergeFacet> {
    const map = new Map<string, MergeFacet>();
    for (const facet of facets) {
      const key = this.getFacetKey(facet);
      // If duplicate key, keep the one with higher confidence
      const existing = map.get(key);
      if (!existing || (facet.confidence ?? 0.5) > (existing.confidence ?? 0.5)) {
        map.set(key, facet);
      }
    }
    return map;
  }

  /**
   * Determine the type of conflict
   */
  private determineConflictType(
    baseText: string | null,
    sourceText: string | null,
    targetText: string | null
  ): ConflictType {
    if (sourceText === null && targetText !== null) {
      return ConflictType.DELETE_MODIFY;
    }
    if (sourceText !== null && targetText === null) {
      return ConflictType.MODIFY_DELETE;
    }
    return ConflictType.DIVERGENT_EDIT;
  }

  /**
   * Calculate merge statistics
   */
  private calculateStats(
    autoMerged: AutoMergedFacet[],
    conflicts: MergeConflict[],
    totalFacets: number,
    llmResolvedCount: number
  ): MergeStats {
    const bySource = { base: 0, source: 0, target: 0, llm: 0, manual: 0 };

    for (const merged of autoMerged) {
      bySource[merged.source]++;
    }

    return {
      totalFacets,
      autoMergedCount: autoMerged.length,
      conflictCount: conflicts.length,
      llmResolvedCount,
      bySource,
    };
  }
}

/**
 * Factory function to create Merge Engine
 */
export function createMergeEngine(options?: MergeEngineOptions): MergeEngine {
  return new MergeEngine(options);
}
