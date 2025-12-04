/**
 * Embedding Provider Interface
 *
 * Defines the contract for all embedding providers (Google AI Studio, OpenAI, etc.)
 * Providers convert text into vector representations for semantic similarity.
 */
/**
 * Embedding provider interface
 *
 * All embedding providers must implement this interface.
 * The `id` and `dim` fields are used for vector source consistency checks.
 */
export interface EmbeddingProvider {
    /**
     * Unique identifier for this provider + model combination
     * Format: "{provider}:{model}"
     * Example: "google-ai:text-embedding-004"
     */
    readonly id: string;
    /**
     * Vector dimension output by this model
     * Example: 768 for text-embedding-004, 384 for MiniLM
     */
    readonly dim: number;
    /**
     * Encode texts into vector embeddings
     *
     * @param texts - Array of texts to encode
     * @returns Promise of 2D array where each inner array is a vector
     */
    encode(texts: string[]): Promise<number[][]>;
    /**
     * Calculate cosine similarity between two vectors
     *
     * @param vecA - First vector
     * @param vecB - Second vector
     * @returns Similarity score in range [0, 1] (or [-1, 1] depending on implementation)
     */
    similarity(vecA: number[], vecB: number[]): number;
}
/**
 * Error thrown when embedding provider is unavailable
 */
export declare class EmbeddingProviderError extends Error {
    readonly providerId: string;
    readonly cause?: Error | undefined;
    constructor(providerId: string, cause?: Error | undefined, message?: string);
}
/**
 * Calculate cosine similarity between two vectors
 * Utility function that can be used by all providers
 */
export declare function cosineSimilarity(vecA: number[], vecB: number[]): number;
//# sourceMappingURL=base.d.ts.map