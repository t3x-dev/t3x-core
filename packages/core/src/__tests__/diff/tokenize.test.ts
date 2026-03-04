/**
 * Tokenizer Tests
 */

import { describe, expect, it } from 'vitest';
import { lightStem, tokenize, tokenizeForMatching } from '../../diff/tokenize';

describe('tokenize', () => {
  it('splits on word boundaries preserving case', () => {
    expect(tokenize('Budget is $3000')).toEqual(['Budget', 'is', '3000']);
  });

  it('strips punctuation (isWordLike filter)', () => {
    expect(tokenize('Hello, World!')).toEqual(['Hello', 'World']);
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

  it('preserves original case', () => {
    expect(tokenize('ABC DEF')).toEqual(['ABC', 'DEF']);
  });

  it('handles single word', () => {
    expect(tokenize('Hello')).toEqual(['Hello']);
  });

  it('preserves numbers, strips currency/percent symbols', () => {
    expect(tokenize('$3.14 100%')).toEqual(['3.14', '100']);
  });

  it('handles CJK text (Chinese word boundaries)', () => {
    expect(tokenize('用户需要登录功能')).toEqual(['用户', '需要', '登录', '功能']);
  });
});

describe('lightStem', () => {
  it('stems -ies to -y', () => {
    expect(lightStem('policies')).toBe('policy');
    expect(lightStem('companies')).toBe('company');
  });

  it('stems -ses/-xes/-zes', () => {
    expect(lightStem('buses')).toBe('bus');
    expect(lightStem('boxes')).toBe('box');
    expect(lightStem('buzzes')).toBe('buzz');
  });

  it('stems -ches/-shes', () => {
    expect(lightStem('watches')).toBe('watch');
    expect(lightStem('crashes')).toBe('crash');
  });

  it('stems -s (regular plural)', () => {
    expect(lightStem('users')).toBe('user');
    expect(lightStem('models')).toBe('model');
  });

  it('does not stem -ss words', () => {
    expect(lightStem('boss')).toBe('boss');
    expect(lightStem('lass')).toBe('lass');
  });

  it('stems -ed', () => {
    expect(lightStem('updated')).toBe('updat');
    expect(lightStem('created')).toBe('creat');
  });

  it('stems -ing', () => {
    expect(lightStem('running')).toBe('runn');
    expect(lightStem('creating')).toBe('creat');
  });

  it('stems -ly', () => {
    expect(lightStem('quickly')).toBe('quick');
    expect(lightStem('slowly')).toBe('slow');
  });

  it('does not stem short words (<=3 chars)', () => {
    expect(lightStem('is')).toBe('is');
    expect(lightStem('the')).toBe('the');
    expect(lightStem('a')).toBe('a');
  });

  it('stems -ied to -y', () => {
    expect(lightStem('applied')).toBe('apply');
    expect(lightStem('carried')).toBe('carry');
  });
});

describe('tokenizeForMatching', () => {
  it('strips leading/trailing punctuation', () => {
    expect(tokenizeForMatching('"Hello," world!')).toEqual(['hello', 'world']);
  });

  it('applies light stemming', () => {
    const tokens = tokenizeForMatching('running quickly');
    expect(tokens).toEqual(['runn', 'quick']);
  });

  it('lowercases all tokens', () => {
    expect(tokenizeForMatching('ABC DEF')).toEqual(['abc', 'def']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenizeForMatching('')).toEqual([]);
  });

  it('filters out punctuation-only tokens', () => {
    expect(tokenizeForMatching('--- ...')).toEqual([]);
  });

  it('handles mixed content', () => {
    const tokens = tokenizeForMatching('The users updated their policies.');
    expect(tokens).toEqual(['the', 'user', 'updat', 'their', 'policy']);
  });
});
