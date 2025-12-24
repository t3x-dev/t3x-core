/**
 * Ring Extractor
 *
 * Extracts Ring 1/2/3 structure from text using NLP providers.
 * Based on ARCHITECTURE.zh.md specification:
 *
 * Ring 1 (主题主轴): keywords, lemmatization, polarity, entities, time_anchor, topic
 * Ring 2 (轻关系/Facet): intent_seed, time_window, preference_soft, unknown_slot
 * Ring 3 (分句结构): sentence segments
 */

import type {
  NLPProvider,
  NLPAnalysis,
  NLPToken,
  NLPEntity,
} from "../providers/nlp";
import {
  type RingOutput,
  type Ring1Output,
  type Ring2Output,
  type Ring3Output,
  type Keyword,
  type Facet,
  type Segment,
  type Polarity,
  createEmptyRingOutput,
} from "./types";
import {
  type PolarityRuleEngine,
  createPolarityRuleEngine,
} from "./polarityRules";

/**
 * Extractor configuration
 */
export interface ExtractorConfig {
  /**
   * POS tags to extract as keywords
   * @default ["NOUN", "PROPN", "VERB", "ADJ"]
   */
  keywordPosTags?: string[];

  /**
   * Minimum salience for entity inclusion
   * @default 0.01
   */
  minEntitySalience?: number;

  /**
   * Custom polarity rules
   */
  customPolarityRules?: {
    positive?: Array<{ verb: string; polarity: 1; checkNegation: boolean }>;
    negative?: Array<{ verb: string; polarity: -1; checkNegation: boolean }>;
  };
}

/**
 * Question word tags (for unknown_slot detection)
 * These map to WH-words in Penn Treebank / Universal Dependencies
 */
const QUESTION_WORD_LEMMAS = new Set([
  "what", "who", "whom", "whose", "which",
  "where", "when", "why", "how",
  "whichever", "whatever", "whoever",
]);

/**
 * Stop words to filter out from Ring extraction
 * These are common words that don't carry meaningful information
 */
const STOP_WORDS = new Set([
  // Pronouns
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves",
  "he", "him", "his", "himself", "she", "her", "hers", "herself",
  "it", "its", "itself", "they", "them", "their", "theirs", "themselves",
  // Common verbs that are too generic
  "be", "is", "am", "are", "was", "were", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing",
  "will", "would", "could", "should", "may", "might", "must", "shall",
  "can", "need",
  // Articles and determiners
  "a", "an", "the", "this", "that", "these", "those",
  // Prepositions
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "under", "again", "further", "then", "once",
  // Conjunctions
  "and", "but", "or", "nor", "so", "yet", "both", "either", "neither",
  // Adverbs
  "not", "no", "very", "just", "also", "only", "even", "still",
  "already", "always", "never", "ever", "often", "sometimes",
  // Indefinite pronouns (low-value)
  "something", "anything", "nothing", "everything",
  "someone", "anyone", "everyone", "nobody",
  "some", "any", "all", "each", "every", "both", "few", "more", "most",
  "other", "another", "such",
  // Numbers (generic)
  "one", "two", "three", "first", "second", "third",
  // Misc low-value words
  "thing", "things", "way", "ways", "time", "times",
  "lot", "lots", "much", "many", "little", "less", "least",
  "good", "great", "nice", "well", "better", "best",
  "new", "old", "big", "small", "long", "short",
  "come", "go", "get", "make", "take", "put", "give", "use",
  "say", "tell", "ask", "think", "know", "see", "look", "find",
  "want", "let", "try", "keep", "seem", "help", "show", "hear",
]);

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Omit<ExtractorConfig, "customPolarityRules">> = {
  keywordPosTags: ["NOUN", "PROPN", "VERB", "ADJ"],
  minEntitySalience: 0.01,
};

/**
 * Ring Extractor
 *
 * Converts NLP analysis results into the Ring 1/2/3 structure.
 */
export class RingExtractor {
  private readonly nlpProvider: NLPProvider;
  private readonly polarityEngine: PolarityRuleEngine;
  private readonly config: Required<Omit<ExtractorConfig, "customPolarityRules">>;

  constructor(nlpProvider: NLPProvider, config?: ExtractorConfig) {
    this.nlpProvider = nlpProvider;
    this.polarityEngine = createPolarityRuleEngine(config?.customPolarityRules);
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Extract Ring 1/2/3 from text
   *
   * @param turnId - Unique identifier for this turn
   * @param content - Text content to analyze
   * @param language - Optional language code; if not provided, auto-detect
   * @returns Complete Ring output
   */
  async extract(
    turnId: string,
    content: string,
    language?: string
  ): Promise<RingOutput> {
    // Handle empty content
    if (!content.trim()) {
      return createEmptyRingOutput(turnId);
    }

    // Analyze text with NLP provider
    const analysis = await this.nlpProvider.analyze(content, language);

    // Build Ring output
    const ring1 = this.extractRing1(analysis);
    const ring2 = this.extractRing2(analysis, ring1);
    const ring3 = this.extractRing3(analysis, content);

    return {
      turnId,
      ring1,
      ring2,
      ring3,
    };
  }

  /**
   * Extract Ring 1: Keyword axis (主题主轴)
   *
   * Contains:
   * 1. Keywords (nouns, verbs, adjectives, proper nouns)
   * 2. Lemmatization (词形归一)
   * 3. Polarity annotation (基于依赖树 + 规则引擎)
   * 4. Named entities
   * 5. Time anchor
   * 6. Topic
   */
  private extractRing1(analysis: NLPAnalysis): Ring1Output {
    const { tokens, entities } = analysis;

    // Extract preference relations using polarity rule engine
    const preferenceRelations = this.polarityEngine.extractPreferenceRelations(tokens);

    // Build polarity mapping: token index → polarity
    const polarityMap = new Map<number, Polarity>();
    for (const relation of preferenceRelations) {
      polarityMap.set(relation.objectToken.index, relation.polarity);
    }

    // Build entity lookup map for quick access
    const entityMap = this.buildEntityMap(entities);

    // Extract keywords from tokens
    const keywords: Keyword[] = [];
    const seenLemmas = new Set<string>();
    let topic: string | null = null;

    for (const token of tokens) {
      // Skip punctuation and unknown tags
      if (token.pos === "PUNCT" || token.pos === "X") {
        continue;
      }

      // Only keep configured POS tags
      if (!this.config.keywordPosTags.includes(token.pos)) {
        continue;
      }

      // Skip duplicates (by lemma)
      const lemmaKey = token.lemma.toLowerCase();
      if (seenLemmas.has(lemmaKey)) {
        continue;
      }

      // Skip stop words (low-value common words)
      if (STOP_WORDS.has(lemmaKey) || STOP_WORDS.has(token.text.toLowerCase())) {
        continue;
      }

      seenLemmas.add(lemmaKey);

      // Get polarity from polarity map
      const polarity = polarityMap.get(token.index) ?? 0;

      // Check if token is an entity
      const entity = entityMap.get(token.text.toLowerCase());
      const entityType = entity?.type ?? null;
      const confidence = entity?.salience ?? 1.0;

      // Extract topic (first NOUN/PROPN that is not a stop word)
      if (topic === null && (token.pos === "NOUN" || token.pos === "PROPN")) {
        // Skip generic nouns for topic
        if (!STOP_WORDS.has(lemmaKey)) {
          topic = lemmaKey;
        }
      }

      keywords.push({
        text: token.text,
        lemma: token.lemma.toLowerCase(),
        polarity,
        pos: token.pos,
        entityType,
        confidence,
      });
    }

    // Add entities that weren't captured as tokens
    for (const entity of entities) {
      if (entity.salience < this.config.minEntitySalience) {
        continue;
      }

      const lemmaKey = entity.text.toLowerCase();
      if (seenLemmas.has(lemmaKey)) {
        continue;
      }
      seenLemmas.add(lemmaKey);

      keywords.push({
        text: entity.text,
        lemma: entity.text.toLowerCase(),
        polarity: 0,
        pos: "PROPN",
        entityType: entity.type,
        confidence: entity.salience,
      });
    }

    // Extract time anchor from DATE entities
    const timeAnchor = this.extractTimeAnchor(entities);

    // Extract preference keywords (polarity != 0)
    const preferenceKeywords = keywords.filter((kw) => kw.polarity !== 0);

    return {
      keywords,
      timeAnchor,
      topic,
      preferenceKeywords,
    };
  }

  /**
   * Extract Ring 2: Facets (轻关系)
   *
   * Contains:
   * - intent_seed: Intent seed (based on main verb)
   * - time_window: Time window (based on DATE entities)
   * - preference_soft: Soft preferences (based on polarity keywords)
   * - unknown_slot: Unknown slots (based on question words)
   */
  private extractRing2(analysis: NLPAnalysis, ring1: Ring1Output): Ring2Output {
    const facets: Facet[] = [];
    const { tokens, entities } = analysis;

    // 1. Intent Seed (based on ROOT verb)
    const intentSeed = this.extractIntentSeed(tokens);
    if (intentSeed) {
      facets.push({
        facetType: "intent_seed",
        key: "intent",
        value: intentSeed,
        confidence: 0.9,
      });
    }

    // 2. Time Window (based on Ring 1's time_anchor or DATE entities)
    const timeWindow = this.extractTimeWindow(entities, ring1.timeAnchor);
    if (timeWindow) {
      facets.push({
        facetType: "time_window",
        key: "time",
        value: timeWindow,
        confidence: 0.8,
      });
    }

    // 3. Preference Soft (based on Ring 1's preference keywords)
    for (const kw of ring1.preferenceKeywords) {
      if (kw.polarity === 1) {
        facets.push({
          facetType: "preference_soft",
          key: "prefer",
          value: kw.lemma,
          confidence: 0.7,
        });
      } else if (kw.polarity === -1) {
        facets.push({
          facetType: "preference_soft",
          key: "avoid",
          value: kw.lemma,
          confidence: 0.7,
        });
      }
    }

    // 4. Unknown Slot (based on question words)
    const unknownSlots = this.extractUnknownSlots(tokens);
    for (const slot of unknownSlots) {
      facets.push({
        facetType: "unknown_slot",
        key: "question",
        value: slot,
        confidence: 0.6,
      });
    }

    return { facets };
  }

  /**
   * Extract Ring 3: Sentence structure (分句结构)
   */
  private extractRing3(analysis: NLPAnalysis, originalText: string): Ring3Output {
    const { sentences } = analysis;

    // If no sentences from NLP, fallback to simple splitting
    if (sentences.length === 0) {
      return {
        segments: [
          {
            segmentId: "s-1",
            text: originalText.trim(),
            startChar: 0,
            endChar: originalText.length,
          },
        ],
      };
    }

    const segments: Segment[] = sentences.map((sentence, index) => ({
      segmentId: `s-${index + 1}`,
      text: sentence.text,
      startChar: sentence.beginOffset,
      endChar: sentence.endOffset,
    }));

    return { segments };
  }

  /**
   * Build entity lookup map
   */
  private buildEntityMap(entities: NLPEntity[]): Map<string, NLPEntity> {
    const entityMap = new Map<string, NLPEntity>();
    for (const entity of entities) {
      const key = entity.text.toLowerCase();
      // Keep the entity with highest salience
      if (!entityMap.has(key) || entity.salience > (entityMap.get(key)?.salience ?? 0)) {
        entityMap.set(key, entity);
      }
    }
    return entityMap;
  }

  /**
   * Extract time anchor from DATE entities
   */
  private extractTimeAnchor(entities: NLPEntity[]): string | null {
    const dateEntities = entities.filter(
      (e) => e.type === "DATE" || e.type === "TIME"
    );
    if (dateEntities.length === 0) {
      return null;
    }

    // Return the most salient date entity
    const sorted = [...dateEntities].sort((a, b) => b.salience - a.salience);
    return sorted[0].text;
  }

  /**
   * Extract time window from DATE entities
   */
  private extractTimeWindow(entities: NLPEntity[], timeAnchor: string | null): string | null {
    // Use time anchor if available
    if (timeAnchor) {
      return timeAnchor;
    }

    const dateEntities = entities.filter((e) => e.type === "DATE");
    if (dateEntities.length === 0) {
      return null;
    }

    if (dateEntities.length === 1) {
      return dateEntities[0].text;
    }

    // If multiple dates, create a range
    const texts = dateEntities.map((e) => e.text);
    return texts.join(" to ");
  }

  /**
   * Extract intent seed from ROOT verb
   */
  private extractIntentSeed(tokens: NLPToken[]): string | null {
    // Find ROOT verb
    const rootVerbs = tokens.filter(
      (t) => t.pos === "VERB" && t.dependencyLabel === "ROOT"
    );

    if (rootVerbs.length === 0) {
      // Fallback: find first verb
      const firstVerb = tokens.find((t) => t.pos === "VERB");
      if (firstVerb) {
        return this.mapVerbToIntent(firstVerb.lemma.toLowerCase());
      }
      return null;
    }

    const rootVerb = rootVerbs[0];
    return this.mapVerbToIntent(rootVerb.lemma.toLowerCase());
  }

  /**
   * Map verb lemma to intent category
   */
  private mapVerbToIntent(verbLemma: string): string {
    const intentMap: Record<string, string> = {
      // Request/desire
      want: "request",
      need: "request",
      require: "request",
      // Preference
      like: "preference",
      prefer: "preference",
      love: "preference",
      enjoy: "preference",
      // Planning
      plan: "planning",
      schedule: "planning",
      arrange: "planning",
      // Booking
      book: "booking",
      reserve: "booking",
      // Search
      find: "search",
      search: "search",
      look: "search",
      seek: "search",
      // Comparison
      compare: "comparison",
      // Purchase
      buy: "purchase",
      purchase: "purchase",
      order: "purchase",
      // Assistance
      help: "assistance",
      assist: "assistance",
      // Inquiry
      know: "inquiry",
      ask: "inquiry",
      wonder: "inquiry",
      understand: "inquiry",
      // Travel
      travel: "travel",
      visit: "travel",
      go: "travel",
      fly: "travel",
    };

    return intentMap[verbLemma] ?? verbLemma;
  }

  /**
   * Extract unknown slots (question words)
   */
  private extractUnknownSlots(tokens: NLPToken[]): string[] {
    const slots: string[] = [];

    for (const token of tokens) {
      const lemma = token.lemma.toLowerCase();
      if (QUESTION_WORD_LEMMAS.has(lemma)) {
        slots.push(token.text);
      }
    }

    return slots;
  }
}

/**
 * Factory function to create Ring Extractor
 */
export function createRingExtractor(
  nlpProvider: NLPProvider,
  config?: ExtractorConfig
): RingExtractor {
  return new RingExtractor(nlpProvider, config);
}
