/**
 * Google AI Studio Embedding Provider
 *
 * Uses Google's Generative AI API (Gemini) for text embeddings.
 * API Reference: https://ai.google.dev/api/embeddings
 */

import {
  EmbeddingProvider,
  EmbeddingProviderError,
  cosineSimilarity,
} from "./base";

const GOOGLE_AI_EMBEDDING_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

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
        "google-ai",
        undefined,
        "Google AI Studio API key is required. Set GOOGLE_AI_STUDIO_KEY environment variable or config field."
      );
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? "text-embedding-004";
    this.timeout = config.timeout ?? 30000;

    this.id = `google-ai:${this.model}`;

    // Model dimensions
    // text-embedding-004: 768 dimensions
    // text-embedding-005: 768 dimensions (if available)
    this.dim = 768;
  }

  async encode(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      // Google AI supports batch embedding
      const embeddings = await Promise.all(
        texts.map((text) => this.embedSingle(text))
      );
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
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Google AI API error (${response.status}): ${errorBody}`
        );
      }

      const data = (await response.json()) as GoogleAIEmbedResponse;

      if (!data.embedding?.values) {
        throw new Error("Invalid response: missing embedding values");
      }

      return data.embedding.values;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }
}

/**
 * Google AI API response types
 */
interface GoogleAIEmbedResponse {
  embedding: {
    values: number[];
  };
}

/**
 * Factory function to create Google AI Embedding Provider
 */
export function createGoogleAIEmbeddingProvider(
  config: GoogleAIEmbeddingConfig
): EmbeddingProvider {
  return new GoogleAIEmbeddingProvider(config);
}
