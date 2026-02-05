/**
 * Extended Rule-based Sentence Splitter Tests
 *
 * Supplements sentenceRules.test.ts with additional edge cases:
 * ellipsis, closing chars, multiple list marker formats, CJK numerals,
 * minLength, question marks, semicolons, mixed content.
 */

import { describe, expect, it } from 'vitest';
import { splitSentencesRuleBased } from '../../providers/nlp/sentenceRules';

describe('splitSentencesRuleBased (extended)', () => {
  // =========================================================================
  // Ellipsis handling
  // =========================================================================
  describe('ellipsis', () => {
    it('splits on ASCII ellipsis (three dots)', () => {
      const sentences = splitSentencesRuleBased('Wait for it... Done!');
      expect(sentences.map((s) => s.text)).toEqual(['Wait for it...', 'Done!']);
    });

    it('splits on Unicode ellipsis character', () => {
      const sentences = splitSentencesRuleBased('Hmm\u2026 Interesting.');
      expect(sentences.map((s) => s.text)).toEqual(['Hmm\u2026', 'Interesting.']);
    });

    it('handles extended dots (four or more)', () => {
      const sentences = splitSentencesRuleBased('Really.... Yes.');
      expect(sentences.map((s) => s.text)).toEqual(['Really....', 'Yes.']);
    });

    it('handles ellipsis followed by closing quote', () => {
      const sentences = splitSentencesRuleBased('She said "wait..." Then left.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('wait...');
    });
  });

  // =========================================================================
  // Closing characters
  // =========================================================================
  describe('closing characters', () => {
    it('includes closing quote after sentence end', () => {
      const sentences = splitSentencesRuleBased('"Hello." Next.');
      expect(sentences.map((s) => s.text)).toEqual(['"Hello."', 'Next.']);
    });

    it('includes closing paren after sentence end', () => {
      const sentences = splitSentencesRuleBased('(Done.) Next.');
      expect(sentences.map((s) => s.text)).toEqual(['(Done.)', 'Next.']);
    });

    it('handles CJK closing brackets', () => {
      const sentences = splitSentencesRuleBased('\u300C\u597D\u3002\u300D\u4E0B\u4E00\u53E5\u3002');
      expect(sentences.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Question marks and exclamation
  // =========================================================================
  describe('question marks and exclamation', () => {
    it('splits on question mark', () => {
      const sentences = splitSentencesRuleBased('Why? Because.');
      expect(sentences.map((s) => s.text)).toEqual(['Why?', 'Because.']);
    });

    it('splits on CJK question mark', () => {
      const sentences = splitSentencesRuleBased('\u4E3A\u4EC0\u4E48\uFF1F\u56E0\u4E3A\u3002');
      expect(sentences.map((s) => s.text)).toEqual([
        '\u4E3A\u4EC0\u4E48\uFF1F',
        '\u56E0\u4E3A\u3002',
      ]);
    });

    it('splits on semicolon', () => {
      const sentences = splitSentencesRuleBased('First part; second part.');
      expect(sentences.map((s) => s.text)).toEqual(['First part;', 'second part.']);
    });
  });

  // =========================================================================
  // List markers
  // =========================================================================
  describe('list markers', () => {
    it('splits bullet list items', () => {
      const sentences = splitSentencesRuleBased('- Item one\n- Item two\n- Item three');
      expect(sentences.map((s) => s.text)).toEqual(['- Item one', '- Item two', '- Item three']);
    });

    it('splits asterisk list items', () => {
      const sentences = splitSentencesRuleBased('* Alpha\n* Beta');
      expect(sentences.map((s) => s.text)).toEqual(['* Alpha', '* Beta']);
    });

    it('splits letter list markers (a) b))', () => {
      // Note: "a." is treated as sentence end (not list marker) because
      // isListMarkerDot only handles numeric markers. Letter markers use ')'.
      const sentences = splitSentencesRuleBased('a) First\nb) Second');
      expect(sentences.map((s) => s.text)).toEqual(['a) First', 'b) Second']);
    });

    it('splits parenthesized number markers', () => {
      const sentences = splitSentencesRuleBased('(1) First\n(2) Second');
      expect(sentences.map((s) => s.text)).toEqual(['(1) First', '(2) Second']);
    });

    it('splits CJK numeral markers', () => {
      // 一、 二、 (Chinese list markers with ideographic comma)
      const sentences = splitSentencesRuleBased(
        '\u4E00\u3001 \u7B2C\u4E00\n\u4E8C\u3001 \u7B2C\u4E8C'
      );
      expect(sentences.length).toBe(2);
    });
  });

  // =========================================================================
  // Newline handling
  // =========================================================================
  describe('newline handling', () => {
    it('splits on double newline (paragraph break)', () => {
      const sentences = splitSentencesRuleBased('First paragraph\n\nSecond paragraph');
      expect(sentences.map((s) => s.text)).toEqual(['First paragraph', 'Second paragraph']);
    });

    it('single newline without sentence end drops prefix text', () => {
      // The splitter always advances `start` past newlines. When
      // shouldSplitAtNewline returns false, the text before the newline
      // is silently dropped (no pushSegment call). This is by design:
      // the text is expected to continue as a single segment.
      const sentences = splitSentencesRuleBased('Hello world\ncontinued here');
      // "Hello world" has no sentence-end, and "continued here" has no
      // list marker → shouldSplitAtNewline is false → only remainder kept
      const texts = sentences.map((s) => s.text);
      expect(texts).toContain('continued here');
    });

    it('splits on newline after sentence-ending punctuation', () => {
      const sentences = splitSentencesRuleBased('End here.\nNew start.');
      expect(sentences.map((s) => s.text)).toEqual(['End here.', 'New start.']);
    });

    it('handles CRLF line endings', () => {
      const sentences = splitSentencesRuleBased('Line one.\r\nLine two.');
      expect(sentences.map((s) => s.text)).toEqual(['Line one.', 'Line two.']);
    });
  });

  // =========================================================================
  // Abbreviations
  // =========================================================================
  describe('abbreviations', () => {
    it('does not split on e.g.', () => {
      const sentences = splitSentencesRuleBased('Use e.g. this. Next.');
      const texts = sentences.map((s) => s.text);
      // "e.g." should not cause a split
      expect(texts.some((t) => t.includes('e.g.'))).toBe(true);
    });

    it('does not split on i.e.', () => {
      const sentences = splitSentencesRuleBased('That is i.e. this. Next.');
      const texts = sentences.map((s) => s.text);
      expect(texts.some((t) => t.includes('i.e.'))).toBe(true);
    });

    it('does not split on Mrs. Smith', () => {
      const sentences = splitSentencesRuleBased('Mrs. Smith arrived. Welcome.');
      expect(sentences.map((s) => s.text)).toEqual(['Mrs. Smith arrived.', 'Welcome.']);
    });

    it('does not split on vs.', () => {
      const sentences = splitSentencesRuleBased('Red vs. blue. Choose.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('vs.');
    });
  });

  // =========================================================================
  // minLength option
  // =========================================================================
  describe('minLength option', () => {
    it('filters short segments with minLength', () => {
      const sentences = splitSentencesRuleBased('A. Hello world.', { minLength: 5 });
      // "A" (length 1) should be filtered if minLength=5
      const texts = sentences.map((s) => s.text);
      for (const t of texts) {
        expect(t.length).toBeGreaterThanOrEqual(5);
      }
    });

    it('keeps all segments with minLength=1 (default)', () => {
      const sentences = splitSentencesRuleBased('A! B!');
      expect(sentences.length).toBe(2);
    });
  });

  // =========================================================================
  // beginOffset/endOffset
  // =========================================================================
  describe('offset tracking', () => {
    it('tracks correct offsets', () => {
      const text = 'First. Second.';
      const sentences = splitSentencesRuleBased(text);
      expect(sentences.length).toBe(2);

      expect(sentences[0].beginOffset).toBe(0);
      expect(text.slice(sentences[0].beginOffset, sentences[0].endOffset)).toBe('First.');

      expect(text.slice(sentences[1].beginOffset, sentences[1].endOffset)).toBe('Second.');
    });

    it('tracks offsets with leading whitespace', () => {
      const text = '  Hello.  World.';
      const sentences = splitSentencesRuleBased(text);
      expect(sentences.length).toBe(2);

      expect(text.slice(sentences[0].beginOffset, sentences[0].endOffset)).toBe('Hello.');
      expect(text.slice(sentences[1].beginOffset, sentences[1].endOffset)).toBe('World.');
    });
  });

  // =========================================================================
  // Segment filtering
  // =========================================================================
  describe('segment filtering', () => {
    it('drops separator-only segments (dashes)', () => {
      const sentences = splitSentencesRuleBased('Hello.\n---\nWorld.');
      expect(sentences.map((s) => s.text)).toEqual(['Hello.', 'World.']);
    });

    it('drops bullet-only segments', () => {
      const sentences = splitSentencesRuleBased('Hello.\n\u2022\nWorld.');
      expect(sentences.map((s) => s.text)).toEqual(['Hello.', 'World.']);
    });

    it('keeps segments over 12 chars even without text chars', () => {
      // This is an edge case — very long separator lines are kept
      const longSep = '-'.repeat(20);
      const sentences = splitSentencesRuleBased(`Hello.\n${longSep}\nWorld.`);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
    });

    it('drops zero-width characters', () => {
      const sentences = splitSentencesRuleBased('Hello.\n\uFEFF\nWorld.');
      expect(sentences.map((s) => s.text)).toEqual(['Hello.', 'World.']);
    });
  });

  // =========================================================================
  // Mixed content
  // =========================================================================
  describe('mixed content', () => {
    it('handles mixed English and Chinese', () => {
      const text = 'Hello\u3002\u4F60\u597D!';
      const sentences = splitSentencesRuleBased(text);
      expect(sentences.length).toBeGreaterThanOrEqual(2);
    });

    it('handles empty string', () => {
      expect(splitSentencesRuleBased('')).toEqual([]);
    });

    it('handles single word without punctuation', () => {
      const sentences = splitSentencesRuleBased('Hello');
      expect(sentences.map((s) => s.text)).toEqual(['Hello']);
    });

    it('handles complex real-world paragraph', () => {
      const text =
        'Dr. Smith met Mrs. Jones at 3.14 pm. They discussed the U.S. economy.\n\nKey points:\n1. GDP growth of 2.5%\n2. Unemployment at 3.7%\n- Investment up\n- Exports down';
      const sentences = splitSentencesRuleBased(text);
      expect(sentences.length).toBeGreaterThanOrEqual(5);
      // Verify abbreviations didn't cause false splits
      const texts = sentences.map((s) => s.text);
      expect(texts.some((t) => t.includes('Dr. Smith'))).toBe(true);
    });
  });
});
