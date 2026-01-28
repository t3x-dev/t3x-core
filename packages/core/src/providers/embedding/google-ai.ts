/**
 * Google AI Studio Embedding Provider
 *
 * Uses the gemini-embedding-001 model by default (768 dimensions).
 */

import { cosineSimilarity, type EmbeddingProvider, EmbeddingProviderError } from './base';

const GOOGLE_AI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Configuration options for Google AI Studio Embedding Provider
 */
export interface GoogleAIEmbeddingConfig {
  /**
   * Google AI Studio API key
   * Get one at: https://aistudio.google.com/app/apikey
   */
  apiKey: string;

  /**
   * Model to use for embeddings
   * @default "gemini-embedding-001"
   */
  model?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Custom fetch function (for proxy support)
   * If not provided, uses global fetch
   */
  fetch?: typeof fetch;
}

interface GoogleAIBatchEmbedResponse {
  embeddings: Array<{
    values: number[];
  }>;
}

/**
 * Google AI Studio Embedding Provider
 *
 * Uses the gemini-embedding-001 model by default (768 dimensions).
 */
export class GoogleAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: GoogleAIEmbeddingConfig) {
    if (!config.apiKey) {
      throw new EmbeddingProviderError(
        'google-ai',
        undefined,
        'Google AI Studio API key is required. Set GOOGLE_AI_STUDIO_KEY environment variable.'
      );
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gemini-embedding-001';
    this.timeout = config.timeout ?? 30000;
    this.fetchFn = config.fetch ?? globalThis.fetch;

    this.id = `google-ai:${this.model}`;

    // Model dimensions
    // gemini-embedding-001: 768 dimensions
    this.dim = 768;
  }

  async encode(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // Google AI API limits batch to 100 requests
      const BATCH_SIZE = 100;
      if (texts.length <= BATCH_SIZE) {
        return await this.embedBatch(texts);
      }

      // Split into chunks and process sequentially
      const results: number[][] = [];
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const chunk = texts.slice(i, i + BATCH_SIZE);
        const embeddings = await this.embedBatch(chunk);
        results.push(...embeddings);
      }
      return results;
    } catch (error) {
      throw new EmbeddingProviderError(
        this.id,
        error instanceof Error ? error : undefined,
        `Failed to encode texts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Embed multiple texts in a single batch request
   */
  private async embedBatch(texts: string[]): Promise<number[][]> {
    const url = `${GOOGLE_AI_EMBEDDING_URL}/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${this.model}`,
            content: {
              parts: [{ text }],
            },
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Google AI API error (${response.status}): ${responseText}`);
      }

      const data = JSON.parse(responseText) as GoogleAIBatchEmbedResponse;

      if (!data.embeddings || data.embeddings.length !== texts.length) {
        throw new Error('Invalid response: embeddings count mismatch');
      }

      return data.embeddings.map((e) => e.values);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  similarity(vecA: number[], vecB: number[]): number {
    return cosineSimilarity(vecA, vecB);
  }
}

/**
 * Factory function to create Google AI Embedding Provider
 */
export function createGoogleAIEmbeddingProvider(
  config: GoogleAIEmbeddingConfig
): EmbeddingProvider {
  return new GoogleAIEmbeddingProvider(config);
}
