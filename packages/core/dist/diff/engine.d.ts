/**
 * Semantic Diff Engine
 *
 * Three-way semantic diff engine implementation.
 * Migrated from Python core/diff/engine.py
 *
 * Algorithm (from docs/ARCHITECTURE.zh.md):
 * 1. Take each sentence sA_i from reference version A, encode vector emb(sA_i)
 * 2. Take the full text of target version B and encode Emb(B)
 * 3. Calculate cosine(emb(sA_i), Emb(B)), if above threshold → "same", otherwise → "different/added"
 */
import { EmbeddingProvider } from "../providers/embedding";
import { DiffResult, DiffSegment } from "./types";
/**
 * Diff engine configuration
 */
export interface DiffEngineConfig {
    /**
     * Similarity threshold for considering segments as "same"
     * @default 0.70
     */
    threshold?: number;
}
/**
 * Semantic Diff Engine
 *
 * Supports two scenarios:
 * 1. Two-way diff (Commit Diff / Draft self-check)
 * 2. Three-way diff (Merge preview with conflict detection)
 */
export declare class DiffEngine {
    private readonly embeddingProvider;
    private readonly threshold;
    constructor(embeddingProvider: EmbeddingProvider, config?: DiffEngineConfig);
    /**
     * Get the embedding provider ID (for vector source consistency checks)
     */
    get providerId(): string;
    /**
     * Two-way diff (Commit Diff / Draft self-check)
     *
     * Scenario: Perform semantic diff between current Draft (version A) and parent Commit (version B).
     *
     * @param baseId - Base version ID
     * @param baseSegments - List of segments from base version
     * @param targetId - Target version ID
     * @param targetSegments - List of segments from target version
     * @returns DiffResult
     */
    diffTwoWay(baseId: string, baseSegments: DiffSegment[], targetId: string, targetSegments: DiffSegment[]): Promise<DiffResult>;
    /**
     * Three-way diff (Merge preview with conflict detection)
     *
     * Scenario: Merge Source Branch to Target Branch based on common ancestor Base.
     *
     * Algorithm:
     * 1. For each base segment b_i:
     *    - Find best match s_j in source (similarity sim_s)
     *    - Find best match t_k in target (similarity sim_t)
     * 2. Classify:
     *    - If sim_s >= threshold and sim_t >= threshold:
     *      * If s_j == t_k (same text) → SAME
     *      * If s_j != t_k → CONFLICT
     *    - If sim_s >= threshold and sim_t < threshold → source kept → take source
     *    - If sim_s < threshold and sim_t >= threshold → target kept → take target
     *    - If sim_s < threshold and sim_t < threshold → both deleted → REMOVED
     * 3. Check unmatched segments in source/target → ADDED
     *
     * @param baseId - Common ancestor version ID
     * @param baseSegments - Segments from common ancestor
     * @param sourceId - Source Branch version ID
     * @param sourceSegments - Segments from Source Branch
     * @param targetId - Target Branch version ID
     * @param targetSegments - Segments from Target Branch
     * @returns DiffResult with conflict detection
     */
    diffThreeWay(baseId: string, baseSegments: DiffSegment[], sourceId: string, sourceSegments: DiffSegment[], targetId: string, targetSegments: DiffSegment[]): Promise<DiffResult>;
    /**
     * Calculate similarity matrix and find best match for each base segment
     */
    private computeMatches;
    /**
     * Get text for specified segment ID
     */
    private getSegmentText;
    /**
     * Create empty diff result
     */
    private createEmptyResult;
}
/**
 * Factory function to create Diff Engine
 */
export declare function createDiffEngine(embeddingProvider: EmbeddingProvider, config?: DiffEngineConfig): DiffEngine;
//# sourceMappingURL=engine.d.ts.map