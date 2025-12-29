"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.POS_TAG_MAPPING = exports.NLPProviderError = void 0;
exports.normalizePosTag = normalizePosTag;
exports.normalizeDependencyLabel = normalizeDependencyLabel;
/**
 * Error thrown when NLP provider is unavailable
 */
class NLPProviderError extends Error {
    constructor(providerId, cause, message) {
        super(message ?? `NLP provider "${providerId}" is unavailable`);
        this.providerId = providerId;
        this.cause = cause;
        this.name = 'NLPProviderError';
    }
}
exports.NLPProviderError = NLPProviderError;
/**
 * Map provider-specific POS tags to Universal Dependencies tags
 */
exports.POS_TAG_MAPPING = {
    // Google Cloud NLP tags
    NOUN: 'NOUN',
    VERB: 'VERB',
    ADJ: 'ADJ',
    ADV: 'ADV',
    PRON: 'PRON',
    DET: 'DET',
    ADP: 'ADP',
    NUM: 'NUM',
    CONJ: 'CCONJ',
    PRT: 'PART',
    PUNCT: 'PUNCT',
    X: 'X',
    AFFIX: 'X',
    UNKNOWN: 'X',
};
/**
 * Normalize POS tag to Universal Dependencies format
 */
function normalizePosTag(tag) {
    return exports.POS_TAG_MAPPING[tag.toUpperCase()] ?? tag.toUpperCase();
}
/**
 * Normalize dependency label
 */
function normalizeDependencyLabel(label) {
    const normalized = label.toUpperCase();
    // Map common variations
    const mapping = {
        ROOT: 'ROOT',
        NSUBJ: 'NSUBJ',
        NSUBJPASS: 'NSUBJ',
        DOBJ: 'DOBJ',
        OBJ: 'DOBJ',
        POBJ: 'POBJ',
        IOBJ: 'IOBJ',
        ATTR: 'ATTR',
        ACOMP: 'ACOMP',
        XCOMP: 'XCOMP',
        CCOMP: 'CCOMP',
        NEG: 'NEG',
        ADVMOD: 'ADVMOD',
        AUX: 'AUX',
        AUXPASS: 'AUXPASS',
        PREP: 'PREP',
        DET: 'DET',
        AMOD: 'AMOD',
        NN: 'NN',
        COMPOUND: 'NN',
        CONJ: 'CONJ',
        CC: 'CC',
        MARK: 'MARK',
        PUNCT: 'PUNCT',
        P: 'P',
    };
    return mapping[normalized] ?? normalized;
}
//# sourceMappingURL=base.js.map