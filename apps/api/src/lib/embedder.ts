/**
 * Embedder Module
 *
 * Provides embedding provider for semantic validation.
 * Uses Google AI Studio's text-embedding-004 model.
 *
 * Configuration:
 * - GOOGLE_AI_STUDIO_KEY: Required for semantic validation
 */

import { createGoogleAIEmbeddingProvider, type EmbeddingProvider } from '@t3x/core';

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
    embedderInstance = createGoogleAIEmbeddingProvider({ apiKey });
    initialized = true;
    console.log(`[embedder] Initialized Google AI embedder (${embedderInstance.id})`);
    return embedderInstance;
  } catch (err) {
    console.error('[embedder] Failed to initialize:', err);
    initialized = true;
    return null;
  }
}
