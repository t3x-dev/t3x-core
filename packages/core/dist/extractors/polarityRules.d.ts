/**
 * Polarity Rule Engine
 *
 * Annotates keywords with polarity (-1/0/+1) based on dependency parsing + rule tables.
 * Ported from Python: t3x-core/core/extractors/polarity_rules.py
 *
 * Rules:
 * 1. Positive verbs (want/prefer/need/like/should) + no negation → +1
 * 2. Negative verbs (dislike/reject/avoid/hate/cannot) → -1
 * 3. Positive verbs + negation modifier (don't want / not like) → -1
 * 4. Other cases → 0 (neutral)
 *
 * Does not use sentiment dictionaries (VADER/SentiWordNet), ensuring determinism.
 */
import type { NLPToken } from "../providers/nlp";
import type { Polarity } from "./types";
/**
 * Polarity rule entry
 */
export interface PolarityRule {
    /** Verb lemma */
    verb: string;
    /** Base polarity */
    polarity: Polarity;
    /** Whether to check for negation modifier */
    checkNegation: boolean;
}
/**
 * Preference relation extracted from text
 */
export interface PreferenceRelation {
    /** Verb token */
    verbToken: NLPToken;
    /** Object token */
    objectToken: NLPToken;
    /** Computed polarity */
    polarity: Polarity;
}
/**
 * Polarity Rule Engine
 *
 * Loads rule tables and annotates keywords with polarity based on dependency parsing.
 */
export declare class PolarityRuleEngine {
    private readonly positiveVerbs;
    private readonly negativeVerbs;
    constructor(customRules?: {
        positive?: PolarityRule[];
        negative?: PolarityRule[];
    });
    /**
     * Get polarity for a keyword based on its governing verb
     *
     * @param objectToken - The object token (keyword)
     * @param verbToken - The governing verb token
     * @param tokens - All tokens in the document (for negation lookup)
     * @returns Polarity value (-1, 0, or 1)
     */
    getPolarity(objectToken: NLPToken, verbToken: NLPToken, tokens: NLPToken[]): Polarity;
    /**
     * Check if a verb token has a negation modifier
     *
     * @param verbToken - The verb token to check
     * @param tokens - All tokens in the document
     * @returns True if negation modifier is present
     */
    private hasNegation;
    /**
     * Extract (verb, object, polarity) triples from tokens
     *
     * Traverses dependency tree to find opinion/preference-related verbs and their objects.
     *
     * @param tokens - All tokens from NLP analysis
     * @returns List of preference relations
     */
    extractPreferenceRelations(tokens: NLPToken[]): PreferenceRelation[];
    /**
     * Check if a verb is a polarity verb (positive or negative)
     */
    isPolarityVerb(lemma: string): boolean;
    /**
     * Get all registered polarity verbs
     */
    getPolarityVerbs(): {
        positive: string[];
        negative: string[];
    };
}
/**
 * Create a new PolarityRuleEngine instance
 */
export declare function createPolarityRuleEngine(customRules?: {
    positive?: PolarityRule[];
    negative?: PolarityRule[];
}): PolarityRuleEngine;
//# sourceMappingURL=polarityRules.d.ts.map