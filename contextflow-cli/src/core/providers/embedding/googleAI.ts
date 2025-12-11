/**
 * Google AI Studio Embedding Provider
 *
 * Uses Google's Generative AI API (Gemini) for text embeddings.
 * API Reference: https://ai.google.dev/api/embeddings
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const undici = require("undici");
import {
  EmbeddingProvider,
  EmbeddingProviderError,
  cosineSimilarity,
} from "@contextflow/core";

const GOOGLE_AI_EMBEDDING_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Get proxy URL from environment variables
 */
function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

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

    // Setup proxy if available
    const proxyUrl = getProxyUrl();
    const dispatcher = proxyUrl ? new undici.ProxyAgent(proxyUrl) : undefined;

    try {
      const { statusCode, body } = await undici.request(url, {
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
        bodyTimeout: this.timeout,
        headersTimeout: this.timeout,
        dispatcher,
      });

      const responseText = await body.text();

      if (statusCode !== 200) {
        throw new Error(
          `Google AI API error (${statusCode}): ${responseText}`
        );
      }

      const data = JSON.parse(responseText) as GoogleAIEmbedResponse;

      if (!data.embedding?.values) {
        throw new Error("Invalid response: missing embedding values");
      }

      return data.embedding.values;
    } catch (error) {
      if (error instanceof Error && error.message.includes("timeout")) {
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
