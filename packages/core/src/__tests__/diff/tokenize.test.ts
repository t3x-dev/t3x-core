/**
 * Tokenizer Tests
 */

import { describe, expect, it } from 'vitest';
import { tokenize } from '../../diff/tokenize';

describe('tokenize', () => {
  it('splits on whitespace and lowercases', () => {
    expect(tokenize('Budget is $3000')).toEqual(['budget', 'is', '$3000']);
  });

  it('preserves punctuation attached to words', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello,', 'world!']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(tokenize('   ')).toEqual([]);
  });

  it('handles multiple spaces between words', () => {
    expect(tokenize('a   b   c')).toEqual(['a', 'b', 'c']);
  });

  it('handles tabs and newlines', () => {
    expect(tokenize('a\tb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('lowercases all tokens', () => {
    expect(tokenize('ABC DEF')).toEqual(['abc', 'def']);
  });

  it('handles single word', () => {
    expect(tokenize('Hello')).toEqual(['hello']);
  });

  it('preserves numbers and special chars', () => {
    expect(tokenize('$3.14 100%')).toEqual(['$3.14', '100%']);
  });
});
