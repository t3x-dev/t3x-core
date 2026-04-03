/**
 * Embedder Module
 *
 * Provides embedding provider for semantic validation.
 * Uses Google AI Studio's text-embedding-004 model.
 *
 * Configuration:
 * - GOOGLE_AI_STUDIO_KEY: Required for semantic validation
 */

import { createGoogleAIEmbeddingProvider, type EmbeddingProvider } from '@t3x-dev/core';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { pinoLogger } from '../middleware/logger';

function getProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    return (url: string | URL | Request, options?: RequestInit) =>
      undiciFetch(
        url as string,
        { ...options, dispatcher: agent } as Parameters<typeof undiciFetch>[1]
      ) as Promise<Response>;
  }
  return undefined;
}

// Singleton embedder instance (lazy initialization)
let embedderInstance: EmbeddingProvider | null = null;
let initialized = false;

/**
 * Check if semantic validation is configured.
 *
 * @returns true if GOOGLE_AI_STUDIO_KEY is set
 */
export function isSemanticValidationConfigured(): boolean {
  return !!process.env.GOOGLE_AI_STUDIO_KEY;
}

/**
 * Get the embedder instance for semantic validation.
 *
 * Returns null if GOOGLE_AI_STUDIO_KEY is not configured.
 * Uses lazy initialization - embedder is created on first call.
 *
 * @returns EmbeddingProvider instance or null if not configured
 */
export function getEmbedder(): EmbeddingProvider | null {
  if (initialized) {
    return embedderInstance;
  }

  const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!apiKey) {
    initialized = true;
    return null;
  }

  try {
    const proxyFetch = getProxyFetch();
    embedderInstance = createGoogleAIEmbeddingProvider({
      apiKey,
      ...(proxyFetch && { fetch: proxyFetch }),
    });
    initialized = true;
    pinoLogger.info({ embedder_id: embedderInstance.id }, 'initialized Google AI embedder');
    return embedderInstance;
  } catch (err) {
    pinoLogger.error({ err }, 'failed to initialize embedder');
    initialized = true;
    return null;
  }
}
