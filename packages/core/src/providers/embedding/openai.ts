/**
 * OpenAI Embedding Provider
 *
 * Implementation of EmbeddingProvider using OpenAI's Embeddings API.
 */

import { cosineSimilarity, type EmbeddingProvider, EmbeddingProviderError } from './base';

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
 * Fetch with proxy support
 */
async function fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    const { ProxyAgent, fetch: undiciFetch } = await import('undici');
    const response = await undiciFetch(url, {
      ...options,
      dispatcher: new ProxyAgent(proxyUrl),
    } as Parameters<typeof undiciFetch>[1]);
    return response as unknown as Response;
  }
  return fetch(url, options);
}

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
  timeout?: number;
}

const MAX_BATCH_SIZE = 2048;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: OpenAIEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'text-embedding-3-small';
    this.dim = config.dimensions ?? 1536;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.timeout = config.timeout ?? 30000;
    this.id = `openai:${this.model}`;
  }

  async encode(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const allEmbeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const batchResult = await this.encodeBatch(batch);
      allEmbeddings.push(...batchResult);
    }

    return allEmbeddings;
  }

  similarity(vecA: number[], vecB: number[]): number {
    return cosineSimilarity(vecA, vecB);
  }

  private async encodeBatch(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/embeddings`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          dimensions: this.dim,
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new EmbeddingProviderError(
          this.id,
          new Error(`API request failed: ${response.status} ${responseText}`)
        );
      }

      const data = JSON.parse(responseText) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Sort by index to ensure correct order
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    } catch (error) {
      if (error instanceof EmbeddingProviderError) throw error;
      throw new EmbeddingProviderError(
        this.id,
        error instanceof Error ? error : new Error(String(error)),
        `Embedding request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createOpenAIEmbeddingProvider(
  config: OpenAIEmbeddingConfig
): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider(config);
}
