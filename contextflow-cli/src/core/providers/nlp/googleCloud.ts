/**
 * Google Cloud NLP Provider
 *
 * Uses Google Cloud Natural Language API for text analysis.
 * API Reference: https://cloud.google.com/natural-language/docs/reference/rest
 *
 * Supports:
 * - Entity recognition (Ring 1: entities, time_anchor)
 * - Syntax analysis with dependency parsing (Ring 1: keywords, lemma, polarity)
 * - Sentiment analysis
 * - Sentence segmentation (Ring 3)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const undici = require("undici");
import {
  NLPProvider,
  NLPProviderError,
  NLPAnalysis,
  NLPToken,
  NLPEntity,
  NLPSentence,
  normalizePosTag,
  normalizeDependencyLabel,
} from "@contextflow/core";

const GOOGLE_CLOUD_NLP_URL =
  "https://language.googleapis.com/v1/documents:annotateText";

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
 * Configuration options for Google Cloud NLP Provider
 */
export interface GoogleCloudNLPConfig {
  /**
   * Google Cloud API key
   * Get one at: https://console.cloud.google.com/apis/credentials
   * Enable "Cloud Natural Language API" in your project
   */
  apiKey: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
}

/**
 * Google Cloud NLP Provider
 *
 * Provides entity recognition, sentiment analysis, syntax analysis with dependency tree.
 */
export class GoogleCloudNLPProvider implements NLPProvider {
  readonly id = "google-cloud-nlp";

  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: GoogleCloudNLPConfig) {
    if (!config.apiKey) {
      throw new NLPProviderError(
        "google-cloud-nlp",
        undefined,
        "Google Cloud NLP API key is required. Set GOOGLE_CLOUD_NLP_KEY environment variable or config field."
      );
    }

    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
  }

  async analyze(text: string, language?: string): Promise<NLPAnalysis> {
    if (!text.trim()) {
      // Return empty analysis for empty text
      return {
        language: language ?? "en",
        sentiment: { score: 0, magnitude: 0 },
        tokens: [],
        entities: [],
        sentences: [],
      };
    }

    const url = `${GOOGLE_CLOUD_NLP_URL}?key=${this.apiKey}`;

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
          document: {
            type: "PLAIN_TEXT",
            content: text,
            // If language specified, use it; otherwise let API auto-detect
            ...(language && { language }),
          },
          features: {
            extractSyntax: true,        // For tokens, POS, dependency tree
            extractEntities: true,       // For named entities
            extractDocumentSentiment: true, // For sentiment
          },
          encodingType: "UTF8",
        }),
        bodyTimeout: this.timeout,
        headersTimeout: this.timeout,
        dispatcher,
      });

      const responseText = await body.text();

      if (statusCode !== 200) {
        throw new Error(
          `Google Cloud NLP API error (${statusCode}): ${responseText}`
        );
      }

      const data = JSON.parse(responseText) as GoogleCloudNLPResponse;

      return this.transformResponse(data, text, language);
    } catch (error) {
      throw new NLPProviderError(
        this.id,
        error instanceof Error ? error : undefined,
        `Failed to analyze text: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Transform Google Cloud NLP response to our standard format
   */
  private transformResponse(
    data: GoogleCloudNLPResponse,
    originalText: string,
    requestedLanguage?: string
  ): NLPAnalysis {
    // Extract language (use detected or requested)
    const detectedLanguage = data.language ?? requestedLanguage ?? "en";

    // Transform sentiment
    const sentiment = {
      score: data.documentSentiment?.score ?? 0,
      magnitude: data.documentSentiment?.magnitude ?? 0,
    };

    // Transform tokens with dependency tree
    const tokens: NLPToken[] = (data.tokens ?? []).map((token, index) => {
      const beginOffset = token.text?.beginOffset ?? 0;
      const tokenText = token.text?.content ?? "";

      return {
        index,
        text: tokenText,
        lemma: token.lemma ?? tokenText,
        pos: normalizePosTag(token.partOfSpeech?.tag ?? "UNKNOWN"),
        tag: token.partOfSpeech?.tag,
        beginOffset,
        endOffset: beginOffset + tokenText.length,
        // Dependency edge
        headIndex: token.dependencyEdge?.headTokenIndex ?? -1,
        dependencyLabel: normalizeDependencyLabel(
          token.dependencyEdge?.label ?? "UNKNOWN"
        ),
      };
    });

    // Transform entities
    const entities: NLPEntity[] = (data.entities ?? []).map((entity) => ({
      text: entity.name ?? "",
      type: this.normalizeEntityType(entity.type ?? "UNKNOWN"),
      salience: entity.salience ?? 0,
      beginOffset: entity.mentions?.[0]?.text?.beginOffset,
      endOffset: entity.mentions?.[0]?.text?.beginOffset !== undefined
        ? entity.mentions[0].text.beginOffset + (entity.mentions[0].text.content?.length ?? 0)
        : undefined,
    }));

    // Transform sentences
    const sentences: NLPSentence[] = (data.sentences ?? []).map((sentence) => {
      const beginOffset = sentence.text?.beginOffset ?? 0;
      const sentenceText = sentence.text?.content ?? "";

      return {
        text: sentenceText,
        sentiment: sentence.sentiment?.score ?? 0,
        beginOffset,
        endOffset: beginOffset + sentenceText.length,
      };
    });

    return {
      language: detectedLanguage,
      sentiment,
      tokens,
      entities,
      sentences,
    };
  }

  /**
   * Normalize Google Cloud entity types to standard types
   */
  private normalizeEntityType(type: string): string {
    const typeMap: Record<string, string> = {
      PERSON: "PERSON",
      LOCATION: "GPE",
      ORGANIZATION: "ORG",
      EVENT: "EVENT",
      WORK_OF_ART: "WORK_OF_ART",
      CONSUMER_GOOD: "PRODUCT",
      OTHER: "OTHER",
      UNKNOWN: "OTHER",
      PHONE_NUMBER: "PHONE",
      ADDRESS: "ADDRESS",
      DATE: "DATE",
      NUMBER: "NUMBER",
      PRICE: "MONEY",
    };

    return typeMap[type] ?? type;
  }
}

/**
 * Google Cloud NLP API response types
 */
interface GoogleCloudNLPResponse {
  language?: string;
  documentSentiment?: {
    score?: number;
    magnitude?: number;
  };
  tokens?: Array<{
    text?: {
      content?: string;
      beginOffset?: number;
    };
    partOfSpeech?: {
      tag?: string;
      aspect?: string;
      case?: string;
      form?: string;
      gender?: string;
      mood?: string;
      number?: string;
      person?: string;
      proper?: string;
      reciprocity?: string;
      tense?: string;
      voice?: string;
    };
    dependencyEdge?: {
      headTokenIndex?: number;
      label?: string;
    };
    lemma?: string;
  }>;
  entities?: Array<{
    name?: string;
    type?: string;
    salience?: number;
    mentions?: Array<{
      text?: {
        content?: string;
        beginOffset?: number;
      };
      type?: string;
    }>;
    metadata?: Record<string, string>;
  }>;
  sentences?: Array<{
    text?: {
      content?: string;
      beginOffset?: number;
    };
    sentiment?: {
      score?: number;
      magnitude?: number;
    };
  }>;
}

/**
 * Factory function to create Google Cloud NLP Provider
 */
export function createGoogleCloudNLPProvider(
  config: GoogleCloudNLPConfig
): NLPProvider {
  return new GoogleCloudNLPProvider(config);
}
