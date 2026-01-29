import { describe, expect, it } from 'vitest';
import {
  findWordBoundary,
  truncateLongContent,
  adjustHighlightsForTruncation,
  truncateWithHighlights,
  calculateTextSimilarity,
  checkContentIntegrity,
  DEFAULT_MAX_LENGTH,
  DEFAULT_CONTEXT_CHARS,
} from '@/lib/truncationUtils';

describe('truncationUtils', () => {
  describe('findWordBoundary', () => {
    const text = 'Hello world example text';

    it('returns 0 for position at start', () => {
      expect(findWordBoundary(text, 0, 'left')).toBe(0);
      expect(findWordBoundary(text, 0, 'right')).toBe(0);
    });

    it('returns text length for position at end', () => {
      expect(findWordBoundary(text, text.length, 'left')).toBe(text.length);
      expect(findWordBoundary(text, text.length, 'right')).toBe(text.length);
    });

    it('finds word start when going left', () => {
      // Position 8 is in the middle of "world"
      expect(findWordBoundary(text, 8, 'left')).toBe(6); // Start of "world"
    });

    it('finds word end when going right', () => {
      // Position 8 is in the middle of "world"
      expect(findWordBoundary(text, 8, 'right')).toBe(11); // End of "world"
    });

    it('handles position at whitespace', () => {
      // Position 5 is the space between "Hello" and "world"
      // Going left: moves to start of previous word ("Hello" starts at 0)
      // Going right: stays at 5 since it's already whitespace
      expect(findWordBoundary(text, 5, 'left')).toBe(0);
      expect(findWordBoundary(text, 5, 'right')).toBe(5);
    });
  });

  describe('truncateLongContent', () => {
    it('returns content unchanged if under max length', () => {
      const short = 'Short content';
      expect(truncateLongContent(short, [])).toBe(short);
    });

    it('truncates long content without highlights', () => {
      const long = 'A'.repeat(3000);
      const result = truncateLongContent(long, []);
      expect(result).toBe('A'.repeat(DEFAULT_MAX_LENGTH) + '...');
    });

    it('preserves highlight area with context', () => {
      // Create content where highlight is in the middle
      const content = 'A'.repeat(1000) + 'HIGHLIGHT' + 'B'.repeat(1000);
      const highlight = { start: 1000, end: 1009 };

      const result = truncateLongContent(content, [highlight]);

      expect(result).toContain('HIGHLIGHT');
      expect(result.startsWith('...')).toBe(true);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('adjustHighlightsForTruncation', () => {
    it('returns unchanged highlights if content is short', () => {
      const highlights = [{ start: 10, end: 20 }];
      const content = 'Short content';
      expect(adjustHighlightsForTruncation(highlights, content)).toEqual(highlights);
    });

    it('adjusts highlight positions after truncation', () => {
      const content = 'A'.repeat(1000) + 'HIGHLIGHT' + 'B'.repeat(1000);
      const highlights = [{ start: 1000, end: 1009 }];

      const adjusted = adjustHighlightsForTruncation(highlights, content);

      // After truncation, highlight should be at a different position
      expect(adjusted[0].start).toBeLessThan(1000);
      expect(adjusted[0].end - adjusted[0].start).toBe(9); // Same length
    });
  });

  describe('truncateWithHighlights', () => {
    it('returns empty array for empty text', () => {
      expect(truncateWithHighlights('', [])).toEqual([]);
    });

    it('returns full text as single segment if short and no highlights', () => {
      const result = truncateWithHighlights('Short text', []);
      expect(result).toEqual([{ type: 'text', content: 'Short text' }]);
    });

    it('creates highlight segment for highlighted text', () => {
      const text = 'Hello world example';
      const result = truncateWithHighlights(text, [{ start: 6, end: 11 }], { contextChars: 100 });

      expect(result).toContainEqual({ type: 'text', content: 'Hello ' });
      expect(result).toContainEqual({ type: 'highlight', content: 'world' });
      expect(result).toContainEqual({ type: 'text', content: ' example' });
    });

    it('adds ellipsis for truncated portions', () => {
      const text = 'A'.repeat(50) + 'HIGHLIGHT' + 'B'.repeat(50);
      const result = truncateWithHighlights(text, [{ start: 50, end: 59 }], { contextChars: 10 });

      const types = result.map((s) => s.type);
      expect(types).toContain('ellipsis');
      expect(types).toContain('highlight');
    });

    it('respects maxHighlights option', () => {
      const text = 'one TWO three FOUR five';
      const highlights = [
        { start: 4, end: 7 }, // TWO
        { start: 14, end: 18 }, // FOUR
      ];

      const result = truncateWithHighlights(text, highlights, {
        contextChars: 100,
        maxHighlights: 1,
      });

      const highlightSegments = result.filter((s) => s.type === 'highlight');
      expect(highlightSegments.length).toBe(1);
      expect(highlightSegments[0].content).toBe('TWO');
    });
  });

  describe('calculateTextSimilarity', () => {
    it('returns 1 for identical strings', () => {
      expect(calculateTextSimilarity('hello world', 'hello world')).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
      expect(calculateTextSimilarity('hello', 'goodbye')).toBe(0);
    });

    it('returns 0 for empty strings', () => {
      expect(calculateTextSimilarity('', 'hello')).toBe(0);
      expect(calculateTextSimilarity('hello', '')).toBe(0);
    });

    it('is case insensitive', () => {
      expect(calculateTextSimilarity('Hello World', 'hello world')).toBe(1);
    });

    it('calculates partial similarity', () => {
      const similarity = calculateTextSimilarity('hello world', 'hello there');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('checkContentIntegrity', () => {
    it('returns valid for exact match', () => {
      const content = 'The quick brown fox jumps';
      expect(checkContentIntegrity('quick brown', content, 4, 15)).toBe('valid');
    });

    it('returns mismatch for invalid boundaries', () => {
      expect(checkContentIntegrity('test', 'content', -1, 4)).toBe('mismatch');
      expect(checkContentIntegrity('test', 'content', 10, 5)).toBe('mismatch');
      expect(checkContentIntegrity('test', 'content', 0, 100)).toBe('mismatch');
    });

    it('returns valid for close matches (>90% similar)', () => {
      const content = 'The quick brown fox jumps over';
      // Minor whitespace difference should still be valid
      expect(checkContentIntegrity('quick  brown', content, 4, 15)).toBe('valid');
    });

    it('returns mismatch for different content', () => {
      const content = 'The quick brown fox jumps';
      expect(checkContentIntegrity('slow red dog', content, 4, 15)).toBe('mismatch');
    });
  });
});
