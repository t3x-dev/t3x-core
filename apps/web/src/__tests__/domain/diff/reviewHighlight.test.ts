import { describe, expect, it } from 'vitest';
import { reviewHighlight, withReviewHighlight } from '@/domain/diff/reviewHighlight';

function expectRoundTrip(from: string, to: string) {
  const result = reviewHighlight(from, to)!;
  expect(
    result
      .filter((s) => s.type !== 'added')
      .map((s) => s.text)
      .join('')
  ).toBe(from);
  expect(
    result
      .filter((s) => s.type !== 'removed')
      .map((s) => s.text)
      .join('')
  ).toBe(to);
  expect(result.every((s) => s.text.length > 0)).toBe(true);
  return result;
}

describe('exact review highlights', () => {
  it.each([
    ['', 'new'],
    ['old', ''],
    [' ', '\t'],
    ['Hello world', 'hello world'],
    ['first\r\n  old\tvalue\r\nlast\n', 'first\r\n  new  value\r\nlast\n'],
    ['标题\n你好世界', '标题\n你好朋友'],
    ['a\nb\nc', 'a\ninserted\nb\nc'],
    ['one\nrepeat\nrepeat\nend', 'one\nrepeat\nend'],
    [' a  b ', 'a b\t'],
    ['one\ntwo\n', 'one\r\ntwo\r\n'],
  ])('round-trips both sides: case %#', (from, to) => expectRoundTrip(from, to));

  it('highlights case-only edits instead of replaying the source case', () => {
    expect(reviewHighlight('Hello world', 'hello world')).toEqual([
      { type: 'removed', text: 'Hello' },
      { type: 'added', text: 'hello' },
      { type: 'unchanged', text: ' world' },
    ]);
  });

  it('anchors unchanged lines and refines just the changed sentence', () => {
    expect(
      reviewHighlight('Title\nKeep the old wording.\nEnd\n', 'Title\nKeep the new wording.\nEnd\n')
    ).toEqual([
      { type: 'unchanged', text: 'Title\nKeep the ' },
      { type: 'removed', text: 'old' },
      { type: 'added', text: 'new' },
      { type: 'unchanged', text: ' wording.\nEnd\n' },
    ]);
  });

  it('bounds quadratic work while preserving all text in a coarse fallback', () => {
    const from = `header\n${Array(700).fill('old').join(' ')}\nfooter`;
    const to = `header\n${Array(700).fill('new').join(' ')}\nfooter`;
    const result = expectRoundTrip(from, to);
    expect(result.filter((s) => s.type === 'removed')).toHaveLength(1);
    expect(result.filter((s) => s.type === 'added')).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'unchanged', text: 'header\n' });
    expect(reviewHighlight('a'.repeat(20_001), 'b')).toBeUndefined();
  });

  it('handles long documents with a small edit by trimming common lines', () => {
    const prefix = 'unchanged line\n'.repeat(600);
    const suffix = '\nsame suffix'.repeat(600);
    const result = expectRoundTrip(`${prefix}old${suffix}`, `${prefix}new${suffix}`);
    expect(result.find((s) => s.type === 'removed')?.text).toBe('old');
  });

  it('preserves supplied exact segments and leaves input immutable', () => {
    const wordDiff = [
      { type: 'removed' as const, text: 'A ' },
      { type: 'added' as const, text: 'a\t' },
    ];
    const slot = Object.freeze({
      key: 'text',
      type: 'changed' as const,
      oldValue: 'A ',
      newValue: 'a\t',
      wordDiff,
    });
    expect(withReviewHighlight(slot).highlight).toBe(wordDiff);
    expect(slot).not.toHaveProperty('highlight');
  });

  it('round-trips adversarial repeated whitespace and words deterministically', () => {
    const tokens = ['a', 'A', ' a ', '\t', '\n', '\r\n', '你', '🙂', 'b'];
    let seed = 17;
    const sample = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return tokens[seed % tokens.length];
    };
    for (let i = 0; i < 100; i++) {
      const from = Array.from({ length: 20 }, sample).join('');
      const to = `${Array.from({ length: 20 }, sample).join('')}!`;
      const result = expectRoundTrip(from, to);
      expect(reviewHighlight(from, to)).toEqual(result);
    }
  });
});
