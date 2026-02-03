/**
 * CommitSourceContext Edge Case Tests
 *
 * Tests for edge case handling as specified in Issue #222:
 * - Source unavailable (deleted turn)
 * - Very long turns (>2000 chars)
 * - Multiple turns (collapsible)
 * - Legacy data (no source field)
 * - Content integrity check (source changed)
 *
 * @see https://github.com/t3x-dev/T3X/issues/222
 */

import { describe, expect, test } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// Recreate helper functions for unit testing
// ═══════════════════════════════════════════════════════════════════════════

interface CommitSentence {
  id: string;
  text: string;
  source?: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

interface TurnHighlight {
  start: number;
  end: number;
}

interface SentenceWithSource {
  sentence: CommitSentence;
  turnHash: string;
  highlight: TurnHighlight;
}

type ContentIntegrityStatus = 'valid' | 'mismatch' | 'unknown';

/**
 * Group sentences by turn_hash, tracking which sentences have valid source info
 */
function groupSentencesByTurn(sentences: CommitSentence[]): {
  byTurn: Map<string, SentenceWithSource[]>;
  withoutSource: CommitSentence[];
} {
  const byTurn = new Map<string, SentenceWithSource[]>();
  const withoutSource: CommitSentence[] = [];

  for (const sentence of sentences) {
    // Handle legacy data without source field
    if (!sentence.source || !sentence.source.turn_hash) {
      withoutSource.push(sentence);
      continue;
    }

    const turnHash = sentence.source.turn_hash;
    const group = byTurn.get(turnHash) || [];
    group.push({
      sentence,
      turnHash,
      highlight: {
        start: sentence.source.start_char,
        end: sentence.source.end_char,
      },
    });
    byTurn.set(turnHash, group);
  }

  return { byTurn, withoutSource };
}

/**
 * Simple similarity calculation (Jaccard-like)
 * Note: Case-insensitive comparison for semantic similarity
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
  );

  // Handle whitespace-only strings
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  // Avoid division by zero (shouldn't happen after above checks, but defensive)
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * Check if the sentence text matches the content at the source position
 */
function checkContentIntegrity(
  sentenceText: string,
  turnContent: string,
  startChar: number,
  endChar: number
): ContentIntegrityStatus {
  // Comprehensive boundary validation
  if (
    startChar < 0 ||
    endChar < 0 ||
    startChar >= endChar ||
    startChar >= turnContent.length ||
    endChar > turnContent.length
  ) {
    return 'mismatch';
  }

  const actualText = turnContent.slice(startChar, endChar);
  // Normalize whitespace for comparison
  const normalizedSentence = sentenceText.trim().replace(/\s+/g, ' ');
  const normalizedActual = actualText.trim().replace(/\s+/g, ' ');

  if (normalizedSentence === normalizedActual) {
    return 'valid';
  }

  // Check if it's a close match (>90% similar)
  const similarity = calculateSimilarity(normalizedSentence, normalizedActual);
  if (similarity > 0.9) {
    return 'valid';
  }

  return 'mismatch';
}

/**
 * Truncate long content while preserving highlighted sections
 */
const MAX_TURN_LENGTH = 2000;

function truncateLongContent(
  content: string,
  highlights: TurnHighlight[],
  contextChars: number
): string {
  if (content.length <= MAX_TURN_LENGTH) return content;
  if (highlights.length === 0) {
    return content.slice(0, MAX_TURN_LENGTH) + '...';
  }

  // Find the range that covers all highlights with context
  const minStart = Math.min(...highlights.map((h) => h.start));
  const maxEnd = Math.max(...highlights.map((h) => h.end));

  const visibleStart = Math.max(0, minStart - contextChars);
  const visibleEnd = Math.min(content.length, maxEnd + contextChars);

  let result = '';

  if (visibleStart > 0) {
    result += '...';
  }

  result += content.slice(visibleStart, visibleEnd);

  if (visibleEnd < content.length) {
    result += '...';
  }

  return result;
}

/**
 * Adjust highlight positions after truncation
 */
function adjustHighlightsForTruncation(
  highlights: TurnHighlight[],
  content: string,
  contextChars: number
): TurnHighlight[] {
  if (content.length <= MAX_TURN_LENGTH) return highlights;
  if (highlights.length === 0) return highlights;

  const minStart = Math.min(...highlights.map((h) => h.start));
  const visibleStart = Math.max(0, minStart - contextChars);
  const offset = visibleStart > 0 ? visibleStart - 3 : 0; // -3 for "..."

  return highlights.map((h) => ({
    start: h.start - offset,
    end: h.end - offset,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('CommitSourceContext - Edge Cases', () => {
  describe('Legacy Data Handling (no source field)', () => {
    test('separates sentences with and without source', () => {
      const sentences: CommitSentence[] = [
        {
          id: 's1',
          text: 'Has source',
          source: { turn_hash: 'hash1', start_char: 0, end_char: 10 },
        },
        { id: 's2', text: 'Legacy sentence', source: undefined },
        { id: 's3', text: 'Another legacy' },
      ];

      const { byTurn, withoutSource } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(1);
      expect(withoutSource.length).toBe(2);
      expect(withoutSource[0].id).toBe('s2');
      expect(withoutSource[1].id).toBe('s3');
    });

    test('handles all legacy data', () => {
      const sentences: CommitSentence[] = [
        { id: 's1', text: 'Legacy 1' },
        { id: 's2', text: 'Legacy 2' },
      ];

      const { byTurn, withoutSource } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(0);
      expect(withoutSource.length).toBe(2);
    });

    test('handles empty source object', () => {
      const sentences: CommitSentence[] = [
        { id: 's1', text: 'Empty source', source: { turn_hash: '', start_char: 0, end_char: 0 } },
      ];

      const { byTurn, withoutSource } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(0);
      expect(withoutSource.length).toBe(1);
    });

    test('handles mixed data correctly', () => {
      const sentences: CommitSentence[] = [
        {
          id: 's1',
          text: 'From turn 1',
          source: { turn_hash: 'hash1', start_char: 0, end_char: 11 },
        },
        { id: 's2', text: 'Legacy', source: undefined },
        {
          id: 's3',
          text: 'From turn 2',
          source: { turn_hash: 'hash2', start_char: 0, end_char: 11 },
        },
        { id: 's4', text: 'Also legacy' },
        {
          id: 's5',
          text: 'From turn 1 again',
          source: { turn_hash: 'hash1', start_char: 20, end_char: 37 },
        },
      ];

      const { byTurn, withoutSource } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(2);
      expect(byTurn.get('hash1')?.length).toBe(2);
      expect(byTurn.get('hash2')?.length).toBe(1);
      expect(withoutSource.length).toBe(2);
    });
  });

  describe('Content Integrity Check', () => {
    test('returns valid for exact match', () => {
      const sentenceText = 'Hello world';
      const turnContent = 'The message is: Hello world, goodbye.';
      const status = checkContentIntegrity(sentenceText, turnContent, 16, 27);
      expect(status).toBe('valid');
    });

    test('returns valid for match with whitespace differences', () => {
      const sentenceText = 'Hello   world';
      const turnContent = 'Hello world';
      const status = checkContentIntegrity(sentenceText, turnContent, 0, 11);
      expect(status).toBe('valid');
    });

    test('returns mismatch for completely different content', () => {
      const sentenceText = 'Hello world';
      const turnContent = 'Goodbye universe';
      const status = checkContentIntegrity(sentenceText, turnContent, 0, 16);
      expect(status).toBe('mismatch');
    });

    test('returns mismatch for out of bounds positions', () => {
      const sentenceText = 'Test';
      const turnContent = 'Short';

      // Start before 0
      expect(checkContentIntegrity(sentenceText, turnContent, -1, 4)).toBe('mismatch');

      // End beyond content length
      expect(checkContentIntegrity(sentenceText, turnContent, 0, 100)).toBe('mismatch');

      // End before 0
      expect(checkContentIntegrity(sentenceText, turnContent, 0, -1)).toBe('mismatch');

      // Start >= end (invalid range)
      expect(checkContentIntegrity(sentenceText, turnContent, 3, 3)).toBe('mismatch');
      expect(checkContentIntegrity(sentenceText, turnContent, 4, 2)).toBe('mismatch');

      // Start >= content length
      expect(checkContentIntegrity(sentenceText, turnContent, 10, 12)).toBe('mismatch');
    });

    test('returns valid for very high similarity (>90%)', () => {
      // Need >90% Jaccard similarity: intersection/union > 0.9
      // With 19 common words and 2 different (one in each), we get 19/21 = 0.905
      const commonWords =
        'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen';
      const sentenceText = commonWords + ' original';
      const turnContent = commonWords + ' modified';
      const status = checkContentIntegrity(sentenceText, turnContent, 0, turnContent.length);
      // This should be valid because 19/21 words match (>90%)
      expect(status).toBe('valid');
    });

    test('returns mismatch for low similarity', () => {
      const sentenceText = 'The quick brown fox';
      const turnContent = 'A slow gray cat sat quietly';
      const status = checkContentIntegrity(sentenceText, turnContent, 0, 27);
      expect(status).toBe('mismatch');
    });
  });

  describe('Similarity Calculation', () => {
    test('returns 1 for identical strings', () => {
      expect(calculateSimilarity('hello world', 'hello world')).toBe(1);
    });

    test('returns 0 for empty strings', () => {
      expect(calculateSimilarity('', 'hello')).toBe(0);
      expect(calculateSimilarity('hello', '')).toBe(0);
    });

    test('returns 0 for completely different strings', () => {
      expect(calculateSimilarity('hello world', 'foo bar baz')).toBe(0);
    });

    test('returns partial similarity for overlapping words', () => {
      const similarity = calculateSimilarity('hello world test', 'hello world');
      // 2 common words out of 3 unique
      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThan(1);
    });

    test('is case insensitive', () => {
      expect(calculateSimilarity('HELLO WORLD', 'hello world')).toBe(1);
    });

    test('returns 0 for whitespace-only strings vs non-whitespace', () => {
      expect(calculateSimilarity('   ', 'hello')).toBe(0);
      expect(calculateSimilarity('hello', '   ')).toBe(0);
      expect(calculateSimilarity('\t\n', 'hello')).toBe(0);
    });

    test('returns 1 for identical whitespace-only strings', () => {
      // Identical strings always return 1 (even if whitespace-only)
      expect(calculateSimilarity('   ', '   ')).toBe(1);
    });
  });

  describe('Long Turn Truncation (>2000 chars)', () => {
    const longContent = 'x'.repeat(3000);

    test('returns content unchanged if under limit', () => {
      const shortContent = 'x'.repeat(1000);
      const result = truncateLongContent(shortContent, [], 100);
      expect(result).toBe(shortContent);
    });

    test('truncates long content without highlights', () => {
      const result = truncateLongContent(longContent, [], 100);
      expect(result).toBe('x'.repeat(2000) + '...');
    });

    test('preserves highlighted section in truncation', () => {
      // Highlight in the middle of long content
      const highlights = [{ start: 1500, end: 1510 }];
      const result = truncateLongContent(longContent, highlights, 100);

      // Should have ellipsis at start, content around highlight, ellipsis at end
      expect(result.startsWith('...')).toBe(true);
      expect(result.endsWith('...')).toBe(true);
      expect(result.length).toBeLessThan(longContent.length);
    });

    test('preserves multiple highlights', () => {
      const highlights = [
        { start: 1000, end: 1020 },
        { start: 1500, end: 1520 },
      ];
      const result = truncateLongContent(longContent, highlights, 100);

      // Should contain both highlight regions
      // The range should be from min(1000)-100 to max(1520)+100
      expect(result.length).toBeGreaterThan(600); // At least the highlighted region
    });

    test('adjusts highlight positions after truncation', () => {
      const highlights = [{ start: 1500, end: 1510 }];
      const adjusted = adjustHighlightsForTruncation(highlights, longContent, 100);

      // Original position was 1500, visible start is 1400 (1500-100)
      // Offset is 1400-3=1397 (accounting for "...")
      expect(adjusted[0].start).toBe(1500 - (1500 - 100 - 3));
      expect(adjusted[0].end).toBe(1510 - (1500 - 100 - 3));
    });

    test('does not adjust highlights for short content', () => {
      const shortContent = 'x'.repeat(1000);
      const highlights = [{ start: 100, end: 110 }];
      const adjusted = adjustHighlightsForTruncation(highlights, shortContent, 100);

      expect(adjusted).toEqual(highlights);
    });
  });

  describe('Sentence Grouping by Turn', () => {
    test('groups multiple sentences from same turn', () => {
      const sentences: CommitSentence[] = [
        { id: 's1', text: 'First', source: { turn_hash: 'hash1', start_char: 0, end_char: 5 } },
        { id: 's2', text: 'Second', source: { turn_hash: 'hash1', start_char: 10, end_char: 16 } },
        { id: 's3', text: 'Third', source: { turn_hash: 'hash1', start_char: 20, end_char: 25 } },
      ];

      const { byTurn } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(1);
      const group = byTurn.get('hash1')!;
      expect(group.length).toBe(3);
      expect(group[0].highlight).toEqual({ start: 0, end: 5 });
      expect(group[1].highlight).toEqual({ start: 10, end: 16 });
      expect(group[2].highlight).toEqual({ start: 20, end: 25 });
    });

    test('groups sentences from multiple turns', () => {
      const sentences: CommitSentence[] = [
        {
          id: 's1',
          text: 'From turn 1',
          source: { turn_hash: 'hash1', start_char: 0, end_char: 11 },
        },
        {
          id: 's2',
          text: 'From turn 2',
          source: { turn_hash: 'hash2', start_char: 0, end_char: 11 },
        },
        {
          id: 's3',
          text: 'Also turn 1',
          source: { turn_hash: 'hash1', start_char: 20, end_char: 31 },
        },
      ];

      const { byTurn } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(2);
      expect(byTurn.get('hash1')?.length).toBe(2);
      expect(byTurn.get('hash2')?.length).toBe(1);
    });

    test('preserves original sentence reference', () => {
      const sentences: CommitSentence[] = [
        {
          id: 's1',
          text: 'Test sentence',
          source: { turn_hash: 'hash1', start_char: 0, end_char: 13 },
        },
      ];

      const { byTurn } = groupSentencesByTurn(sentences);
      const group = byTurn.get('hash1')!;

      expect(group[0].sentence).toBe(sentences[0]);
      expect(group[0].sentence.text).toBe('Test sentence');
    });
  });

  describe('Edge Case Combinations', () => {
    test('handles empty sentences array', () => {
      const { byTurn, withoutSource } = groupSentencesByTurn([]);

      expect(byTurn.size).toBe(0);
      expect(withoutSource.length).toBe(0);
    });

    test('handles sentence with valid source but empty turn_hash', () => {
      const sentences: CommitSentence[] = [
        { id: 's1', text: 'Test', source: { turn_hash: '', start_char: 0, end_char: 4 } },
      ];

      const { byTurn, withoutSource } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(0);
      expect(withoutSource.length).toBe(1);
    });

    test('handles very long sentence text', () => {
      const longText = 'word '.repeat(1000);
      const sentences: CommitSentence[] = [
        {
          id: 's1',
          text: longText,
          source: { turn_hash: 'hash1', start_char: 0, end_char: longText.length },
        },
      ];

      const { byTurn } = groupSentencesByTurn(sentences);

      expect(byTurn.size).toBe(1);
      expect(byTurn.get('hash1')![0].sentence.text.length).toBe(longText.length);
    });
  });
});
