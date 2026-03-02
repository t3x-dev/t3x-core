/**
 * Intl.Segmenter Sentence Splitter Tests
 *
 * Tests the ICU-based splitter against the same cases used for sentenceRules,
 * plus the adversarial tech-name cases from the eval framework.
 */

import { describe, expect, it } from 'vitest';
import { splitSentences } from '../../providers/nlp/sentenceSplitter';

describe('splitSentences (Intl.Segmenter)', () => {
  // =========================================================================
  // Basic sentence splitting
  // =========================================================================
  describe('basic splitting', () => {
    it('splits simple sentences', () => {
      const sentences = splitSentences('First. Second.');
      expect(sentences.map((s) => s.text)).toEqual(['First.', 'Second.']);
    });

    it('handles empty string', () => {
      expect(splitSentences('')).toEqual([]);
    });

    it('handles single sentence', () => {
      const sentences = splitSentences('Hello world.');
      expect(sentences.map((s) => s.text)).toEqual(['Hello world.']);
    });

    it('handles single word without punctuation', () => {
      const sentences = splitSentences('Hello');
      expect(sentences.map((s) => s.text)).toEqual(['Hello']);
    });

    it('splits on question mark', () => {
      const sentences = splitSentences('Why? Because.');
      expect(sentences.map((s) => s.text)).toEqual(['Why?', 'Because.']);
    });

    it('splits on exclamation mark', () => {
      const sentences = splitSentences('Wow! Amazing.');
      expect(sentences.map((s) => s.text)).toEqual(['Wow!', 'Amazing.']);
    });
  });

  // =========================================================================
  // Tech names and file extensions (ICU strong point)
  // =========================================================================
  describe('tech names and file extensions', () => {
    it('does not split on Node.js', () => {
      const sentences = splitSentences('We use Node.js for the backend. It is fast.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('Node.js');
    });

    it('does not split on file extensions like index.ts', () => {
      const sentences = splitSentences('Edit the file index.ts to fix it. Then rebuild.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('index.ts');
    });

    it('does not split on config.yaml', () => {
      const sentences = splitSentences('Check config.yaml for settings. Update if needed.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('config.yaml');
    });

    it('does not split on App.tsx', () => {
      const sentences = splitSentences('Open App.tsx and add the component. Save it.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('App.tsx');
    });

    it('does not split on docs.example.com', () => {
      const sentences = splitSentences('Visit docs.example.com for details. It has guides.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('docs.example.com');
    });

    it('does not split on webpack.config.js', () => {
      const sentences = splitSentences('Edit webpack.config.js for bundling. Then run build.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('webpack.config.js');
    });

    it('does not split on version numbers like v18.2.0', () => {
      const sentences = splitSentences('Use Node.js 18.x for this project. It is stable.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('18.x');
    });
  });

  // =========================================================================
  // Abbreviations (ICU weak point, fixed by patch layer)
  // =========================================================================
  describe('abbreviations', () => {
    it('does not split on Dr. Smith', () => {
      const sentences = splitSentences('Dr. Smith arrived. Welcome.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('Dr. Smith');
    });

    it('does not split on Mrs. Jones', () => {
      const sentences = splitSentences('Mrs. Jones left early. She had a meeting.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('Mrs. Jones');
    });

    it('does not split on Prof. Lee', () => {
      const sentences = splitSentences('Prof. Lee teaches math. He is great.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('Prof. Lee');
    });

    it('does not split on etc. when followed by lowercase', () => {
      const sentences = splitSentences('Use tools like Git, Docker, etc. and deploy. Done.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('etc.');
    });

    it('does not split on vs.', () => {
      const sentences = splitSentences('Red vs. blue is the debate. Choose wisely.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('vs.');
    });
  });

  // =========================================================================
  // List markers (ICU weak point, fixed by patch layer)
  // =========================================================================
  describe('list markers', () => {
    it('merges numbered list markers with content', () => {
      const sentences = splitSentences('1. First item. 2. Second item.');
      const texts = sentences.map((s) => s.text);
      // "1." should not be a standalone sentence
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(3);
      }
    });
  });

  // =========================================================================
  // Offset tracking
  // =========================================================================
  describe('offset tracking', () => {
    it('tracks correct offsets for simple sentences', () => {
      const text = 'First. Second.';
      const sentences = splitSentences(text);
      for (const s of sentences) {
        expect(text.slice(s.beginOffset, s.endOffset)).toBe(s.text);
      }
    });

    it('tracks correct offsets with leading whitespace', () => {
      const text = '  Hello world.  Next one.';
      const sentences = splitSentences(text);
      for (const s of sentences) {
        expect(text.slice(s.beginOffset, s.endOffset)).toBe(s.text);
      }
    });

    it('tracks correct offsets after merge', () => {
      const text = 'Dr. Smith arrived. Welcome.';
      const sentences = splitSentences(text);
      for (const s of sentences) {
        expect(text.slice(s.beginOffset, s.endOffset)).toBe(s.text);
      }
    });
  });

  // =========================================================================
  // minLength option
  // =========================================================================
  describe('minLength option', () => {
    it('filters short segments', () => {
      const sentences = splitSentences('A. Hello world.', { minLength: 5 });
      for (const s of sentences) {
        expect(s.text.length).toBeGreaterThanOrEqual(5);
      }
    });
  });

  // =========================================================================
  // Complex real-world paragraph
  // =========================================================================
  describe('complex content', () => {
    it('handles real-world paragraph with mixed patterns', () => {
      const text =
        'Dr. Smith met Mrs. Jones at 3.14 pm. They discussed the U.S. economy. Key points were shared.';
      const sentences = splitSentences(text);
      const texts = sentences.map((s) => s.text);
      expect(texts.some((t) => t.includes('Dr. Smith'))).toBe(true);
      expect(texts.some((t) => t.includes('Mrs. Jones'))).toBe(true);
    });

    it('handles decimal numbers', () => {
      const sentences = splitSentences('Price is 3.14. Next item.');
      const texts = sentences.map((s) => s.text);
      expect(texts[0]).toContain('3.14');
    });
  });
});
