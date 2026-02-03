import { describe, expect, it } from 'vitest';
import {
  calculateHighlightCoverage,
  clampHighlightRange,
  filterHighlightsInWindow,
  isValidHighlightRange,
  mergeHighlightRanges,
  offsetHighlightRanges,
  rangesAdjacent,
  rangesOverlap,
} from '@/lib/highlightUtils';

describe('highlightUtils', () => {
  describe('mergeHighlightRanges', () => {
    it('returns empty array for empty input', () => {
      expect(mergeHighlightRanges([])).toEqual([]);
    });

    it('returns single range unchanged', () => {
      expect(mergeHighlightRanges([{ start: 0, end: 10 }])).toEqual([{ start: 0, end: 10 }]);
    });

    it('merges overlapping ranges', () => {
      const result = mergeHighlightRanges([
        { start: 0, end: 10 },
        { start: 5, end: 15 },
      ]);
      expect(result).toEqual([{ start: 0, end: 15 }]);
    });

    it('merges adjacent ranges (gap = 1)', () => {
      const result = mergeHighlightRanges([
        { start: 0, end: 10 },
        { start: 11, end: 20 },
      ]);
      expect(result).toEqual([{ start: 0, end: 20 }]);
    });

    it('does not merge separate ranges (gap > 1)', () => {
      const result = mergeHighlightRanges([
        { start: 0, end: 10 },
        { start: 12, end: 20 },
      ]);
      expect(result).toEqual([
        { start: 0, end: 10 },
        { start: 12, end: 20 },
      ]);
    });

    it('handles unsorted input', () => {
      const result = mergeHighlightRanges([
        { start: 20, end: 30 },
        { start: 0, end: 10 },
        { start: 5, end: 15 },
      ]);
      expect(result).toEqual([
        { start: 0, end: 15 },
        { start: 20, end: 30 },
      ]);
    });

    it('merges multiple overlapping ranges', () => {
      const result = mergeHighlightRanges([
        { start: 0, end: 10 },
        { start: 8, end: 15 },
        { start: 14, end: 25 },
      ]);
      expect(result).toEqual([{ start: 0, end: 25 }]);
    });
  });

  describe('rangesOverlap', () => {
    it('returns true for overlapping ranges', () => {
      expect(rangesOverlap({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
    });

    it('returns false for non-overlapping ranges', () => {
      expect(rangesOverlap({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    });

    it('returns false for adjacent ranges', () => {
      expect(rangesOverlap({ start: 0, end: 10 }, { start: 11, end: 20 })).toBe(false);
    });
  });

  describe('rangesAdjacent', () => {
    it('returns true for adjacent ranges', () => {
      expect(rangesAdjacent({ start: 0, end: 10 }, { start: 11, end: 20 })).toBe(true);
    });

    it('returns true for overlapping ranges (they are also adjacent)', () => {
      expect(rangesAdjacent({ start: 0, end: 10 }, { start: 5, end: 15 })).toBe(true);
    });

    it('returns false for separate ranges', () => {
      expect(rangesAdjacent({ start: 0, end: 10 }, { start: 12, end: 20 })).toBe(false);
    });
  });

  describe('calculateHighlightCoverage', () => {
    it('returns 0 for empty content', () => {
      expect(calculateHighlightCoverage(0, [{ start: 0, end: 10 }])).toBe(0);
    });

    it('returns 0 for no highlights', () => {
      expect(calculateHighlightCoverage(100, [])).toBe(0);
    });

    it('calculates correct coverage', () => {
      expect(calculateHighlightCoverage(100, [{ start: 0, end: 25 }])).toBe(0.25);
    });

    it('handles overlapping highlights correctly', () => {
      const coverage = calculateHighlightCoverage(100, [
        { start: 0, end: 20 },
        { start: 10, end: 30 },
      ]);
      expect(coverage).toBe(0.3); // 30 chars total after merge
    });
  });

  describe('clampHighlightRange', () => {
    it('returns null for completely out of bounds range', () => {
      expect(clampHighlightRange({ start: 100, end: 110 }, 50)).toBeNull();
    });

    it('clamps range to content bounds', () => {
      expect(clampHighlightRange({ start: -5, end: 60 }, 50)).toEqual({ start: 0, end: 50 });
    });

    it('returns unchanged range if within bounds', () => {
      expect(clampHighlightRange({ start: 10, end: 20 }, 50)).toEqual({ start: 10, end: 20 });
    });
  });

  describe('isValidHighlightRange', () => {
    it('returns true for valid range', () => {
      expect(isValidHighlightRange({ start: 10, end: 20 }, 50)).toBe(true);
    });

    it('returns false for negative start', () => {
      expect(isValidHighlightRange({ start: -1, end: 10 }, 50)).toBe(false);
    });

    it('returns false for start >= end', () => {
      expect(isValidHighlightRange({ start: 10, end: 10 }, 50)).toBe(false);
    });

    it('returns false for end > content length', () => {
      expect(isValidHighlightRange({ start: 10, end: 60 }, 50)).toBe(false);
    });
  });

  describe('offsetHighlightRanges', () => {
    it('offsets ranges by positive amount', () => {
      const result = offsetHighlightRanges([{ start: 10, end: 20 }], 5);
      expect(result).toEqual([{ start: 15, end: 25 }]);
    });

    it('offsets ranges by negative amount', () => {
      const result = offsetHighlightRanges([{ start: 10, end: 20 }], -5);
      expect(result).toEqual([{ start: 5, end: 15 }]);
    });
  });

  describe('filterHighlightsInWindow', () => {
    it('returns empty for highlights outside window', () => {
      const result = filterHighlightsInWindow([{ start: 0, end: 10 }], 20, 30);
      expect(result).toEqual([]);
    });

    it('clips highlights to window and adjusts positions', () => {
      const result = filterHighlightsInWindow([{ start: 5, end: 25 }], 10, 20);
      expect(result).toEqual([{ start: 0, end: 10 }]); // Clipped to 10-20, adjusted to 0-10
    });

    it('returns fully contained highlight with adjusted position', () => {
      const result = filterHighlightsInWindow([{ start: 15, end: 18 }], 10, 20);
      expect(result).toEqual([{ start: 5, end: 8 }]); // 15-10=5, 18-10=8
    });
  });
});
