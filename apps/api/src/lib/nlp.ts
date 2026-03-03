/**
 * NLP Provider for Ring Extraction
 *
 * Uses Google Cloud Natural Language API when GOOGLE_CLOUD_NLP_KEY is set.
 * Falls back to local Intl.Segmenter-based provider for development without GCP.
 */

import { createGoogleCloudNLPProvider, createLocalNLPProvider, type NLPProvider } from '@t3x/core';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { pinoLogger } from '../middleware/logger';

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
 * Uses Google Cloud NLP when GOOGLE_CLOUD_NLP_KEY is set.
 * Falls back to local Intl.Segmenter-based provider otherwise.
 */
export function getNLPProvider(): NLPProvider {
  if (!nlpProvider) {
    const googleApiKey = process.env.GOOGLE_CLOUD_NLP_KEY;

    if (googleApiKey) {
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      pinoLogger.info({ proxy: proxyUrl || undefined }, 'using Google Cloud NLP provider');
      nlpProvider = createGoogleCloudNLPProvider(googleApiKey, {
        fetch: getProxyFetch(),
      });
    } else {
      pinoLogger.info('GOOGLE_CLOUD_NLP_KEY not set, using local NLP provider (Intl.Segmenter)');
      nlpProvider = createLocalNLPProvider();
    }
  }
  return nlpProvider;
}
