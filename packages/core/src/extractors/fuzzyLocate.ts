/**
 * Fuzzy Quote Locator
 *
 * Five-tier strategy to locate an LLM-provided quote in turn content:
 * 1.   Exact substring match (score = 1.0)
 * 1.5  Markdown-stripped exact match (score = 0.97)
 * 2.   Normalized substring match (collapse whitespace, case-insensitive) (score = 0.95)
 * 2.5  Markdown-stripped + normalized match (score = 0.92)
 * 3.   Sliding window Levenshtein (score = 1 - distance/windowLen)
 *
 * Returns null if best score < 0.6
 */

export interface FuzzyLocateResult {
  start: number;
  end: number;
  score: number;
}

const MIN_SCORE = 0.6;

export function fuzzyLocate(content: string, quote: string): FuzzyLocateResult | null {
  if (!content || !quote) return null;

  // Tier 1: Exact substring
  const exactIdx = content.indexOf(quote);
  if (exactIdx !== -1) {
    return { start: exactIdx, end: exactIdx + quote.length, score: 1.0 };
  }

  // Tier 1.5: Markdown-stripped exact match
  const { text: mdContent, offsetMap: mdMap } = stripMarkdownWithMap(content);
  const mdQuote = stripMarkdown(quote);
  if (mdQuote.length > 0) {
    const mdIdx = mdContent.indexOf(mdQuote);
    if (mdIdx !== -1) {
      const start = mdMap[mdIdx];
      const end =
        mdIdx + mdQuote.length < mdMap.length ? mdMap[mdIdx + mdQuote.length] : content.length;
      return { start, end, score: 0.97 };
    }
  }

  // Tier 2: Normalized substring (case + whitespace)
  const normContent = normalize(content);
  const normQuote = normalize(quote);
  if (normQuote.length === 0) return null;

  const normIdx = normContent.indexOf(normQuote);
  if (normIdx !== -1) {
    const { start, end } = mapNormToOrig(content, normContent, normIdx, normQuote.length);
    return { start, end, score: 0.95 };
  }

  // Tier 2.5: Markdown-stripped + normalized match
  const mdNormContent = normalize(mdContent);
  const mdNormQuote = normalize(mdQuote);
  if (mdNormQuote.length > 0) {
    const mdNormIdx = mdNormContent.indexOf(mdNormQuote);
    if (mdNormIdx !== -1) {
      // Map: mdNorm position → md position → original position
      const { offsetMap: mdNormMap } = normalizeWithMap(mdContent);
      const mdPos = mdNormIdx < mdNormMap.length ? mdNormMap[mdNormIdx] : mdContent.length;
      const mdPosEnd =
        mdNormIdx + mdNormQuote.length < mdNormMap.length
          ? mdNormMap[mdNormIdx + mdNormQuote.length]
          : mdContent.length;
      const start = mdPos < mdMap.length ? mdMap[mdPos] : content.length;
      const end = mdPosEnd < mdMap.length ? mdMap[mdPosEnd] : content.length;
      return { start, end, score: 0.92 };
    }
  }

  // Tier 3: Sliding window Levenshtein
  return slidingLevenshtein(content, quote);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Markdown patterns: [regex, replacement, captureGroupIndex] */
const MD_PATTERNS: Array<[RegExp, string]> = [
  [/\*\*(.+?)\*\*/g, '$1'],
  [/\*(.+?)\*/g, '$1'],
  [/__(.+?)__/g, '$1'],
  [/_(.+?)_/g, '$1'],
  [/`(.+?)`/g, '$1'],
  [/^#{1,6}\s+/gm, ''],
  [/^[-*+]\s+/gm, ''],
  [/^\d+\.\s+/gm, ''],
  [/\[([^\]]+)\]\([^)]+\)/g, '$1'],
];

/** Strip markdown formatting (simple version for quotes). */
function stripMarkdown(s: string): string {
  let result = s;
  for (const [pattern, replacement] of MD_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Strip markdown formatting and return an offset map.
 * offsetMap[i] = index in original string that produced character i in the stripped string.
 */
function stripMarkdownWithMap(s: string): { text: string; offsetMap: number[] } {
  // Build character-level offset map by applying each pattern sequentially
  // Start with identity map
  let current = s;
  let map: number[] = Array.from({ length: s.length }, (_, i) => i);

  for (const [pattern, replacement] of MD_PATTERNS) {
    const nextChars: string[] = [];
    const nextMap: number[] = [];
    let lastIndex = 0;

    // Reset regex state
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(current)) !== null) {
      // Copy characters before the match
      for (let i = lastIndex; i < match.index; i++) {
        nextChars.push(current[i]);
        nextMap.push(map[i]);
      }

      // Determine the replacement text for this match
      const replaced = match[0].replace(
        new RegExp(pattern.source, pattern.flags.replace('g', '')),
        replacement
      );

      // Map replacement chars to the original positions within the match
      // Use the start of the first capture group if available, else start of match
      const captureStart =
        match[1] !== undefined ? match.index + match[0].indexOf(match[1]) : match.index;
      for (let i = 0; i < replaced.length; i++) {
        nextChars.push(replaced[i]);
        nextMap.push(map[Math.min(captureStart + i, match.index + match[0].length - 1)]);
      }

      lastIndex = match.index + match[0].length;

      // Prevent infinite loops on zero-length matches
      if (match[0].length === 0) {
        if (lastIndex < current.length) {
          nextChars.push(current[lastIndex]);
          nextMap.push(map[lastIndex]);
        }
        lastIndex++;
      }
    }

    // Copy remaining characters
    for (let i = lastIndex; i < current.length; i++) {
      nextChars.push(current[i]);
      nextMap.push(map[i]);
    }

    current = nextChars.join('');
    map = nextMap;
  }

  return { text: current, offsetMap: map };
}

/**
 * Normalize text (lowercase + collapse whitespace) and return an offset map.
 * offsetMap[i] = index in the input string that produced character i in the normalized string.
 */
function normalizeWithMap(s: string): { text: string; offsetMap: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let inWhitespace = false;
  let started = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (!inWhitespace && started) {
        chars.push(' ');
        map.push(i);
      }
      inWhitespace = true;
    } else {
      inWhitespace = false;
      started = true;
      chars.push(ch.toLowerCase());
      map.push(i);
    }
  }

  // Trim trailing space
  if (chars.length > 0 && chars[chars.length - 1] === ' ') {
    chars.pop();
    map.pop();
  }

  return { text: chars.join(''), offsetMap: map };
}

/**
 * Map a position in normalized text back to the original text.
 */
function mapNormToOrig(
  orig: string,
  _norm: string,
  normStart: number,
  normLen: number
): { start: number; end: number } {
  // Walk through original, tracking normalized position
  let ni = 0;
  let origStart = 0;
  let origEnd = orig.length;
  let inWhitespace = false;

  for (let oi = 0; oi < orig.length && ni < normStart + normLen; oi++) {
    const ch = orig[oi];
    const isWs = /\s/.test(ch);

    if (isWs) {
      if (!inWhitespace && ni > 0) {
        // First whitespace char maps to one normalized space
        if (ni === normStart) origStart = oi;
        ni++;
        if (ni === normStart + normLen) {
          origEnd = oi + 1;
          break;
        }
      }
      inWhitespace = true;
    } else {
      inWhitespace = false;
      if (ni === normStart) origStart = oi;
      ni++;
      if (ni === normStart + normLen) {
        origEnd = oi + 1;
        break;
      }
    }
  }

  return { start: origStart, end: origEnd };
}

/**
 * Sliding window Levenshtein distance for fuzzy matching.
 * Window size = quote length ± 20%.
 */
function slidingLevenshtein(content: string, quote: string): FuzzyLocateResult | null {
  if (content.length > 50_000) return null;

  const qLen = quote.length;
  const minWin = Math.max(1, Math.floor(qLen * 0.8));
  const maxWin = Math.ceil(qLen * 1.2);

  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;

  for (let wLen = minWin; wLen <= maxWin && wLen <= content.length; wLen++) {
    for (let i = 0; i <= content.length - wLen; i++) {
      const window = content.slice(i, i + wLen);
      const dist = levenshteinDistance(window.toLowerCase(), quote.toLowerCase());
      const maxLen = Math.max(window.length, quote.length);
      const score = 1 - dist / maxLen;

      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
        bestEnd = i + wLen;
      }
    }
  }

  return bestScore >= MIN_SCORE ? { start: bestStart, end: bestEnd, score: bestScore } : null;
}

/**
 * Basic Levenshtein distance (bounded for performance).
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Quick reject: if length difference alone exceeds threshold, skip
  if (Math.abs(m - n) > Math.max(m, n) * 0.2) {
    return Math.max(m, n);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}
