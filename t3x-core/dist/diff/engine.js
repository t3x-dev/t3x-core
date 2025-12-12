"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiffEngine = void 0;
exports.createDiffEngine = createDiffEngine;
const types_1 = require("./types");
const DEFAULT_THRESHOLD = 0.70;
/**
 * Semantic Diff Engine
 *
 * Supports two scenarios:
 * 1. Two-way diff (Commit Diff / Draft self-check)
 * 2. Three-way diff (Merge preview with conflict detection)
 */
class DiffEngine {
    constructor(embeddingProvider, config) {
        this.embeddingProvider = embeddingProvider;
        this.threshold = config?.threshold ?? DEFAULT_THRESHOLD;
    }
    /**
     * Get the embedding provider ID (for vector source consistency checks)
     */
    get providerId() {
        return this.embeddingProvider.id;
    }
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
    async diffTwoWay(baseId, baseSegments, targetId, targetSegments) {
        // Handle empty inputs
        if (baseSegments.length === 0 && targetSegments.length === 0) {
            return this.createEmptyResult(baseId, targetId);
        }
        // 1. Encode all segments
        const baseTexts = baseSegments.map((seg) => seg.text);
        const targetTexts = targetSegments.map((seg) => seg.text);
        const [baseVecs, targetVecs] = await Promise.all([
            baseTexts.length > 0 ? this.embeddingProvider.encode(baseTexts) : [],
            targetTexts.length > 0 ? this.embeddingProvider.encode(targetTexts) : [],
        ]);
        // 2. Calculate similarity matrix and find best matches
        const matches = this.computeMatches(baseSegments, baseVecs, targetSegments, targetVecs);
        // 3. Generate diff result
        const segmentDiffs = [];
        const targetMatchedIds = new Set();
        // Check each segment in base
        for (const baseSeg of baseSegments) {
            const bestMatch = matches.get(baseSeg.segmentId);
            if (bestMatch && bestMatch.matched) {
                // Found match
                targetMatchedIds.add(bestMatch.targetSegmentId);
                // Get matched target text
                const matchedSeg = targetSegments.find((s) => s.segmentId === bestMatch.targetSegmentId);
                const diffType = bestMatch.similarity >= this.threshold
                    ? types_1.DiffType.SAME
                    : types_1.DiffType.MODIFIED;
                segmentDiffs.push({
                    segmentId: baseSeg.segmentId,
                    text: baseSeg.text,
                    diffType,
                    similarity: bestMatch.similarity,
                    matchedSegmentId: bestMatch.targetSegmentId,
                    matchedText: matchedSeg?.text,
                });
            }
            else {
                // No match found → removed
                segmentDiffs.push({
                    segmentId: baseSeg.segmentId,
                    text: baseSeg.text,
                    diffType: types_1.DiffType.REMOVED,
                });
            }
        }
        // Check unmatched segments in target (added)
        for (const targetSeg of targetSegments) {
            if (!targetMatchedIds.has(targetSeg.segmentId)) {
                segmentDiffs.push({
                    segmentId: targetSeg.segmentId,
                    text: targetSeg.text,
                    diffType: types_1.DiffType.ADDED,
                });
            }
        }
        return {
            baseId,
            targetId,
            segmentDiffs,
            threshold: this.threshold,
            stats: (0, types_1.calculateDiffStats)(segmentDiffs),
        };
    }
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
    async diffThreeWay(baseId, baseSegments, sourceId, sourceSegments, targetId, targetSegments) {
        // 1. Encode all segments
        const baseTexts = baseSegments.map((seg) => seg.text);
        const sourceTexts = sourceSegments.map((seg) => seg.text);
        const targetTexts = targetSegments.map((seg) => seg.text);
        const [baseVecs, sourceVecs, targetVecs] = await Promise.all([
            baseTexts.length > 0 ? this.embeddingProvider.encode(baseTexts) : [],
            sourceTexts.length > 0 ? this.embeddingProvider.encode(sourceTexts) : [],
            targetTexts.length > 0 ? this.embeddingProvider.encode(targetTexts) : [],
        ]);
        // 2. Calculate similarity matrices
        const baseToSource = this.computeMatches(baseSegments, baseVecs, sourceSegments, sourceVecs);
        const baseToTarget = this.computeMatches(baseSegments, baseVecs, targetSegments, targetVecs);
        // 3. Generate three-way diff result
        const segmentDiffs = [];
        const sourceMatchedIds = new Set();
        const targetMatchedIds = new Set();
        for (const baseSeg of baseSegments) {
            const sourceMatch = baseToSource.get(baseSeg.segmentId);
            const targetMatch = baseToTarget.get(baseSeg.segmentId);
            const sourceMatched = sourceMatch?.matched ?? false;
            const targetMatched = targetMatch?.matched ?? false;
            if (sourceMatched && targetMatched) {
                // Both sides kept
                sourceMatchedIds.add(sourceMatch.targetSegmentId);
                targetMatchedIds.add(targetMatch.targetSegmentId);
                // Check for conflict
                const sourceText = this.getSegmentText(sourceMatch.targetSegmentId, sourceSegments);
                const targetText = this.getSegmentText(targetMatch.targetSegmentId, targetSegments);
                if (sourceText === targetText) {
                    // Same content → SAME
                    segmentDiffs.push({
                        segmentId: baseSeg.segmentId,
                        text: baseSeg.text,
                        diffType: types_1.DiffType.SAME,
                        similarity: Math.max(sourceMatch.similarity, targetMatch.similarity),
                        matchedSegmentId: sourceMatch.targetSegmentId,
                        matchedText: sourceText,
                    });
                }
                else {
                    // Different content → CONFLICT
                    segmentDiffs.push({
                        segmentId: baseSeg.segmentId,
                        text: baseSeg.text,
                        diffType: types_1.DiffType.CONFLICT,
                        similarity: (sourceMatch.similarity + targetMatch.similarity) / 2,
                        matchedSegmentId: `${sourceMatch.targetSegmentId}|${targetMatch.targetSegmentId}`,
                        matchedText: `SOURCE: ${sourceText}\nTARGET: ${targetText}`,
                    });
                }
            }
            else if (sourceMatched && !targetMatched) {
                // Source kept, Target deleted → take source
                sourceMatchedIds.add(sourceMatch.targetSegmentId);
                segmentDiffs.push({
                    segmentId: baseSeg.segmentId,
                    text: baseSeg.text,
                    diffType: types_1.DiffType.MODIFIED,
                    similarity: sourceMatch.similarity,
                    matchedSegmentId: sourceMatch.targetSegmentId,
                    matchedText: this.getSegmentText(sourceMatch.targetSegmentId, sourceSegments),
                });
            }
            else if (!sourceMatched && targetMatched) {
                // Source deleted, Target kept → take target
                targetMatchedIds.add(targetMatch.targetSegmentId);
                segmentDiffs.push({
                    segmentId: baseSeg.segmentId,
                    text: baseSeg.text,
                    diffType: types_1.DiffType.MODIFIED,
                    similarity: targetMatch.similarity,
                    matchedSegmentId: targetMatch.targetSegmentId,
                    matchedText: this.getSegmentText(targetMatch.targetSegmentId, targetSegments),
                });
            }
            else {
                // Both deleted → REMOVED
                segmentDiffs.push({
                    segmentId: baseSeg.segmentId,
                    text: baseSeg.text,
                    diffType: types_1.DiffType.REMOVED,
                });
            }
        }
        // 4. Check unmatched segments in source/target (added)
        for (const sourceSeg of sourceSegments) {
            if (!sourceMatchedIds.has(sourceSeg.segmentId)) {
                segmentDiffs.push({
                    segmentId: sourceSeg.segmentId,
                    text: sourceSeg.text,
                    diffType: types_1.DiffType.ADDED,
                });
            }
        }
        for (const targetSeg of targetSegments) {
            if (!targetMatchedIds.has(targetSeg.segmentId)) {
                segmentDiffs.push({
                    segmentId: targetSeg.segmentId,
                    text: targetSeg.text,
                    diffType: types_1.DiffType.ADDED,
                });
            }
        }
        return {
            baseId,
            targetId,
            sourceId,
            segmentDiffs,
            threshold: this.threshold,
            stats: (0, types_1.calculateDiffStats)(segmentDiffs),
        };
    }
    /**
     * Calculate similarity matrix and find best match for each base segment
     */
    computeMatches(baseSegments, baseVecs, targetSegments, targetVecs) {
        const matches = new Map();
        for (let i = 0; i < baseSegments.length; i++) {
            const baseSeg = baseSegments[i];
            const baseVec = baseVecs[i];
            let bestSimilarity = 0;
            let bestTargetIdx = -1;
            // Find highest similarity target segment
            for (let j = 0; j < targetSegments.length; j++) {
                const targetVec = targetVecs[j];
                const similarity = this.embeddingProvider.similarity(baseVec, targetVec);
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestTargetIdx = j;
                }
            }
            // Record best match
            if (bestTargetIdx >= 0) {
                matches.set(baseSeg.segmentId, {
                    sourceSegmentId: baseSeg.segmentId,
                    targetSegmentId: targetSegments[bestTargetIdx].segmentId,
                    similarity: bestSimilarity,
                    matched: bestSimilarity >= this.threshold,
                });
            }
        }
        return matches;
    }
    /**
     * Get text for specified segment ID
     */
    getSegmentText(segmentId, segments) {
        const seg = segments.find((s) => s.segmentId === segmentId);
        return seg?.text ?? "";
    }
    /**
     * Create empty diff result
     */
    createEmptyResult(baseId, targetId) {
        return {
            baseId,
            targetId,
            segmentDiffs: [],
            threshold: this.threshold,
            stats: {
                totalSegments: 0,
                sameCount: 0,
                addedCount: 0,
                removedCount: 0,
                modifiedCount: 0,
                conflictCount: 0,
            },
        };
    }
}
exports.DiffEngine = DiffEngine;
/**
 * Factory function to create Diff Engine
 */
function createDiffEngine(embeddingProvider, config) {
    return new DiffEngine(embeddingProvider, config);
}
//# sourceMappingURL=engine.js.map