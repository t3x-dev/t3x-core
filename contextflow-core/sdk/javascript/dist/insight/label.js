"use strict";
/**
 * Deterministic aspect labeling using entity prioritization and token salience.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLabel = createLabel;
const STOPWORDS = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "for",
    "with",
    "on",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "am",
    "by",
    "at",
    "from",
    "that",
    "this",
    "it",
    "as",
    "about",
    "但",
    "并且",
    "或者",
    "以及",
    "一个",
    "这个",
    "那个",
    "我们",
    "你们",
    "他们",
    "需要",
    "希望",
    "还有",
].map(word => word.toLowerCase()));
function createLabel(input, maxLength = 40) {
    const entity = selectEntity(input.entities);
    const tokenStats = scoreTokens(input.tokens);
    const sortedTokens = tokenStats.sort((a, b) => b.score - a.score);
    const parts = [];
    if (entity) {
        parts.push(entity);
    }
    for (const { token } of sortedTokens) {
        if (parts.length >= 3)
            break;
        if (entity && equalsIgnoreCase(token, entity))
            continue;
        if (parts.some(part => equalsIgnoreCase(part, token)))
            continue;
        parts.push(token);
    }
    if (parts.length === 0) {
        const fallback = input.tokens.find(token => token.trim().length > 0) ?? "Aspect";
        return truncate(fallback.trim(), maxLength);
    }
    return assemble(parts, maxLength);
}
function scoreTokens(tokens) {
    const frequency = new Map();
    let total = 0;
    for (const token of tokens) {
        const normalized = normalizeToken(token);
        if (!normalized)
            continue;
        total += 1;
        const entry = frequency.get(normalized);
        if (entry) {
            entry.count += 1;
            if (token.length > entry.token.length) {
                entry.token = token;
            }
        }
        else {
            frequency.set(normalized, { token, count: 1 });
        }
    }
    if (total === 0) {
        return [];
    }
    const scored = [];
    for (const { token, count } of frequency.values()) {
        const normalized = normalizeToken(token);
        if (!normalized)
            continue;
        const tf = count / total;
        const stopwordPenalty = STOPWORDS.has(normalized) ? 0.25 : 1;
        const lengthBoost = Math.log(1 + token.length);
        const score = tf * stopwordPenalty * lengthBoost;
        scored.push({ token: token.trim(), score });
    }
    return scored.filter(entry => entry.token.length > 0);
}
function selectEntity(entities) {
    if (!entities)
        return undefined;
    for (const entity of entities) {
        const trimmed = entity?.trim();
        if (trimmed)
            return trimmed;
    }
    return undefined;
}
function equalsIgnoreCase(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}
function normalizeToken(token) {
    const trimmed = token.trim();
    if (!trimmed)
        return "";
    return trimmed.toLowerCase();
}
function assemble(parts, maxLength) {
    const working = [...parts];
    let label = working.join(" · ");
    while (label.length > maxLength && working.length > 1) {
        working.pop();
        label = working.join(" · ");
    }
    if (label.length > maxLength) {
        label = truncate(label, maxLength);
    }
    return label;
}
function truncate(value, maxLength) {
    if (value.length <= maxLength)
        return value;
    return `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}
