/**
 * Deterministic extractors for the insight engine.
 * Each extractor inspects a single turn and emits zero or more findings.
 */

import { Segment, useDefault } from "segmentit";

const TOKEN_SPLIT_REGEX = /[,\s,,.．\.!?!?;;::()\[\]{}<>""“”"']+/u;
const CHINESE_RUN_REGEX = /[\p{Script=Han}]{2,}/gu;

export interface ExtractedItem {
  text: string;
  kind: string;
  turnId: string;
  score?: number;
  meta?: Record<string, unknown>;
}

export interface ExtractorInput {
  turnId: string;
  text: string;
  role?: string;
  timestamp?: string;
}

export interface Extractor {
  id: string;
  run(input: ExtractorInput): ExtractedItem[];
}

type Segmenter = ReturnType<typeof useDefault>;

let cachedSegmenter: Segmenter | null = null;

function getSegmenter(): Segmenter {
  if (!cachedSegmenter) {
    const segment = new Segment();
    cachedSegmenter = useDefault(segment);
  }
  return cachedSegmenter;
}

class AmountExtractor implements Extractor {
  readonly id = "amount@v1";

  private readonly prefixPattern = /\b(?:USD|US\$|\$|¥|￥|CNY|RMB)\s*\d+(?:[.,]\d+)?(?:k|K|万|千)?/giu;
  private readonly suffixPattern = /\d+(?:[.,]\d+)?\s*(?:USD|usd|美元|美金|元|块|人民币|dollars?|k|K|万|千)/gu;

  run(input: ExtractorInput): ExtractedItem[] {
    const results: ExtractedItem[] = [];
    const { turnId, text } = input;
    const matches = [
      ...matchAll(this.prefixPattern, text),
      ...matchAll(this.suffixPattern, text),
    ];

    for (const match of matches) {
      const raw = match.trim();
      if (!raw) continue;
      const meta = parseAmount(raw);
      results.push(createItem(turnId, raw, "amount", meta));
    }
    return dedupe(results);
  }
}

class DateExtractor implements Extractor {
  readonly id = "date@v1";

  private readonly patterns: RegExp[] = [
    /\d{4}-\d{1,2}-\d{1,2}(?:\s*(?:到|to)\s*\d{4}-\d{1,2}-\d{1,2})?/gu,
    /\d{1,2}\/\d{1,2}(?:\s*-\s*\d{1,2}\/\d{1,2})?/gu,
    /\d{1,2}月\d{1,2}号?(?:\s*到\s*\d{1,2}月\d{1,2}号?)?/gu,
    /(下周(?:末)?|本周|本月|下个月|明天|后天|周末|周日|周六|next week|this week|this month|next month|tomorrow|weekend|sunday|saturday)/gu,
  ];

  run(input: ExtractorInput): ExtractedItem[] {
    const { turnId, text } = input;
    const results: ExtractedItem[] = [];
    for (const pattern of this.patterns) {
      for (const raw of matchAll(pattern, text)) {
        results.push(createItem(turnId, raw, "date", {}));
      }
    }
    return dedupe(results);
  }
}

class UrlExtractor implements Extractor {
  readonly id = "url@v1";
  private readonly pattern = /https?:\/\/[^\s)]+/gui;

  run(input: ExtractorInput): ExtractedItem[] {
    const { turnId, text } = input;
    return matchAll(this.pattern, text).map(raw => createItem(turnId, raw, "url", {}));
  }
}

class PreferenceExtractor implements Extractor {
  readonly id = "preference@v1";
  private readonly positiveKeywords = ["想", "希望", "喜欢", "prefer", "would like", "想要", "want", "希望"];
  private readonly negativeKeywords = ["不想", "不要", "避免", "no", "not", "avoid"];

  run(input: ExtractorInput): ExtractedItem[] {
    const { turnId, text } = input;
    const lower = text.toLowerCase();
    const results: ExtractedItem[] = [];

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

class ConstraintExtractor implements Extractor {
  readonly id = "constraint@v1";
  private readonly lessEqualPattern = /(?:小于|少于|不超过|≤|<=|不多于|less than|at most|no more than)\s*([^\s,.,]+)/gu;

  run(input: ExtractorInput): ExtractedItem[] {
    const { turnId, text } = input;
    const results: ExtractedItem[] = [];
    for (const raw of matchAll(this.lessEqualPattern, text)) {
      results.push(createItem(turnId, raw, "constraint", { comparison: "le" }));
    }
    return dedupe(results);
  }
}

class PhraseExtractor implements Extractor {
  readonly id = "phrase@v1";

  run(input: ExtractorInput): ExtractedItem[] {
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

class HeadingExtractor implements Extractor {
  readonly id = "heading@v1";
  private readonly pattern = /^(#{1,6})\s*(.+)$/;

  run(input: ExtractorInput): ExtractedItem[] {
    const lines = splitLines(input.text);
    const findings: ExtractedItem[] = [];
    lines.forEach((line, index) => {
      const match = this.pattern.exec(line);
      if (!match) return;
      const level = match[1].length;
      const title = match[2].trim();
      if (!title) return;
      findings.push(
        createItem(input.turnId, title, "heading", {
          level,
          line: index + 1,
        }),
      );
    });
    return dedupe(findings);
  }
}

class ListExtractor implements Extractor {
  readonly id = "list@v1";
  private readonly bulletPattern = /^[\-*+]\s+(.+)/;
  private readonly orderedPattern = /^(?:\d+\.|[一二三四五六七八九十]+[,.])\s*(.+)/;

  run(input: ExtractorInput): ExtractedItem[] {
    const lines = splitLines(input.text);
    const findings: ExtractedItem[] = [];
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
          findings.push(
            createItem(input.turnId, content, "list_item", {
              order: kind,
              line: index + 1,
            }),
          );
        }
      }
    });
    return dedupe(findings);
  }
}

class BlockExtractor implements Extractor {
  readonly id = "block@v1";

  run(input: ExtractorInput): ExtractedItem[] {
    const blocks = input.text.split(/\n\s*\n+/);
    const findings: ExtractedItem[] = [];
    blocks.forEach((block, index) => {
      const trimmed = block.trim();
      if (!trimmed) return;
      const snippet = trimmed.length > 280 ? `${trimmed.slice(0, 279)}…` : trimmed;
      findings.push(
        createItem(input.turnId, snippet, "block", {
          index,
        }),
      );
    });
    return dedupe(findings);
  }
}

class QuoteExtractor implements Extractor {
  readonly id = "quote@v1";
  private readonly blockquotePattern = /^>\s*(.+)/;
  private readonly quoteMarksPattern = /[“"']([^"”']+)[”"']/g;

  run(input: ExtractorInput): ExtractedItem[] {
    const lines = splitLines(input.text);
    const findings: ExtractedItem[] = [];

    lines.forEach((line, index) => {
      const blockMatch = this.blockquotePattern.exec(line.trim());
      if (blockMatch && blockMatch[1].trim()) {
        findings.push(
          createItem(input.turnId, blockMatch[1].trim(), "quote", {
            type: "blockquote",
            line: index + 1,
          }),
        );
      }

      let match: RegExpExecArray | null;
      this.quoteMarksPattern.lastIndex = 0;
      while ((match = this.quoteMarksPattern.exec(line)) !== null) {
        const quote = match[1].trim();
        if (quote) {
          findings.push(
            createItem(input.turnId, quote, "quote", {
              type: "inline",
              line: index + 1,
            }),
          );
        }
      }
    });

    return dedupe(findings);
  }
}

export const extractors: Extractor[] = [
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

export function runExtractors(turn: { id: string; text: string; role?: string; timestamp?: string }): ExtractedItem[] {
  const findings = extractors.flatMap(extractor =>
    extractor.run({ turnId: turn.id, text: turn.text, role: turn.role, timestamp: turn.timestamp }),
  );
  return dedupe(findings);
}

function createItem(turnId: string, text: string, kind: string, meta: Record<string, unknown>): ExtractedItem {
  return {
    turnId,
    text: normalizeWhitespace(text),
    kind,
    meta,
  };
}

function matchAll(pattern: RegExp, text: string): string[] {
  const matches: string[] = [];
  pattern.lastIndex = 0;
  let result: RegExpExecArray | null;
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

function dedupe(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>();
  const result: ExtractedItem[] = [];
  for (const item of items) {
    const key = `${item.turnId}:${item.kind}:${item.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function extractChineseTokens(text: string): string[] {
  const matches = text.matchAll(CHINESE_RUN_REGEX);
  const segmenter = getSegmenter();
  const tokens = new Set<string>();

  for (const match of matches) {
    const raw = match[0];
    if (!raw) continue;
    const segments = segmenter.doSegment(raw);
    const words = Array.isArray(segments)
      ? segments.map((segment: any) => (typeof segment === "string" ? segment : segment.w)).filter(Boolean)
      : [];

    for (const word of words) {
      const candidate = String(word).trim();
      if (candidate.length < 2 || candidate.length > 10) continue;
      tokens.add(candidate);
    }
  }

  return Array.from(tokens);
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function dedupeStrings(tokens: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }
  return result;
}

function containsDigits(value: string): boolean {
  return /\d/.test(value);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractFollowingPhrase(text: string, start: number): string | null {
  const snippet = text.slice(start).trim();
  if (!snippet) return null;
  const tokens = snippet.split(TOKEN_SPLIT_REGEX).filter(Boolean);
  if (tokens.length === 0) return null;
  const phrase = tokens.slice(0, 3).join(" ");
  return phrase.trim() || null;
}

function parseAmount(raw: string): Record<string, unknown> {
  const normalized = raw.replace(/[,,]/g, "").trim();
  const currencyMatch = normalized.match(/^(USD|US\$|\$|¥|￥|CNY|RMB)/i);
  const suffixMatch = normalized.match(/(USD|usd|美元|美金|元|块|人民币)$/i);
  const numberMatch = normalized.match(/\d+(?:\.\d+)?/);

  let value: number | null = null;
  if (numberMatch) {
    value = Number(numberMatch[0]);
    if (normalized.includes("万")) value *= 10000;
    if (/[kK]/.test(normalized)) value *= 1000;
  }

  const currency =
    (currencyMatch && normalizeCurrency(currencyMatch[0])) ||
    (suffixMatch && normalizeCurrency(suffixMatch[0])) ||
    undefined;

  return {
    raw,
    currency,
    value,
  };
}

function normalizeCurrency(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("usd") || value === "$" || lower.includes("美")) {
    return "USD";
  }
  if (lower.includes("cny") || lower.includes("rmb") || lower.includes("元") || value === "¥" || value === "￥") {
    return "CNY";
  }
  return value.toUpperCase();
}
