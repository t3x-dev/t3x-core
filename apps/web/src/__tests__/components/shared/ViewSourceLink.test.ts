import { describe, expect, it } from 'vitest';
import { buildSourceUrl, parseHighlightParam } from '@/components/source-context/ViewSourceLink';

describe('ViewSourceLink utilities', () => {
  describe('buildSourceUrl', () => {
    it('builds URL with turn hash only', () => {
      const url = buildSourceUrl('proj_123', 'conv_456', 'sha256:abc');
      expect(url).toBe('/chat/conv_456?turn=sha256%3Aabc');
    });

    it('builds URL with highlight range', () => {
      const url = buildSourceUrl('proj_123', 'conv_456', 'sha256:abc', 10, 50);
      expect(url).toBe('/chat/conv_456?turn=sha256%3Aabc&highlight=10-50');
    });

    it('handles special characters in turn hash', () => {
      const url = buildSourceUrl('proj_123', 'conv_456', 'sha256:abc+def/ghi');
      expect(url).toContain('turn=');
      expect(url).toContain('sha256');
    });
  });

  describe('parseHighlightParam', () => {
    it('returns null for null input', () => {
      expect(parseHighlightParam(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseHighlightParam('')).toBeNull();
    });

    it('parses valid highlight range', () => {
      const result = parseHighlightParam('10-50');
      expect(result).toEqual({ start: 10, end: 50 });
    });

    it('parses range starting from 0', () => {
      const result = parseHighlightParam('0-100');
      expect(result).toEqual({ start: 0, end: 100 });
    });

    it('returns null for invalid format', () => {
      expect(parseHighlightParam('10')).toBeNull();
      expect(parseHighlightParam('10-')).toBeNull();
      expect(parseHighlightParam('-50')).toBeNull();
      expect(parseHighlightParam('abc-def')).toBeNull();
    });

    it('returns null for negative start', () => {
      expect(parseHighlightParam('-10-50')).toBeNull();
    });

    it('returns null for end <= start', () => {
      expect(parseHighlightParam('50-10')).toBeNull();
      expect(parseHighlightParam('50-50')).toBeNull();
    });
  });
});
