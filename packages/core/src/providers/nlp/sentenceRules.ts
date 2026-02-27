import type { NLPSentence } from './base';

export interface RuleBasedSentenceOptions {
  minLength?: number;
}

const SENTENCE_END_CHARS = new Set(['.', '!', '?', ';', '\u3002', '\uFF01', '\uFF1F', '\uFF1B']);

const CLOSING_CHARS = new Set([
  '"',
  "'",
  ')',
  ']',
  '}',
  '\u201D',
  '\u2019',
  '\u300D',
  '\u300F',
  '\u3011',
  '\u300B',
  '\u3009',
  '\uFF09',
]);

const LIST_BULLETS = new Set(['-', '*', '\u2022', '\u25CF', '\u25A0', '\u25AA']);

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'u.s',
  'u.k',
  'u.n',
  'p.m',
  'a.m',
  'dept',
  'inc',
  'ltd',
]);

export function splitSentencesRuleBased(
  text: string,
  options: RuleBasedSentenceOptions = {}
): NLPSentence[] {
  const minLength = Math.max(1, options.minLength ?? 1);
  const sentences: NLPSentence[] = [];
  let start = 0;
  let index = 0;

  while (index < text.length) {
    if (index > start && shouldStartNewSegmentAt(text, index)) {
      pushSegment(text, sentences, start, index, minLength);
      start = index;
    }

    const ch = text[index];
    if (ch === '\r' || ch === '\n') {
      const newlineLength = ch === '\r' && text[index + 1] === '\n' ? 2 : 1;
      if (shouldSplitAtNewline(text, index, newlineLength)) {
        pushSegment(text, sentences, start, index, minLength);
      }
      start = index + newlineLength;
      index += newlineLength;
      continue;
    }

    const ellipsisEnd = getEllipsisEnd(text, index);
    if (ellipsisEnd !== null) {
      let end = ellipsisEnd;
      while (end < text.length && CLOSING_CHARS.has(text[end])) {
        end += 1;
      }
      pushSegment(text, sentences, start, end, minLength);
      start = end;
      index = end;
      continue;
    }

    if (SENTENCE_END_CHARS.has(ch)) {
      if (ch === '.' && (isListMarkerDot(text, index) || !isDotSentenceBoundary(text, index))) {
        index += 1;
        continue;
      }

      let end = index + 1;
      while (end < text.length && CLOSING_CHARS.has(text[end])) {
        end += 1;
      }
      pushSegment(text, sentences, start, end, minLength);
      start = end;
      index = end;
      continue;
    }

    index += 1;
  }

  pushSegment(text, sentences, start, text.length, minLength);
  return sentences;
}

function pushSegment(
  text: string,
  sentences: NLPSentence[],
  rawStart: number,
  rawEnd: number,
  minLength: number
) {
  let start = rawStart;
  let end = rawEnd;
  while (start < end && isWhitespace(text[start])) {
    start += 1;
  }
  while (end > start && isWhitespace(text[end - 1])) {
    end -= 1;
  }

  if (end - start < minLength) {
    return;
  }

  const segmentText = text.slice(start, end);
  if (shouldIgnoreSegment(segmentText)) {
    return;
  }

  sentences.push({
    text: segmentText,
    sentiment: 0,
    beginOffset: start,
    endOffset: end,
  });
}

function shouldSplitAtNewline(text: string, index: number, newlineLength: number): boolean {
  const prevNonSpace = findPrevNonSpace(text, index);
  const nextNonSpace = findNextNonSpace(text, index + newlineLength);

  if (nextNonSpace === null) {
    return true;
  }

  if (text[index + newlineLength] === '\n' || text[index + newlineLength] === '\r') {
    return true;
  }

  if (prevNonSpace !== null && isSentenceEndChar(text[prevNonSpace])) {
    return true;
  }

  if (getListMarkerLength(text, nextNonSpace) > 0) {
    return true;
  }

  return false;
}

function shouldStartNewSegmentAt(text: string, index: number): boolean {
  const markerLength = getListMarkerLength(text, index);
  if (markerLength === 0) {
    return false;
  }

  const prevNonSpace = findPrevNonSpace(text, index);
  if (prevNonSpace === null) {
    return true;
  }

  const prevChar = text[prevNonSpace];
  return (
    prevChar === '\n' ||
    prevChar === '\r' ||
    prevChar === ':' ||
    prevChar === ';' ||
    prevChar === '\uFF1A' ||
    prevChar === '\uFF1B'
  );
}

function getEllipsisEnd(text: string, index: number): number | null {
  const ch = text[index];
  if (ch === '.' && text[index + 1] === '.') {
    let end = index + 1;
    while (text[end] === '.') {
      end += 1;
    }
    return end;
  }

  if (ch === '\u2026') {
    let end = index + 1;
    while (text[end] === '\u2026') {
      end += 1;
    }
    return end;
  }

  return null;
}

function isSentenceEndChar(ch: string): boolean {
  return SENTENCE_END_CHARS.has(ch);
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u3000';
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
}

function isCjkNumeral(ch: string | undefined): boolean {
  switch (ch) {
    case '\u4E00':
    case '\u4E8C':
    case '\u4E09':
    case '\u56DB':
    case '\u4E94':
    case '\u516D':
    case '\u4E03':
    case '\u516B':
    case '\u4E5D':
    case '\u5341':
      return true;
    default:
      return false;
  }
}

function isAbbreviationDot(text: string, index: number): boolean {
  const prev = text[index - 1];
  const next = text[index + 1];
  if (isLetter(prev) && isLetter(next) && text[index + 2] === '.') {
    return true;
  }

  const word = getWordBefore(text, index);
  return word.length > 0 && ABBREVIATIONS.has(word.toLowerCase());
}

/**
 * Innocence-presumption dot boundary check.
 * A dot is a sentence boundary only if ALL three evidence tests pass:
 * 1. Dot followed by whitespace or EOF
 * 2. Next content starts uppercase, list marker, or is EOF
 * 3. Word before dot is not a known abbreviation
 */
function isDotSentenceBoundary(text: string, index: number): boolean {
  // Evidence 1: dot must be followed by whitespace, closing chars, or EOF
  let afterDot = index + 1;
  while (afterDot < text.length && CLOSING_CHARS.has(text[afterDot])) {
    afterDot++;
  }
  const next = text[afterDot];
  if (next !== undefined && !isWhitespace(next)) return false;

  // Evidence 2: next content must start with uppercase, list marker, or be EOF
  const nextContentIdx = findNextNonSpace(text, afterDot);
  if (nextContentIdx !== null) {
    const ch = text[nextContentIdx];
    const startsUppercase = ch >= 'A' && ch <= 'Z';
    const startsList = getListMarkerLength(text, nextContentIdx) > 0;
    if (!startsUppercase && !startsList) return false;
  }

  // Evidence 3: word before dot must not be a known abbreviation
  if (isAbbreviationDot(text, index)) return false;

  return true;
}

function isListMarkerDot(text: string, index: number): boolean {
  if (text[index] !== '.') {
    return false;
  }

  let cursor = index - 1;
  if (!isDigit(text[cursor])) {
    return false;
  }

  while (cursor >= 0 && isDigit(text[cursor])) {
    cursor -= 1;
  }

  const markerStart = cursor + 1;
  if (!isStartOfLine(text, markerStart)) {
    const prevNonSpace = findPrevNonSpace(text, markerStart);
    if (prevNonSpace !== null) {
      const prevChar = text[prevNonSpace];
      if (
        prevChar !== '\n' &&
        prevChar !== '\r' &&
        prevChar !== ':' &&
        prevChar !== ';' &&
        prevChar !== '\uFF1A' &&
        prevChar !== '\uFF1B'
      ) {
        return false;
      }
    }
  }

  return isWhitespace(text[index + 1]);
}

function getWordBefore(text: string, index: number): string {
  let cursor = index - 1;
  while (cursor >= 0 && isLetter(text[cursor])) {
    cursor -= 1;
  }
  return text.slice(cursor + 1, index);
}

function getListMarkerLength(text: string, index: number): number {
  const ch = text[index];
  if (!ch) {
    return 0;
  }

  if (LIST_BULLETS.has(ch)) {
    return isWhitespace(text[index + 1]) ? 1 : 0;
  }

  if (isDigit(ch)) {
    let cursor = index;
    while (isDigit(text[cursor])) {
      cursor += 1;
    }
    const marker = text[cursor];
    if (marker && isListMarkerChar(marker)) {
      return isWhitespace(text[cursor + 1]) ? cursor - index + 1 : 0;
    }
  }

  if (isLetter(ch)) {
    const marker = text[index + 1];
    if (marker && (marker === '.' || marker === ')') && isWhitespace(text[index + 2])) {
      return 2;
    }
  }

  if (isCjkNumeral(ch)) {
    let cursor = index;
    while (isCjkNumeral(text[cursor])) {
      cursor += 1;
    }
    const marker = text[cursor];
    if (marker && isListMarkerChar(marker)) {
      return isWhitespace(text[cursor + 1]) ? cursor - index + 1 : 0;
    }
  }

  if (ch === '(' || ch === '\uFF08') {
    let cursor = index + 1;
    if (isDigit(text[cursor]) || isCjkNumeral(text[cursor])) {
      while (isDigit(text[cursor]) || isCjkNumeral(text[cursor])) {
        cursor += 1;
      }
      const closing = text[cursor];
      if (closing && (closing === ')' || closing === '\uFF09')) {
        return isWhitespace(text[cursor + 1]) ? cursor - index + 1 : 0;
      }
    }
  }

  return 0;
}

function isListMarkerChar(ch: string): boolean {
  return ch === '.' || ch === ')' || ch === '\u3001' || ch === '\uFF0E' || ch === '\uFF09';
}

function shouldIgnoreSegment(segmentText: string): boolean {
  const trimmed = segmentText.trim();
  if (!trimmed) {
    return true;
  }

  if (containsTextChar(trimmed)) {
    return false;
  }

  if (trimmed.length > 12) {
    return false;
  }

  for (const ch of trimmed) {
    if (!isSeparatorChar(ch) && !isIgnorableChar(ch)) {
      return false;
    }
  }

  return true;
}

function isSeparatorChar(ch: string): boolean {
  switch (ch) {
    case '-':
    case '_':
    case '*':
    case '\u2013': // en dash
    case '\u2014': // em dash
    case '\u2015': // horizontal bar
    case '\u2E3A': // two-em dash
    case '\u2E3B': // three-em dash
    case '\u2022': // bullet
    case '\u00B7': // middle dot
    case '\u2027': // hyphenation point
    case '\u30FB': // katakana middle dot
      return true;
    default:
      return false;
  }
}

function isIgnorableChar(ch: string): boolean {
  switch (ch) {
    case '\uFFFC': // object replacement
    case '\uFEFF': // zero width no-break space
    case '\u200B': // zero width space
    case '\u200C': // zero width non-joiner
    case '\u200D': // zero width joiner
    case '\u2060': // word joiner
      return true;
    default:
      return false;
  }
}

function containsTextChar(text: string): boolean {
  for (const ch of text) {
    if (isLetter(ch) || isDigit(ch) || isCjkChar(ch)) {
      return true;
    }
  }
  return false;
}

function isCjkChar(ch: string | undefined): boolean {
  if (!ch) {
    return false;
  }
  const code = ch.codePointAt(0);
  if (code === undefined) {
    return false;
  }
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff)
  );
}

function findPrevNonSpace(text: string, index: number): number | null {
  let cursor = index - 1;
  while (cursor >= 0 && isWhitespace(text[cursor])) {
    cursor -= 1;
  }
  return cursor >= 0 ? cursor : null;
}

function findNextNonSpace(text: string, index: number): number | null {
  let cursor = index;
  while (cursor < text.length && isWhitespace(text[cursor])) {
    cursor += 1;
  }
  return cursor < text.length ? cursor : null;
}

function isStartOfLine(text: string, index: number): boolean {
  let cursor = index - 1;
  while (cursor >= 0) {
    const ch = text[cursor];
    if (ch === '\n' || ch === '\r') {
      return true;
    }
    if (!isWhitespace(ch)) {
      return false;
    }
    cursor -= 1;
  }
  return true;
}
