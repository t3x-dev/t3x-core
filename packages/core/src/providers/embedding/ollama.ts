/**
 * Ollama Embedding Provider
 *
 * Implementation of EmbeddingProvider using Ollama's local embedding API.
 * No API key required — runs models locally.
 */

import { cosineSimilarity, type EmbeddingProvider, EmbeddingProviderError } from './base';

export interface OllamaEmbeddingConfig {
  model?: string;
  baseUrl?: string;
  dim?: number;
  timeout?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dim: number;

  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(config: OllamaEmbeddingConfig = {}) {
    this.model = config.model ?? 'nomic-embed-text';
    this.baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.dim = config.dim ?? 768;
    this.timeout = config.timeout ?? 30000;
    this.id = `ollama:${this.model}`;
  }

  async encode(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = [];
    // Ollama embedding API processes one text at a time
    for (const text of texts) {
      const embedding = await this.encodeOne(text);
      results.push(embedding);
    }
    return results;
  }

  similarity(vecA: number[], vecB: number[]): number {
    return cosineSimilarity(vecA, vecB);
  }

  private async encodeOne(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/api/embed`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: text,
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
        embeddings: number[][];
      };

      if (!data.embeddings?.[0]) {
        throw new EmbeddingProviderError(this.id, undefined, 'No embeddings in response');
      }

      return data.embeddings[0];
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

export function createOllamaEmbeddingProvider(
  config?: OllamaEmbeddingConfig
): OllamaEmbeddingProvider {
  return new OllamaEmbeddingProvider(config);
}
