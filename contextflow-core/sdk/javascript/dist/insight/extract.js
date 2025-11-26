"use strict";
/**
 * Deterministic extractors for the insight engine.
 * Each extractor inspects a single turn and emits zero or more findings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractors = void 0;
exports.runExtractors = runExtractors;
const segmentit_1 = require("segmentit");
const TOKEN_SPLIT_REGEX = /[,\s、，。．\.!?！？;；:：()\[\]{}<>「」“”"']+/u;
const CHINESE_RUN_REGEX = /[\p{Script=Han}]{2,}/gu;
let cachedSegmenter = null;
function getSegmenter() {
    if (!cachedSegmenter) {
        const segment = new segmentit_1.Segment();
        cachedSegmenter = (0, segmentit_1.useDefault)(segment);
    }
    return cachedSegmenter;
}
class AmountExtractor {
    constructor() {
        this.id = "amount@v1";
        this.prefixPattern = /\b(?:USD|US\$|\$|¥|￥|CNY|RMB)\s*\d+(?:[.,]\d+)?(?:k|K|万|千)?/giu;
        this.suffixPattern = /\d+(?:[.,]\d+)?\s*(?:USD|usd|美元|美金|元|块|人民币|dollars?|k|K|万|千)/gu;
    }
    run(input) {
        const results = [];
        const { turnId, text } = input;
        const matches = [
            ...matchAll(this.prefixPattern, text),
            ...matchAll(this.suffixPattern, text),
        ];
        for (const match of matches) {
            const raw = match.trim();
            if (!raw)
                continue;
            const meta = parseAmount(raw);
            results.push(createItem(turnId, raw, "amount", meta));
        }
        return dedupe(results);
    }
}
class DateExtractor {
    constructor() {
        this.id = "date@v1";
        this.patterns = [
            /\d{4}-\d{1,2}-\d{1,2}(?:\s*到\s*\d{4}-\d{1,2}-\d{1,2})?/gu,
            /\d{1,2}\/\d{1,2}(?:\s*-\s*\d{1,2}\/\d{1,2})?/gu,
            /\d{1,2}月\d{1,2}号?(?:\s*到\s*\d{1,2}月\d{1,2}号?)?/gu,
            /(下周(?:末)?|本周|本月|下个月|明天|后天|周末|周日|周六)/gu,
        ];
    }
    run(input) {
        const { turnId, text } = input;
        const results = [];
        for (const pattern of this.patterns) {
            for (const raw of matchAll(pattern, text)) {
                results.push(createItem(turnId, raw, "date", {}));
            }
        }
        return dedupe(results);
    }
}
class UrlExtractor {
    constructor() {
        this.id = "url@v1";
        this.pattern = /https?:\/\/[^\s)]+/gui;
    }
    run(input) {
        const { turnId, text } = input;
        return matchAll(this.pattern, text).map(raw => createItem(turnId, raw, "url", {}));
    }
}
class PreferenceExtractor {
    constructor() {
        this.id = "preference@v1";
        this.positiveKeywords = ["想", "希望", "喜欢", "prefer", "would like", "想要"];
        this.negativeKeywords = ["不想", "不要", "避免", "no", "not"];
    }
    run(input) {
        const { turnId, text } = input;
        const lower = text.toLowerCase();
        const results = [];
        for (const keyword of this.positiveKeywords) {
            const idx = lower.indexOf(keyword.toLowerCase());
            if (idx >= 0) {
                const target = extractFollowingPhrase(text, idx + keyword.length);
                if (target) {
                    results.push(createItem(turnId, target, "prefer", { polarity: "+", keyword }));
                }
            }
        }
        for (const keyword of this.negativeKeywords) {
            const idx = lower.indexOf(keyword.toLowerCase());
            if (idx >= 0) {
                const target = extractFollowingPhrase(text, idx + keyword.length);
                if (target) {
                    results.push(createItem(turnId, target, "avoid", { polarity: "-", keyword }));
                }
            }
        }
        return dedupe(results);
    }
}
class ConstraintExtractor {
    constructor() {
        this.id = "constraint@v1";
        this.lessEqualPattern = /(?:小于|少于|不超过|≤|<=|不多于)\s*([^\s，。,]+)/gu;
    }
    run(input) {
        const { turnId, text } = input;
        const results = [];
        for (const raw of matchAll(this.lessEqualPattern, text)) {
            results.push(createItem(turnId, raw, "constraint", { comparison: "le" }));
        }
        return dedupe(results);
    }
}
class PhraseExtractor {
    constructor() {
        this.id = "phrase@v1";
    }
    run(input) {
        const { turnId, text } = input;
        const baseTokens = text
            .split(TOKEN_SPLIT_REGEX)
            .map(token => token.trim())
            .filter(token => token.length >= 2 && token.length <= 24);
        const chineseTokens = extractChineseTokens(text);
        const candidates = [...baseTokens, ...chineseTokens].filter(token => !containsDigits(token));
        const unique = dedupeStrings(candidates);
        return unique.map(token => createItem(turnId, token, "phrase", {}));
    }
}
class HeadingExtractor {
    constructor() {
        this.id = "heading@v1";
        this.pattern = /^(#{1,6})\s*(.+)$/;
    }
    run(input) {
        const lines = splitLines(input.text);
        const findings = [];
        lines.forEach((line, index) => {
            const match = this.pattern.exec(line);
            if (!match)
                return;
            const level = match[1].length;
            const title = match[2].trim();
            if (!title)
                return;
            findings.push(createItem(input.turnId, title, "heading", {
                level,
                line: index + 1,
            }));
        });
        return dedupe(findings);
    }
}
class ListExtractor {
    constructor() {
        this.id = "list@v1";
        this.bulletPattern = /^[\-*+]\s+(.+)/;
        this.orderedPattern = /^(?:\d+\.|[一二三四五六七八九十]+、)\s*(.+)/;
    }
    run(input) {
        const lines = splitLines(input.text);
        const findings = [];
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            let match = this.bulletPattern.exec(trimmed);
            let kind = "unordered";
            if (!match) {
                match = this.orderedPattern.exec(trimmed);
                kind = "ordered";
            }
            if (match) {
                const content = match[1].trim();
                if (content) {
                    findings.push(createItem(input.turnId, content, "list_item", {
                        order: kind,
                        line: index + 1,
                    }));
                }
            }
        });
        return dedupe(findings);
    }
}
class BlockExtractor {
    constructor() {
        this.id = "block@v1";
    }
    run(input) {
        const blocks = input.text.split(/\n\s*\n+/);
        const findings = [];
        blocks.forEach((block, index) => {
            const trimmed = block.trim();
            if (!trimmed)
                return;
            const snippet = trimmed.length > 280 ? `${trimmed.slice(0, 279)}…` : trimmed;
            findings.push(createItem(input.turnId, snippet, "block", {
                index,
            }));
        });
        return dedupe(findings);
    }
}
class QuoteExtractor {
    constructor() {
        this.id = "quote@v1";
        this.blockquotePattern = /^>\s*(.+)/;
        this.quoteMarksPattern = /[“"']([^"”']+)[”"']/g;
    }
    run(input) {
        const lines = splitLines(input.text);
        const findings = [];
        lines.forEach((line, index) => {
            const blockMatch = this.blockquotePattern.exec(line.trim());
            if (blockMatch && blockMatch[1].trim()) {
                findings.push(createItem(input.turnId, blockMatch[1].trim(), "quote", {
                    type: "blockquote",
                    line: index + 1,
                }));
            }
            let match;
            this.quoteMarksPattern.lastIndex = 0;
            while ((match = this.quoteMarksPattern.exec(line)) !== null) {
                const quote = match[1].trim();
                if (quote) {
                    findings.push(createItem(input.turnId, quote, "quote", {
                        type: "inline",
                        line: index + 1,
                    }));
                }
            }
        });
        return dedupe(findings);
    }
}
exports.extractors = [
    new AmountExtractor(),
    new DateExtractor(),
    new UrlExtractor(),
    new PreferenceExtractor(),
    new ConstraintExtractor(),
    new PhraseExtractor(),
    new HeadingExtractor(),
    new ListExtractor(),
    new BlockExtractor(),
    new QuoteExtractor(),
];
function runExtractors(turn) {
    const findings = exports.extractors.flatMap(extractor => extractor.run({ turnId: turn.id, text: turn.text, role: turn.role, timestamp: turn.timestamp }));
    return dedupe(findings);
}
function createItem(turnId, text, kind, meta) {
    return {
        turnId,
        text: normalizeWhitespace(text),
        kind,
        meta,
    };
}
function matchAll(pattern, text) {
    const matches = [];
    pattern.lastIndex = 0;
    let result;
    while ((result = pattern.exec(text)) !== null) {
        if (result[0]) {
            matches.push(result[0]);
        }
        if (pattern.lastIndex === result.index) {
            pattern.lastIndex += 1; // avoid infinite loops on zero-width matches
        }
    }
    return matches;
}
function dedupe(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const key = `${item.turnId}:${item.kind}:${item.text}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }
    return result;
}
function extractChineseTokens(text) {
    const matches = text.matchAll(CHINESE_RUN_REGEX);
    const segmenter = getSegmenter();
    const tokens = new Set();
    for (const match of matches) {
        const raw = match[0];
        if (!raw)
            continue;
        const segments = segmenter.doSegment(raw);
        const words = Array.isArray(segments)
            ? segments.map((segment) => (typeof segment === "string" ? segment : segment.w)).filter(Boolean)
            : [];
        for (const word of words) {
            const candidate = String(word).trim();
            if (candidate.length < 2 || candidate.length > 10)
                continue;
            tokens.add(candidate);
        }
    }
    return Array.from(tokens);
}
function splitLines(text) {
    return text.split(/\r?\n/);
}
function dedupeStrings(tokens) {
    const seen = new Set();
    const result = [];
    for (const token of tokens) {
        if (!seen.has(token)) {
            seen.add(token);
            result.push(token);
        }
    }
    return result;
}
function containsDigits(value) {
    return /\d/.test(value);
}
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
function extractFollowingPhrase(text, start) {
    const snippet = text.slice(start).trim();
    if (!snippet)
        return null;
    const tokens = snippet.split(TOKEN_SPLIT_REGEX).filter(Boolean);
    if (tokens.length === 0)
        return null;
    const phrase = tokens.slice(0, 3).join(" ");
    return phrase.trim() || null;
}
function parseAmount(raw) {
    const normalized = raw.replace(/[,，]/g, "").trim();
    const currencyMatch = normalized.match(/^(USD|US\$|\$|¥|￥|CNY|RMB)/i);
    const suffixMatch = normalized.match(/(USD|usd|美元|美金|元|块|人民币)$/i);
    const numberMatch = normalized.match(/\d+(?:\.\d+)?/);
    let value = null;
    if (numberMatch) {
        value = Number(numberMatch[0]);
        if (normalized.includes("万"))
            value *= 10000;
        if (/[kK]/.test(normalized))
            value *= 1000;
    }
    const currency = (currencyMatch && normalizeCurrency(currencyMatch[0])) ||
        (suffixMatch && normalizeCurrency(suffixMatch[0])) ||
        undefined;
    return {
        raw,
        currency,
        value,
    };
}
function normalizeCurrency(value) {
    const lower = value.toLowerCase();
    if (lower.includes("usd") || value === "$" || lower.includes("美")) {
        return "USD";
    }
    if (lower.includes("cny") || lower.includes("rmb") || lower.includes("元") || value === "¥" || value === "￥") {
        return "CNY";
    }
    return value.toUpperCase();
}
