"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultScoreWeights = void 0;
exports.combineScore = combineScore;
const roleWeights_1 = require("./roleWeights");
exports.defaultScoreWeights = {
    cosine: 0.6,
    bm25: 0.2,
    recency: 0.1,
    role: 0.1,
};
function combineScore(components, weights = exports.defaultScoreWeights) {
    const normalizedWeights = normalizeWeights(weights);
    const cosine = clamp01(normalizeCosine(components.cosine ?? 0));
    const bm25 = clamp01(components.bm25 ?? 0);
    const recency = clamp01(components.recency ?? 0);
    const roleWeight = clamp01((0, roleWeights_1.getRoleWeight)(components.role));
    const score = cosine * normalizedWeights.cosine +
        bm25 * normalizedWeights.bm25 +
        recency * normalizedWeights.recency +
        roleWeight * normalizedWeights.role;
    return clamp01(score);
}
function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
function normalizeCosine(value) {
    if (!Number.isFinite(value))
        return 0;
    return (value + 1) / 2; // map [-1,1] → [0,1]
}
function normalizeWeights(weights) {
    const total = weights.cosine + weights.bm25 + weights.recency + weights.role;
    if (total <= 0) {
        return { ...exports.defaultScoreWeights };
    }
    return {
        cosine: weights.cosine / total,
        bm25: weights.bm25 / total,
        recency: weights.recency / total,
        role: weights.role / total,
    };
}
