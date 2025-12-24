/**
 * NLP Provider Interface
 *
 * Defines the contract for all NLP providers (Google Cloud NLP, etc.)
 * Providers analyze text and return linguistic annotations.
 *
 * Based on ARCHITECTURE.zh.md Ring 1-3 requirements:
 * - Ring 1: keywords, lemmatization, polarity, entities, time_anchor
 * - Ring 2: intent_seed, time_window, preference_soft, unknown_slot
 * - Ring 3: sentence segmentation
 */
/**
 * Dependency edge label (for polarity analysis)
 */
export type DependencyLabel = "ROOT" | "NSUBJ" | "DOBJ" | "POBJ" | "IOBJ" | "ATTR" | "ACOMP" | "XCOMP" | "CCOMP" | "NEG" | "ADVMOD" | "AUX" | "AUXPASS" | "PREP" | "DET" | "AMOD" | "NN" | "CONJ" | "CC" | "MARK" | "PUNCT" | "P" | "UNKNOWN";
/**
 * Token from NLP analysis with dependency parsing
 */
export interface NLPToken {
    /** Token index in document */
    index: number;
    /** Original text */
    text: string;
    /** Lemmatized form (词形归一) */
    lemma: string;
    /** Part-of-speech tag (Universal Dependencies) */
    pos: string;
    /** Detailed POS tag (if available) */
    tag?: string;
    /** Character offset start */
    beginOffset: number;
    /** Character offset end */
    endOffset: number;
    /** Dependency edge: index of head token (-1 for root) */
    headIndex: number;
    /** Dependency label (e.g., NSUBJ, DOBJ, NEG) */
    dependencyLabel: DependencyLabel | string;
}
/**
 * Named entity from NLP analysis
 */
export interface NLPEntity {
    /** Entity text */
    text: string;
    /** Entity type (PERSON, LOCATION, ORGANIZATION, DATE, etc.) */
    type: string;
    /** Salience score [0, 1] */
    salience: number;
    /** Character offset start */
    beginOffset?: number;
    /** Character offset end */
    endOffset?: number;
}
/**
 * Sentence from NLP analysis
 */
export interface NLPSentence {
    /** Sentence text */
    text: string;
    /** Sentence-level sentiment score [-1, 1] */
    sentiment: number;
    /** Character offset start */
    beginOffset: number;
    /** Character offset end */
    endOffset: number;
}
/**
 * Complete NLP analysis result
 */
export interface NLPAnalysis {
    /** Detected or specified language code (e.g., "en", "zh") */
    language: string;
    /** Document-level sentiment */
    sentiment: {
        /** Sentiment score [-1, 1] (negative to positive) */
        score: number;
        /** Sentiment magnitude [0, inf) (strength of emotion) */
        magnitude: number;
    };
    /** Extracted tokens with linguistic annotations and dependency tree */
    tokens: NLPToken[];
    /** Named entities */
    entities: NLPEntity[];
    /** Sentence segmentation */
    sentences: NLPSentence[];
}
/**
 * NLP Provider interface
 *
 * All NLP providers must implement this interface.
 */
export interface NLPProvider {
    /**
     * Unique identifier for this provider
     * Example: "google-cloud-nlp"
     */
    readonly id: string;
    /**
     * Analyze text and return linguistic annotations
     *
     * @param text - Text to analyze
     * @param language - Optional language code. If not provided, auto-detect.
     * @returns Promise of NLP analysis result
     */
    analyze(text: string, language?: string): Promise<NLPAnalysis>;
}
/**
 * Error thrown when NLP provider is unavailable
 */
export declare class NLPProviderError extends Error {
    readonly providerId: string;
    readonly cause?: Error | undefined;
    constructor(providerId: string, cause?: Error | undefined, message?: string);
}
/**
 * Map provider-specific POS tags to Universal Dependencies tags
 */
export declare const POS_TAG_MAPPING: Record<string, string>;
/**
 * Normalize POS tag to Universal Dependencies format
 */
export declare function normalizePosTag(tag: string): string;
/**
 * Normalize dependency label
 */
export declare function normalizeDependencyLabel(label: string): DependencyLabel | string;
//# sourceMappingURL=base.d.ts.map