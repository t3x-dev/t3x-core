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
export class EmbeddingProviderError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly cause?: Error,
    message?: string
  ) {
    super(message ?? `Embedding provider "${providerId}" is unavailable`);
    this.name = 'EmbeddingProviderError';
  }
}

/**
 * Calculate cosine similarity between two vectors
 * Utility function that can be used by all providers
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
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
