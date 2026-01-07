/**
 * Rule-based sentence splitter tests
 */

import { describe, expect, it } from 'vitest';
import { splitSentencesRuleBased } from '../../providers/nlp/sentenceRules';

describe('splitSentencesRuleBased', () => {
  it('splits on basic punctuation', () => {
    const text = 'Hello world. Goodbye world!';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences.map((s) => s.text)).toEqual(['Hello world.', 'Goodbye world!']);
  });

  it('splits on CJK punctuation', () => {
    const text = '\u4F60\u597D\u3002\u518D\u89C1\uFF01';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences.map((s) => s.text)).toEqual(['\u4F60\u597D\u3002', '\u518D\u89C1\uFF01']);
  });

  it('keeps numeric list markers with their content', () => {
    const text = '1. First item\n2. Second item';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences.map((s) => s.text)).toEqual(['1. First item', '2. Second item']);
  });

  it('avoids splitting on decimals', () => {
    const text = 'Price is 3.14. Next.';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences.map((s) => s.text)).toEqual(['Price is 3.14.', 'Next.']);
  });

  it('avoids splitting on common abbreviations', () => {
    const text = 'Dr. Smith went home. Next.';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences.map((s) => s.text)).toEqual(['Dr. Smith went home.', 'Next.']);
  });

  it('drops empty or whitespace-only segments', () => {
    const text = ' \n \n ';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences).toHaveLength(0);
  });

  it('drops separator-only lines', () => {
    const text = 'Hello.\n\u2E3B\nWorld.';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences.map((s) => s.text)).toEqual(['Hello.', 'World.']);
  });

  it('drops object replacement characters', () => {
    const text = 'Hello.\n\uFFFC\nWorld.';
    const sentences = splitSentencesRuleBased(text);
    expect(sentences.map((s) => s.text)).toEqual(['Hello.', 'World.']);
  });
});
