"use strict";
/**
 * Deterministic BM25 helpers for the insight engine.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultBm25Config = void 0;
exports.scoreBm25 = scoreBm25;
exports.defaultBm25Config = { k1: 1.2, b: 0.75 };
function scoreBm25(queryTokens, documentTokens, stats = {}, config = exports.defaultBm25Config) {
    if (queryTokens.length === 0 || documentTokens.length === 0) {
        return 0;
    }
    const uniqueQueryTokens = Array.from(new Set(queryTokens.map(token => token.trim()).filter(token => token.length > 0)));
    if (uniqueQueryTokens.length === 0) {
        return 0;
    }
    const docLen = documentTokens.length;
    if (docLen === 0) {
        return 0;
    }
    const { documentFrequency = {}, totalDocuments = 1, averageDocumentLength = docLen } = stats;
    const { k1, b } = config;
    const avgDocLength = averageDocumentLength <= 0 ? docLen : averageDocumentLength;
    let score = 0;
    for (const token of uniqueQueryTokens) {
        const tf = termFrequency(token, documentTokens);
        if (tf === 0)
            continue;
        const dfRaw = documentFrequency[token] ?? (tf > 0 ? 1 : 0);
        const df = clamp(dfRaw, 1, Math.max(totalDocuments, 1));
        const idf = inverseDocumentFrequency(df, totalDocuments);
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLength));
        const termScore = idf * (numerator / denominator);
        score += termScore;
    }
    return Number.isFinite(score) ? score : 0;
}
function termFrequency(token, tokens) {
    let count = 0;
    for (const t of tokens) {
        if (t === token)
            count += 1;
    }
    return count;
}
function inverseDocumentFrequency(df, totalDocuments) {
    const N = Math.max(totalDocuments, 1);
    const dfClamped = clamp(df, 1, N);
    const numerator = N - dfClamped + 0.5;
    const denominator = dfClamped + 0.5;
    if (denominator === 0)
        return 0;
    const ratio = numerator / denominator;
    const value = Math.log(ratio + 1);
    return value > 0 ? value : 0;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
