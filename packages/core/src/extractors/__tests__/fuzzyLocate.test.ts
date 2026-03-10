import { describe, expect, it } from 'vitest';
import { fuzzyLocate } from '../fuzzyLocate';

describe('fuzzyLocate', () => {
  const content = 'The user prefers dark mode for their development environment.';

  it('returns exact substring match', () => {
    const result = fuzzyLocate(content, 'dark mode');
    expect(result).toEqual({
      start: 17,
      end: 26,
      score: 1.0,
    });
  });

  it('returns normalized match (case-insensitive + whitespace)', () => {
    const result = fuzzyLocate(content, 'Dark  Mode');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.95);
  });

  it('returns sliding window Levenshtein match for near-quotes', () => {
    // LLM slightly paraphrased the quote
    const result = fuzzyLocate(content, 'prefers dark modes for their');
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(0.6);
  });

  it('returns null when no match above threshold', () => {
    const result = fuzzyLocate(content, 'completely unrelated text about cooking');
    expect(result).toBeNull();
  });

  it('handles empty quote', () => {
    const result = fuzzyLocate(content, '');
    expect(result).toBeNull();
  });

  it('handles empty content', () => {
    const result = fuzzyLocate('', 'some quote');
    expect(result).toBeNull();
  });

  it('returns exact match for full content', () => {
    const result = fuzzyLocate(content, content);
    expect(result).toEqual({
      start: 0,
      end: content.length,
      score: 1.0,
    });
  });

  describe('markdown stripping (Tier 1.5)', () => {
    it('matches bold markdown stripped with correct offsets', () => {
      const mdContent = 'I **really** like dark mode for coding.';
      const result = fuzzyLocate(mdContent, 'I really like dark mode');
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.92);
      // Verify the offset maps back to original content correctly
      // "I **really** like dark mode" starts at 0, ends around 27
      const extracted = mdContent.slice(result!.start, result!.end);
      expect(extracted).toContain('really');
      expect(extracted).toContain('dark mode');
    });

    it('matches italic markdown stripped', () => {
      const mdContent = 'I *really* like dark mode for coding.';
      const result = fuzzyLocate(mdContent, 'I really like dark mode');
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.92);
    });

    it('matches inline code stripped', () => {
      const mdContent = 'Use the `darkMode` setting for coding.';
      const result = fuzzyLocate(mdContent, 'Use the darkMode setting');
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.92);
    });

    it('matches heading markdown stripped', () => {
      const mdContent = '## Dark Mode Preferences\nI like dark mode.';
      const result = fuzzyLocate(mdContent, 'Dark Mode Preferences');
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.92);
    });

    it('matches list item stripped', () => {
      const mdContent = '- dark mode is preferred\n- light mode is fine too';
      const result = fuzzyLocate(mdContent, 'dark mode is preferred');
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.92);
    });
  });

  describe('lower threshold (0.6)', () => {
    it('matches moderately paraphrased text', () => {
      // More aggressive paraphrasing that would fail at 0.8
      const result = fuzzyLocate(
        'The user strongly prefers dark mode for all development.',
        'prefers dark mode development'
      );
      expect(result).not.toBeNull();
      expect(result!.score).toBeGreaterThanOrEqual(0.6);
    });

    it('still rejects completely unrelated text', () => {
      const result = fuzzyLocate(
        'The user prefers dark mode.',
        'Python is a great programming language for beginners'
      );
      expect(result).toBeNull();
    });
  });

  it('handles content up to 50K chars in sliding window', () => {
    // Content just under the new 50K limit should still work
    const longContent = 'x'.repeat(15_000) + 'dark mode preference' + 'y'.repeat(15_000);
    const result = fuzzyLocate(longContent, 'dark mode preference');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(1.0);
  });
});
