"use strict";
/**
 * Embedding Provider Interface
 *
 * Defines the contract for all embedding providers (Google AI Studio, OpenAI, etc.)
 * Providers convert text into vector representations for semantic similarity.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingProviderError = void 0;
exports.cosineSimilarity = cosineSimilarity;
/**
 * Error thrown when embedding provider is unavailable
 */
class EmbeddingProviderError extends Error {
    constructor(providerId, cause, message) {
        super(message ?? `Embedding provider "${providerId}" is unavailable`);
        this.providerId = providerId;
        this.cause = cause;
        this.name = 'EmbeddingProviderError';
    }
}
exports.EmbeddingProviderError = EmbeddingProviderError;
/**
 * Calculate cosine similarity between two vectors
 * Utility function that can be used by all providers
 */
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error(`Vector dimensions mismatch: ${vecA.length} vs ${vecB.length}`);
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
        return 0;
    }
    return dotProduct / denominator;
}
//# sourceMappingURL=base.js.map