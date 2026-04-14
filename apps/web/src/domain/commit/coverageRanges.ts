import type { Source } from '@t3x-dev/core';

export interface UncoveredRange {
  start: number;
  end: number;
}

/**
 * Given a message's text and a list of verbatim quotes, compute the
 * character ranges that are NOT covered by any quote. Filters out short
 * or whitespace-only segments.
 */
export function computeUncoveredRanges(
  messageText: string,
  quotedTexts: string[]
): UncoveredRange[] {
  if (!messageText || quotedTexts.length === 0) return [];

  const covered: Array<{ start: number; end: number }> = [];
  const lowerMessage = messageText.toLowerCase();

  for (const quote of quotedTexts) {
    if (!quote || quote.length < 3) continue;
    const lowerQuote = quote.toLowerCase();
    let from = 0;
    while (from < lowerMessage.length) {
      const idx = lowerMessage.indexOf(lowerQuote, from);
      if (idx === -1) break;
      covered.push({ start: idx, end: idx + quote.length });
      from = idx + quote.length;
    }
  }

  if (covered.length === 0) {
    const trimmed = messageText.trim();
    if (trimmed.length < 10) return [];
    return [{ start: 0, end: messageText.length }];
  }

  covered.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [covered[0]];
  for (let i = 1; i < covered.length; i++) {
    const last = merged[merged.length - 1];
    if (covered[i].start <= last.end) {
      last.end = Math.max(last.end, covered[i].end);
    } else {
      merged.push({ ...covered[i] });
    }
  }

  const uncovered: UncoveredRange[] = [];
  let pos = 0;
  for (const range of merged) {
    if (range.start > pos) {
      uncovered.push({ start: pos, end: range.start });
    }
    pos = range.end;
  }
  if (pos < messageText.length) {
    uncovered.push({ start: pos, end: messageText.length });
  }

  return uncovered.filter((r) => {
    const text = messageText.slice(r.start, r.end).trim();
    return text.length >= 10;
  });
}

/**
 * Collect verbatim quotes attributable to a specific conversation turn,
 * derived from the sourceIndex.
 */
export function collectQuotesForTurn(
  sourceIndex: Map<string, Source>,
  turnHash: string,
): string[] {
  const quotes: string[] = [];
  for (const src of sourceIndex.values()) {
    if (src.type === 'llm' && src.turn_ref.turn_hash === turnHash) {
      const q = src.turn_ref.quote;
      if (q && q.length > 0) quotes.push(q);
    }
  }
  return quotes;
}
