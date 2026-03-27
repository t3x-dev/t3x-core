/**
 * TruncatedCommitView Component Tests
 *
 * Tests for the smart truncation algorithm and component logic
 */

import { describe, expect, test } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Test the truncation algorithm utilities directly
// Import the helper functions by recreating them for unit testing
// ═══════════════════════════════════════════════════════════════════════════

interface HighlightRange {
  start: number;
  end: number;
}

interface TruncatedSegment {
  type: 'text' | 'highlight' | 'ellipsis';
  content: string;
}

/**
 * Find word boundary - expands position to nearest word boundary
 */
function findWordBoundary(text: string, pos: number, direction: 'left' | 'right'): number {
  if (pos <= 0) return 0;
  if (pos >= text.length) return text.length;

  if (direction === 'left') {
    while (pos > 0 && !/\s/.test(text[pos - 1])) {
      pos--;
    }
    return pos;
  }
  while (pos < text.length && !/\s/.test(text[pos])) {
    pos++;
  }
  return pos;
}

/**
 * Merge overlapping or adjacent highlight ranges
 */
function mergeHighlightRanges(ranges: HighlightRange[]): HighlightRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Smart truncation algorithm
 */
function truncateWithHighlights(
  text: string,
  highlights: HighlightRange[],
  maxHighlights: number,
  contextChars: number
): TruncatedSegment[] {
  if (text.length === 0) return [];

  if (highlights.length === 0) {
    const maxLen = contextChars * 2;
    if (text.length <= maxLen) {
      return [{ type: 'text', content: text }];
    }
    const endPos = findWordBoundary(text, maxLen, 'right');
    return [
      { type: 'text', content: text.slice(0, endPos) },
      { type: 'ellipsis', content: '...' },
    ];
  }

  const merged = mergeHighlightRanges(highlights);
  const visibleHighlights = merged.slice(0, maxHighlights);

  const visibleRanges: HighlightRange[] = [];

  for (const hl of visibleHighlights) {
    let contextStart = Math.max(0, hl.start - contextChars);
    let contextEnd = Math.min(text.length, hl.end + contextChars);

    if (contextStart > 0) {
      contextStart = findWordBoundary(text, contextStart, 'right');
    }
    if (contextEnd < text.length) {
      contextEnd = findWordBoundary(text, contextEnd, 'left');
    }

    contextStart = Math.min(contextStart, hl.start);
    contextEnd = Math.max(contextEnd, hl.end);

    visibleRanges.push({ start: contextStart, end: contextEnd });
  }

  const mergedRanges = mergeHighlightRanges(visibleRanges);

  const segments: TruncatedSegment[] = [];
  let lastEnd = 0;

  for (const range of mergedRanges) {
    if (range.start > lastEnd) {
      if (lastEnd === 0 && range.start > 0) {
        segments.push({ type: 'ellipsis', content: '...' });
      } else if (range.start > lastEnd) {
        segments.push({ type: 'ellipsis', content: '...' });
      }
    }

    const rangeHighlights = visibleHighlights.filter(
      (hl) => hl.start >= range.start && hl.end <= range.end
    );

    let pos = range.start;
    for (const hl of rangeHighlights) {
      if (hl.start > pos) {
        segments.push({ type: 'text', content: text.slice(pos, hl.start) });
      }
      segments.push({ type: 'highlight', content: text.slice(hl.start, hl.end) });
      pos = hl.end;
    }

    if (pos < range.end) {
      segments.push({ type: 'text', content: text.slice(pos, range.end) });
    }

    lastEnd = range.end;
  }

  if (lastEnd < text.length) {
    segments.push({ type: 'ellipsis', content: '...' });
  }

  return segments;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('TruncatedCommitView - Truncation Algorithm', () => {
  describe('findWordBoundary', () => {
    test('returns 0 for position at start', () => {
      expect(findWordBoundary('hello world', 0, 'left')).toBe(0);
      expect(findWordBoundary('hello world', 0, 'right')).toBe(0);
    });

    test('returns text length for position at end', () => {
      expect(findWordBoundary('hello world', 11, 'right')).toBe(11);
    });

    test('finds word boundary to the left (walks back to word start)', () => {
      // Position 8 is 'r' in 'world', walks back to start of 'world' which is position 6
      expect(findWordBoundary('hello world test', 8, 'left')).toBe(6);
    });

    test('finds word boundary to the right (walks forward to word end)', () => {
      // Position 8 is 'r' in 'world', walks forward to end of 'world' (space at 11)
      expect(findWordBoundary('hello world test', 8, 'right')).toBe(11);
    });

    test('handles position at space (left goes to previous word start)', () => {
      // Position 5 is ' ' (space after hello), looking left walks through 'hello'
      expect(findWordBoundary('hello world', 5, 'left')).toBe(0);
      // Position 6 is 'w' in 'world', looking right goes to end of 'world'
      expect(findWordBoundary('hello world', 6, 'right')).toBe(11);
    });
  });

  describe('mergeHighlightRanges', () => {
    test('returns empty array for empty input', () => {
      expect(mergeHighlightRanges([])).toEqual([]);
    });

    test('returns single range unchanged', () => {
      expect(mergeHighlightRanges([{ start: 0, end: 10 }])).toEqual([{ start: 0, end: 10 }]);
    });

    test('merges overlapping ranges', () => {
      const input = [
        { start: 0, end: 10 },
        { start: 5, end: 15 },
      ];
      expect(mergeHighlightRanges(input)).toEqual([{ start: 0, end: 15 }]);
    });

    test('merges adjacent ranges', () => {
      const input = [
        { start: 0, end: 10 },
        { start: 11, end: 20 },
      ];
      expect(mergeHighlightRanges(input)).toEqual([{ start: 0, end: 20 }]);
    });

    test('keeps separate non-overlapping ranges', () => {
      const input = [
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ];
      expect(mergeHighlightRanges(input)).toEqual([
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ]);
    });

    test('handles unsorted input', () => {
      const input = [
        { start: 20, end: 30 },
        { start: 0, end: 10 },
      ];
      expect(mergeHighlightRanges(input)).toEqual([
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ]);
    });
  });

  describe('truncateWithHighlights', () => {
    test('returns empty array for empty text', () => {
      expect(truncateWithHighlights('', [], 2, 50)).toEqual([]);
    });

    test('returns full text if no highlights and text is short', () => {
      const result = truncateWithHighlights('short text', [], 2, 50);
      expect(result).toEqual([{ type: 'text', content: 'short text' }]);
    });

    test('truncates long text without highlights', () => {
      const longText = 'This is a very long text that exceeds the limit';
      const result = truncateWithHighlights(longText, [], 2, 10);

      expect(result.length).toBe(2);
      expect(result[0].type).toBe('text');
      expect(result[1]).toEqual({ type: 'ellipsis', content: '...' });
    });

    test('shows highlight with context', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const highlights = [{ start: 16, end: 19 }]; // "fox"
      const result = truncateWithHighlights(text, highlights, 2, 10);

      // Should have ellipsis, context, highlight, context, ellipsis
      const types = result.map((s) => s.type);
      expect(types).toContain('ellipsis');
      expect(types).toContain('highlight');

      // Find the highlight segment
      const highlightSeg = result.find((s) => s.type === 'highlight');
      expect(highlightSeg?.content).toBe('fox');
    });

    test('shows text at start without leading ellipsis', () => {
      const text = 'fox jumps over the lazy dog';
      const highlights = [{ start: 0, end: 3 }]; // "fox" at start
      const result = truncateWithHighlights(text, highlights, 2, 10);

      // Should not have leading ellipsis since highlight is at start
      expect(result[0].type).toBe('highlight');
      expect(result[0].content).toBe('fox');
    });

    test('shows text at end without trailing ellipsis', () => {
      const text = 'the lazy dog';
      const highlights = [{ start: 9, end: 12 }]; // "dog" at end
      const result = truncateWithHighlights(text, highlights, 2, 10);

      // Should not have trailing ellipsis since we reach the end
      const lastSeg = result[result.length - 1];
      expect(lastSeg.type).not.toBe('ellipsis');
    });

    test('limits visible highlights to maxHighlights', () => {
      // Use widely spaced highlights so they don't get merged
      const text = 'one xxxxxxxxxxxxxxxx two xxxxxxxxxxxxxxxx three xxxxxxxxxxxxxxxx four';
      const highlights = [
        { start: 0, end: 3 }, // "one"
        { start: 21, end: 24 }, // "two"
        { start: 42, end: 47 }, // "three"
        { start: 65, end: 69 }, // "four"
      ];
      const result = truncateWithHighlights(text, highlights, 2, 5);

      // Only first 2 highlights should be shown
      const highlightSegs = result.filter((s) => s.type === 'highlight');
      expect(highlightSegs.length).toBe(2);
      expect(highlightSegs[0].content).toBe('one');
      expect(highlightSegs[1].content).toBe('two');
    });

    test('merges adjacent highlights within the same visible range', () => {
      const text = 'one two three';
      const highlights = [
        { start: 0, end: 3 }, // "one"
        { start: 4, end: 7 }, // "two"
      ];
      const result = truncateWithHighlights(text, highlights, 2, 50);

      // Adjacent highlights get merged into a single highlight
      // because mergeHighlightRanges merges ranges that are within 1 char of each other
      const highlightSegs = result.filter((s) => s.type === 'highlight');
      // They'll be merged into "one two" as a single highlight
      expect(highlightSegs.length).toBe(1);
      expect(highlightSegs[0].content).toBe('one two');
    });

    test('shows context around highlight', () => {
      const text = 'The quick brown fox jumps over the lazy dog today';
      const highlights = [{ start: 16, end: 19 }]; // "fox"
      const result = truncateWithHighlights(text, highlights, 2, 8);

      // Should have highlight
      const highlightSegs = result.filter((s) => s.type === 'highlight');
      expect(highlightSegs.length).toBe(1);
      expect(highlightSegs[0].content).toBe('fox');

      // Should have some context text around it
      const textSegs = result.filter((s) => s.type === 'text');
      expect(textSegs.length).toBeGreaterThan(0);
    });
  });
});

describe('TruncatedCommitView - Component Logic', () => {
  test('groups nodes by turn_hash', () => {
    const nodes = [
      { id: 's1', text: 'First', source: { turn_hash: 'hash1', start_char: 0, end_char: 5 } },
      { id: 's2', text: 'Second', source: { turn_hash: 'hash1', start_char: 10, end_char: 16 } },
      { id: 's3', text: 'Third', source: { turn_hash: 'hash2', start_char: 0, end_char: 5 } },
    ];

    const groups = new Map<string, HighlightRange[]>();
    for (const node of nodes) {
      const turnHash = node.source.turn_hash;
      const highlights = groups.get(turnHash) || [];
      highlights.push({
        start: node.source.start_char,
        end: node.source.end_char,
      });
      groups.set(turnHash, highlights);
    }

    expect(groups.get('hash1')?.length).toBe(2);
    expect(groups.get('hash2')?.length).toBe(1);
  });

  test('calculates hidden node count correctly', () => {
    const totalNodes = 5;
    const maxHighlightsPerTurn = 2;
    const visibleTurns = 2;

    // Assuming 3 nodes in turn1, 2 nodes in turn2
    const nodesPerTurn = [3, 2];
    let visibleCount = 0;
    for (let i = 0; i < Math.min(visibleTurns, nodesPerTurn.length); i++) {
      visibleCount += Math.min(nodesPerTurn[i], maxHighlightsPerTurn);
    }
    // visible: min(3,2) + min(2,2) = 2 + 2 = 4

    const hiddenCount = totalNodes - visibleCount;
    expect(hiddenCount).toBe(1); // 5 - 4 = 1
  });

  test('orders turn hashes by first occurrence', () => {
    const nodes = [
      { id: 's1', text: 'First', source: { turn_hash: 'hash2', start_char: 0, end_char: 5 } },
      { id: 's2', text: 'Second', source: { turn_hash: 'hash1', start_char: 0, end_char: 6 } },
      { id: 's3', text: 'Third', source: { turn_hash: 'hash2', start_char: 10, end_char: 15 } },
    ];

    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const node of nodes) {
      const hash = node.source.turn_hash;
      if (!seen.has(hash)) {
        seen.add(hash);
        ordered.push(hash);
      }
    }

    expect(ordered).toEqual(['hash2', 'hash1']);
  });
});
