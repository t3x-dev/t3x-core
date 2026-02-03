/**
 * NLP Provider for Ring Extraction
 *
 * Uses Google Cloud Natural Language API for high-quality analysis.
 * GOOGLE_CLOUD_NLP_KEY is required - no fallback provider.
 */

import { createGoogleCloudNLPProvider, type NLPProvider } from '@t3x/core';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

/**
 * Create a proxy-aware fetch function
 */
function getProxyFetch() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const agent = new ProxyAgent(proxyUrl);
    return (url: string, options?: RequestInit) =>
      undiciFetch(url, { ...options, dispatcher: agent } as Parameters<
        typeof undiciFetch
      >[1]) as Promise<Response>;
  }
  return fetch;
}

/**
 * Singleton instance
 */
let nlpProvider: NLPProvider | null = null;

/**
 * Get the NLP provider instance
 *
 * Requires GOOGLE_CLOUD_NLP_KEY to be set.
 * Throws error if not configured - no fallback to SimpleNLPProvider.
 */
export function getNLPProvider(): NLPProvider {
  if (!nlpProvider) {
    const googleApiKey = process.env.GOOGLE_CLOUD_NLP_KEY;

    if (!googleApiKey) {
      throw new Error(
        '[nlp] GOOGLE_CLOUD_NLP_KEY is not set. ' +
          'Google Cloud NLP is required for Ring extraction. ' +
          'Set the environment variable in .env file.'
      );
    }

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    console.log(
      `[nlp] Using Google Cloud NLP provider${proxyUrl ? ` (via proxy: ${proxyUrl})` : ''}`
    );
    nlpProvider = createGoogleCloudNLPProvider(googleApiKey, {
      fetch: getProxyFetch(),
    });
  }
  return nlpProvider;
}
