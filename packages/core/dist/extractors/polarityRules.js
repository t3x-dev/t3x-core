"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolarityRuleEngine = void 0;
exports.createPolarityRuleEngine = createPolarityRuleEngine;
/**
 * Default polarity rules
 */
const DEFAULT_POLARITY_RULES = {
    // Positive verbs (with negation check)
    positive: [
        { verb: "want", polarity: 1, checkNegation: true },
        { verb: "prefer", polarity: 1, checkNegation: true },
        { verb: "need", polarity: 1, checkNegation: true },
        { verb: "like", polarity: 1, checkNegation: true },
        { verb: "love", polarity: 1, checkNegation: true },
        { verb: "enjoy", polarity: 1, checkNegation: true },
        { verb: "should", polarity: 1, checkNegation: true },
        { verb: "must", polarity: 1, checkNegation: true },
        { verb: "hope", polarity: 1, checkNegation: true },
        { verb: "wish", polarity: 1, checkNegation: true },
        { verb: "plan", polarity: 1, checkNegation: true },
        { verb: "intend", polarity: 1, checkNegation: true },
    ],
    // Negative verbs (no negation check needed, already negative)
    negative: [
        { verb: "dislike", polarity: -1, checkNegation: false },
        { verb: "hate", polarity: -1, checkNegation: false },
        { verb: "avoid", polarity: -1, checkNegation: false },
        { verb: "reject", polarity: -1, checkNegation: false },
        { verb: "refuse", polarity: -1, checkNegation: false },
        { verb: "cannot", polarity: -1, checkNegation: false },
        { verb: "can't", polarity: -1, checkNegation: false },
        { verb: "won't", polarity: -1, checkNegation: false },
        { verb: "wouldn't", polarity: -1, checkNegation: false },
    ],
};
/**
 * Negation markers (for dependency tree lookup)
 */
const NEGATION_MARKERS = new Set([
    "not", "n't", "never", "no", "none", "nobody", "nothing", "neither",
    "nor", "nowhere", "hardly", "scarcely", "barely"
]);
/**
 * Object dependency labels (direct/indirect objects)
 */
const OBJECT_DEP_LABELS = new Set([
    "DOBJ", "POBJ", "ATTR", "OPRD", "IOBJ", "XCOMP", "CCOMP", "ACOMP"
]);
/**
 * Polarity Rule Engine
 *
 * Loads rule tables and annotates keywords with polarity based on dependency parsing.
 */
class PolarityRuleEngine {
    constructor(customRules) {
        const rules = {
            positive: customRules?.positive ?? DEFAULT_POLARITY_RULES.positive,
            negative: customRules?.negative ?? DEFAULT_POLARITY_RULES.negative,
        };
        // Build fast lookup indexes
        this.positiveVerbs = new Map(rules.positive.map((rule) => [rule.verb, rule]));
        this.negativeVerbs = new Map(rules.negative.map((rule) => [rule.verb, rule]));
    }
    /**
     * Get polarity for a keyword based on its governing verb
     *
     * @param objectToken - The object token (keyword)
     * @param verbToken - The governing verb token
     * @param tokens - All tokens in the document (for negation lookup)
     * @returns Polarity value (-1, 0, or 1)
     */
    getPolarity(objectToken, verbToken, tokens) {
        const verbLemma = verbToken.lemma.toLowerCase();
        // Check if it matches positive verbs
        const positiveRule = this.positiveVerbs.get(verbLemma);
        if (positiveRule) {
            if (positiveRule.checkNegation && this.hasNegation(verbToken, tokens)) {
                return -1; // Positive + negation = negative
            }
            return 1;
        }
        // Check if it matches negative verbs
        const negativeRule = this.negativeVerbs.get(verbLemma);
        if (negativeRule) {
            if (negativeRule.checkNegation && this.hasNegation(verbToken, tokens)) {
                // Double negation: don't avoid → positive? (edge case, conservatively treat as neutral)
                return 0;
            }
            return -1;
        }
        // No rule matched → neutral
        return 0;
    }
    /**
     * Check if a verb token has a negation modifier
     *
     * @param verbToken - The verb token to check
     * @param tokens - All tokens in the document
     * @returns True if negation modifier is present
     */
    hasNegation(verbToken, tokens) {
        // Check all tokens that have this verb as their head
        for (const token of tokens) {
            if (token.headIndex !== verbToken.index) {
                continue;
            }
            // Check for negation dependency label
            if (token.dependencyLabel === "NEG") {
                return true;
            }
            // Check for negation words with advmod/aux labels
            if (token.dependencyLabel === "ADVMOD" || token.dependencyLabel === "AUX") {
                const lemma = token.lemma.toLowerCase();
                if (NEGATION_MARKERS.has(lemma)) {
                    return true;
                }
                // Check contracted forms (don't, won't, can't)
                if (token.text.toLowerCase().includes("n't")) {
                    return true;
                }
            }
        }
        // Check siblings (tokens with same head) for negation
        const verbHead = verbToken.headIndex;
        if (verbHead >= 0 && verbHead < tokens.length) {
            for (const token of tokens) {
                if (token.headIndex === verbHead && token.dependencyLabel === "NEG") {
                    const lemma = token.lemma.toLowerCase();
                    if (NEGATION_MARKERS.has(lemma)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    /**
     * Extract (verb, object, polarity) triples from tokens
     *
     * Traverses dependency tree to find opinion/preference-related verbs and their objects.
     *
     * @param tokens - All tokens from NLP analysis
     * @returns List of preference relations
     */
    extractPreferenceRelations(tokens) {
        const relations = [];
        for (const token of tokens) {
            // Only focus on verbs
            if (token.pos !== "VERB" && token.pos !== "AUX") {
                continue;
            }
            const verbLemma = token.lemma.toLowerCase();
            // Check if it matches rules
            if (!this.positiveVerbs.has(verbLemma) && !this.negativeVerbs.has(verbLemma)) {
                continue;
            }
            // Find objects (tokens that have this verb as head)
            for (const child of tokens) {
                if (child.headIndex !== token.index) {
                    continue;
                }
                // Check if it's an object
                if (OBJECT_DEP_LABELS.has(child.dependencyLabel)) {
                    const polarity = this.getPolarity(child, token, tokens);
                    relations.push({
                        verbToken: token,
                        objectToken: child,
                        polarity,
                    });
                }
                // Handle prepositional phrases (e.g., "travel to Japan")
                if (child.dependencyLabel === "PREP") {
                    // Find pobj under prep
                    for (const grandchild of tokens) {
                        if (grandchild.headIndex === child.index && grandchild.dependencyLabel === "POBJ") {
                            const polarity = this.getPolarity(grandchild, token, tokens);
                            relations.push({
                                verbToken: token,
                                objectToken: grandchild,
                                polarity,
                            });
                        }
                    }
                }
            }
        }
        return relations;
    }
    /**
     * Check if a verb is a polarity verb (positive or negative)
     */
    isPolarityVerb(lemma) {
        const lower = lemma.toLowerCase();
        return this.positiveVerbs.has(lower) || this.negativeVerbs.has(lower);
    }
    /**
     * Get all registered polarity verbs
     */
    getPolarityVerbs() {
        return {
            positive: Array.from(this.positiveVerbs.keys()),
            negative: Array.from(this.negativeVerbs.keys()),
        };
    }
}
exports.PolarityRuleEngine = PolarityRuleEngine;
/**
 * Create a new PolarityRuleEngine instance
 */
function createPolarityRuleEngine(customRules) {
    return new PolarityRuleEngine(customRules);
}
//# sourceMappingURL=polarityRules.js.map