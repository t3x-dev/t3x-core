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
import type { NLPProvider } from "../providers/nlp";
import { type RingOutput } from "./types";
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
        positive?: Array<{
            verb: string;
            polarity: 1;
            checkNegation: boolean;
        }>;
        negative?: Array<{
            verb: string;
            polarity: -1;
            checkNegation: boolean;
        }>;
    };
}
/**
 * Ring Extractor
 *
 * Converts NLP analysis results into the Ring 1/2/3 structure.
 */
export declare class RingExtractor {
    private readonly nlpProvider;
    private readonly polarityEngine;
    private readonly config;
    constructor(nlpProvider: NLPProvider, config?: ExtractorConfig);
    /**
     * Extract Ring 1/2/3 from text
     *
     * @param turnId - Unique identifier for this turn
     * @param content - Text content to analyze
     * @param language - Optional language code; if not provided, auto-detect
     * @returns Complete Ring output
     */
    extract(turnId: string, content: string, language?: string): Promise<RingOutput>;
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
    private extractRing1;
    /**
     * Extract Ring 2: Facets (轻关系)
     *
     * Contains:
     * - intent_seed: Intent seed (based on main verb)
     * - time_window: Time window (based on DATE entities)
     * - preference_soft: Soft preferences (based on polarity keywords)
     * - unknown_slot: Unknown slots (based on question words)
     */
    private extractRing2;
    /**
     * Extract Ring 3: Sentence structure (分句结构)
     */
    private extractRing3;
    /**
     * Build entity lookup map
     */
    private buildEntityMap;
    /**
     * Extract time anchor from DATE entities
     */
    private extractTimeAnchor;
    /**
     * Extract time window from DATE entities
     */
    private extractTimeWindow;
    /**
     * Extract intent seed from ROOT verb
     */
    private extractIntentSeed;
    /**
     * Map verb lemma to intent category
     */
    private mapVerbToIntent;
    /**
     * Extract unknown slots (question words)
     */
    private extractUnknownSlots;
}
/**
 * Factory function to create Ring Extractor
 */
export declare function createRingExtractor(nlpProvider: NLPProvider, config?: ExtractorConfig): RingExtractor;
//# sourceMappingURL=ringExtractor.d.ts.map