/**
 * Google AI Studio Embedding Provider
 *
 * Uses the text-embedding-004 model by default (768 dimensions).
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
   * @default "text-embedding-004"
   */
  model?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}

interface GoogleAIEmbedResponse {
  embedding: {
    values: number[];
  };
}

/**
 * Google AI Studio Embedding Provider
 *
 * Uses the text-embedding-004 model by default (768 dimensions).
 */
export class GoogleAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor(config: GoogleAIEmbeddingConfig) {
    if (!config.apiKey) {
      throw new EmbeddingProviderError(
        'google-ai',
        undefined,
        'Google AI Studio API key is required. Set GOOGLE_AI_STUDIO_KEY environment variable.'
      );
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-004';
    this.timeout = config.timeout ?? 30000;

    this.id = `google-ai:${this.model}`;

    // Model dimensions
    // text-embedding-004: 768 dimensions
    this.dim = 768;
  }

  async encode(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // Encode each text (could be optimized with batching)
      const embeddings = await Promise.all(texts.map((text) => this.embedSingle(text)));
      return embeddings;
    } catch (error) {
      throw new EmbeddingProviderError(
        this.id,
        error instanceof Error ? error : undefined,
        `Failed to encode texts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  similarity(vecA: number[], vecB: number[]): number {
    return cosineSimilarity(vecA, vecB);
  }

  /**
   * Embed a single text using Google AI Studio API
   */
  private async embedSingle(text: string): Promise<number[]> {
    const url = `${GOOGLE_AI_EMBEDDING_URL}/${this.model}:embedContent?key=${this.apiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: `models/${this.model}`,
          content: {
            parts: [{ text }],
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`Google AI API error (${response.status}): ${responseText}`);
      }

      const data = JSON.parse(responseText) as GoogleAIEmbedResponse;

      if (!data.embedding?.values) {
        throw new Error('Invalid response: missing embedding values');
      }

      return data.embedding.values;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
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
