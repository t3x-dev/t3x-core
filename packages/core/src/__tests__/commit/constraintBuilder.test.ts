/**
 * Constraint Builder Tests
 */

import { describe, expect, it } from 'vitest';
import { buildConstraints, findBestSourceSentenceId } from '../../commit/constraintBuilder';
import type { Sentence } from '../../types/commit-v3';

function makeSentence(id: string, text: string, startChar = 0): Sentence {
  return {
    id,
    text,
    source: { turn_hash: 'sha256:test', start_char: startChar, end_char: startChar + text.length },
  };
}

describe('findBestSourceSentenceId', () => {
  it('finds matching sentence', () => {
    const sentences = [makeSentence('s1', 'Budget is $3000')];
    expect(findBestSourceSentenceId('$3000', sentences)).toBe('s1');
  });

  it('returns undefined for no match', () => {
    const sentences = [makeSentence('s1', 'Budget is $3000')];
    expect(findBestSourceSentenceId('$5000', sentences)).toBeUndefined();
  });

  it('returns undefined for empty value', () => {
    const sentences = [makeSentence('s1', 'text')];
    expect(findBestSourceSentenceId('', sentences)).toBeUndefined();
  });

  it('uses word boundary matching to avoid substring issues', () => {
    const sentences = [
      makeSentence('s1', 'Price is $5000'),
      makeSentence('s2', 'Discount is $500'),
    ];
    // "$500" should match s2 but NOT s1 ($5000 contains $500 as substring)
    expect(findBestSourceSentenceId('$500', sentences)).toBe('s2');
  });

  it('picks shortest sentence on multiple matches', () => {
    const sentences = [
      makeSentence('s1', 'The total budget including overhead is $3000', 0),
      makeSentence('s2', 'Budget is $3000', 100),
    ];
    expect(findBestSourceSentenceId('$3000', sentences)).toBe('s2');
  });

  it('uses start_char as tiebreaker when lengths are equal', () => {
    const sentences = [
      makeSentence('s1', 'Budget is $3000', 50),
      makeSentence('s2', 'Budget is $3000', 10),
    ];
    expect(findBestSourceSentenceId('$3000', sentences)).toBe('s2');
  });

  it('escapes regex special characters', () => {
    const sentences = [makeSentence('s1', 'Price is $3.14')];
    expect(findBestSourceSentenceId('$3.14', sentences)).toBe('s1');
  });
});

describe('buildConstraints', () => {
  const sentences = [
    makeSentence('s1', 'Budget is $3000'),
    makeSentence('s2', 'Timeline is Q1 2024'),
  ];

  it('builds require constraints from mustHave', () => {
    const result = buildConstraints(['$3000'], [], sentences);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('require');
    expect(result[0].value).toBe('$3000');
    expect((result[0] as { source_sentence_id?: string }).source_sentence_id).toBe('s1');
  });

  it('builds exclude constraints from mustntHave', () => {
    const result = buildConstraints([], ['profanity'], sentences);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('exclude');
    expect(result[0].value).toBe('profanity');
  });

  it('builds both require and exclude', () => {
    const result = buildConstraints(['$3000'], ['profanity'], sentences);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('require');
    expect(result[1].type).toBe('exclude');
  });

  it('assigns sequential IDs', () => {
    const result = buildConstraints(['a', 'b'], ['c'], sentences);
    expect(result.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('returns empty for no constraints', () => {
    expect(buildConstraints([], [], sentences)).toEqual([]);
  });

  it('sets match to exact', () => {
    const result = buildConstraints(['$3000'], ['bad'], sentences);
    expect(result[0].match).toBe('exact');
    expect(result[1].match).toBe('exact');
  });
});
