/**
 * Google Cloud NLP Provider
 *
 * Implements NLPProvider interface using Google Cloud Natural Language API.
 * Provides high-quality linguistic analysis including:
 * - Tokenization with lemmatization
 * - Part-of-speech tagging
 * - Dependency parsing
 * - Named entity recognition
 * - Sentiment analysis
 *
 * NOTE: Sentence segmentation uses rule-based splitter (`splitSentencesRuleBased`),
 * NOT Google NLP's sentence boundaries. This provides more stable and controllable results.
 *
 * @see https://cloud.google.com/natural-language/docs/reference/rest
 * @see docs/specification/ring-schema.md for mapping guidelines
 */

import type { NLPAnalysis, NLPEntity, NLPProvider, NLPSentence, NLPToken } from './base';
import { NLPProviderError, normalizeDependencyLabel, normalizePosTag } from './base';
import { splitSentencesRuleBased } from './sentenceRules';

/**
 * Google Cloud NLP API response types
 */
interface GoogleToken {
  text: { content: string; beginOffset: number };
  partOfSpeech: { tag: string };
  dependencyEdge: { headTokenIndex: number; label: string };
  lemma: string;
}

interface GoogleEntity {
  name: string;
  type: string;
  salience: number;
  mentions?: Array<{
    text: { content: string; beginOffset: number };
    type: string;
  }>;
}

interface GoogleSentence {
  text: { content: string; beginOffset: number };
  sentiment?: { score: number; magnitude: number };
}

interface GoogleAnalyzeResponse {
  language?: string;
  documentSentiment?: { score: number; magnitude: number };
  tokens?: GoogleToken[];
  entities?: GoogleEntity[];
  sentences?: GoogleSentence[];
}

/**
 * Custom fetch function type
 */
export type CustomFetch = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * Configuration for Google Cloud NLP Provider
 */
export interface GoogleCloudNLPConfig {
  /**
   * Google Cloud API key
   * Required for authentication
   */
  apiKey: string;

  /**
   * API endpoint URL
   * @default 'https://language.googleapis.com/v1'
   */
  endpoint?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Custom fetch function (for proxy support)
   * If not provided, uses global fetch
   */
  fetch?: CustomFetch;
}

/**
 * Google Cloud NLP Provider
 *
 * Uses Google Cloud Natural Language API for high-quality NLP analysis.
 */
export class GoogleCloudNLPProvider implements NLPProvider {
  readonly id = 'google-cloud-nlp';

  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly customFetch: CustomFetch;

  constructor(config: GoogleCloudNLPConfig) {
    if (!config.apiKey) {
      throw new NLPProviderError(
        'google-cloud-nlp',
        undefined,
        'API key is required for Google Cloud NLP'
      );
    }

    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint ?? 'https://language.googleapis.com/v1';
    this.timeout = config.timeout ?? 30000;
    this.customFetch = config.fetch ?? globalThis.fetch;
  }

  /**
   * Analyze text using Google Cloud Natural Language API
   *
   * Calls annotateText with all features enabled:
   * - extractSyntax (tokens, sentences)
   * - extractEntities
   * - extractDocumentSentiment
   */
  async analyze(text: string, language?: string): Promise<NLPAnalysis> {
    if (!text.trim()) {
      return this.emptyAnalysis(language ?? 'en');
    }

    try {
      const response = await this.callAnnotateText(text, language);
      return this.mapResponse(response, text);
    } catch (error) {
      if (error instanceof NLPProviderError) {
        throw error;
      }
      throw new NLPProviderError(
        'google-cloud-nlp',
        error instanceof Error ? error : undefined,
        `Google Cloud NLP API call failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Call Google Cloud NLP annotateText API
   */
  private async callAnnotateText(text: string, language?: string): Promise<GoogleAnalyzeResponse> {
    const url = `${this.endpoint}/documents:annotateText?key=${this.apiKey}`;

    const requestBody = {
      document: {
        type: 'PLAIN_TEXT',
        content: text,
        ...(language && { language }),
      },
      features: {
        extractSyntax: true,
        extractEntities: true,
        extractDocumentSentiment: true,
      },
      encodingType: 'UTF8',
    };

    // Use fetch with AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const fetchOptions: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      };

      const response = await this.customFetch(url, fetchOptions);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new NLPProviderError(
          'google-cloud-nlp',
          undefined,
          `API returned ${response.status}: ${errorBody}`
        );
      }

      return (await response.json()) as GoogleAnalyzeResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Map Google Cloud NLP response to NLPAnalysis
   *
   * @see docs/specification/ring-schema.md for mapping guidelines
   */
  private mapResponse(response: GoogleAnalyzeResponse, originalText: string): NLPAnalysis {
    // Map tokens
    const tokens: NLPToken[] = (response.tokens ?? []).map((token, index) => ({
      index,
      text: token.text.content,
      lemma: token.lemma,
      pos: normalizePosTag(token.partOfSpeech.tag),
      tag: token.partOfSpeech.tag,
      beginOffset: token.text.beginOffset,
      endOffset: token.text.beginOffset + token.text.content.length,
      headIndex: token.dependencyEdge.headTokenIndex,
      dependencyLabel: normalizeDependencyLabel(token.dependencyEdge.label),
    }));

    // Map entities
    const entities: NLPEntity[] = (response.entities ?? []).map((entity) => {
      // Find the first mention to get offset
      const firstMention = entity.mentions?.[0];
      return {
        text: entity.name,
        type: this.normalizeEntityType(entity.type),
        salience: entity.salience,
        beginOffset: firstMention?.text.beginOffset,
        endOffset: firstMention
          ? firstMention.text.beginOffset + firstMention.text.content.length
          : undefined,
      };
    });

    // Use rule-based segmentation (ignore Google sentence boundaries).
    const sentences: NLPSentence[] = splitSentencesRuleBased(originalText);

    // Document sentiment
    const sentiment = {
      score: response.documentSentiment?.score ?? 0,
      magnitude: response.documentSentiment?.magnitude ?? 0,
    };

    return {
      language: response.language ?? 'en',
      sentiment,
      tokens,
      entities,
      sentences,
    };
  }

  /**
   * Normalize Google Cloud NLP entity types
   *
   * Google uses types like LOCATION, PERSON, ORGANIZATION, EVENT, etc.
   * We keep most as-is but normalize some for consistency.
   */
  private normalizeEntityType(type: string): string {
    const mapping: Record<string, string> = {
      LOCATION: 'GPE', // Geographic/Political Entity
      ADDRESS: 'GPE',
      CONSUMER_GOOD: 'PRODUCT',
      WORK_OF_ART: 'WORK_OF_ART',
      OTHER: 'MISC',
      UNKNOWN: 'MISC',
    };
    return mapping[type] ?? type;
  }

  /**
   * Return empty analysis for empty input
   */
  private emptyAnalysis(language: string): NLPAnalysis {
    return {
      language,
      sentiment: { score: 0, magnitude: 0 },
      tokens: [],
      entities: [],
      sentences: [],
    };
  }
}

/**
 * Factory function to create Google Cloud NLP Provider
 *
 * @param apiKey - Google Cloud API key
 * @param options - Additional configuration options
 */
export function createGoogleCloudNLPProvider(
  apiKey: string,
  options?: Omit<GoogleCloudNLPConfig, 'apiKey'>
): GoogleCloudNLPProvider {
  return new GoogleCloudNLPProvider({ apiKey, ...options });
}
