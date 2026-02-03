/**
 * Commit Builders Tests
 *
 * Tests for sentence, constraint, and author builders.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildConstraints,
  buildSentencesFromSegments,
  findBestSourceSentenceId,
  getDockerAuthor,
  getLocalAuthor,
  getWebAuthor,
} from '../../commit';
import type { Segment } from '../../extractors/types';
import type { Sentence } from '../../types/commit-v3';

describe('buildSentencesFromSegments', () => {
  it('converts segments to sentences with correct structure', () => {
    const segments: Segment[] = [
      { segmentId: 's-1', text: 'Service fee is $5000.', startChar: 0, endChar: 21 },
      { segmentId: 's-2', text: 'Payment due in 30 days.', startChar: 22, endChar: 45 },
    ];
    const turnHash = 'sha256:abc123';

    const sentences = buildSentencesFromSegments(segments, turnHash);

    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toEqual({
      id: 's-1',
      text: 'Service fee is $5000.',
      source: {
        turn_hash: 'sha256:abc123',
        start_char: 0,
        end_char: 21,
      },
    });
    expect(sentences[1]).toEqual({
      id: 's-2',
      text: 'Payment due in 30 days.',
      source: {
        turn_hash: 'sha256:abc123',
        start_char: 22,
        end_char: 45,
      },
    });
  });

  it('preserves segmentId as sentence id', () => {
    const segments: Segment[] = [
      { segmentId: 'custom-id-123', text: 'Test sentence.', startChar: 0, endChar: 14 },
    ];

    const sentences = buildSentencesFromSegments(segments, 'sha256:xyz');

    expect(sentences[0].id).toBe('custom-id-123');
  });

  it('handles empty segments array', () => {
    const sentences = buildSentencesFromSegments([], 'sha256:abc');

    expect(sentences).toEqual([]);
  });

  it('does not include confidence (by design)', () => {
    const segments: Segment[] = [{ segmentId: 's-1', text: 'Test.', startChar: 0, endChar: 5 }];

    const sentences = buildSentencesFromSegments(segments, 'sha256:abc');

    // Confidence should NOT be present in the output
    expect(sentences[0]).not.toHaveProperty('confidence');
  });
});

describe('findBestSourceSentenceId', () => {
  const sentences: Sentence[] = [
    {
      id: 's-1',
      text: 'The price is $5000 for the service.',
      source: { turn_hash: 'sha256:a', start_char: 0, end_char: 35 },
    },
    {
      id: 's-2',
      text: 'Discount: $500 off.',
      source: { turn_hash: 'sha256:a', start_char: 36, end_char: 55 },
    },
    {
      id: 's-3',
      text: 'Total: $5000.',
      source: { turn_hash: 'sha256:a', start_char: 56, end_char: 69 },
    },
  ];

  it('finds exact match with word boundary', () => {
    const id = findBestSourceSentenceId('$5000', sentences);
    // Should match s-1 or s-3 (both have $5000), picks shortest (s-3)
    expect(id).toBe('s-3');
  });

  it('does not match substring ($500 should not match $5000)', () => {
    const sentencesWithOnly5000: Sentence[] = [
      {
        id: 's-1',
        text: 'The price is $5000.',
        source: { turn_hash: 'sha256:a', start_char: 0, end_char: 19 },
      },
    ];

    const id = findBestSourceSentenceId('$500', sentencesWithOnly5000);
    expect(id).toBeUndefined();
  });

  it('matches $500 when actually present', () => {
    const id = findBestSourceSentenceId('$500', sentences);
    expect(id).toBe('s-2'); // "Discount: $500 off."
  });

  it('returns undefined when value not in any sentence', () => {
    const id = findBestSourceSentenceId('$9999', sentences);
    expect(id).toBeUndefined();
  });

  it('returns undefined for empty sentences array', () => {
    const id = findBestSourceSentenceId('test', []);
    expect(id).toBeUndefined();
  });

  it('returns undefined for empty value', () => {
    const id = findBestSourceSentenceId('', sentences);
    expect(id).toBeUndefined();
  });

  it('picks shortest sentence when multiple matches', () => {
    // s-1 has $5000 (35 chars), s-3 has $5000 (13 chars)
    // Should pick s-3 (shorter)
    const id = findBestSourceSentenceId('$5000', sentences);
    expect(id).toBe('s-3');
  });

  it('uses start_char as tiebreaker for same length sentences', () => {
    const sameLengthSentences: Sentence[] = [
      {
        id: 's-late',
        text: 'Price: $100.',
        source: { turn_hash: 'sha256:a', start_char: 100, end_char: 112 },
      },
      {
        id: 's-early',
        text: 'Cost: $100..',
        source: { turn_hash: 'sha256:a', start_char: 0, end_char: 12 },
      },
    ];

    const id = findBestSourceSentenceId('$100', sameLengthSentences);
    expect(id).toBe('s-early'); // Lower start_char wins
  });

  it('handles special regex characters in value', () => {
    const sentencesWithSpecialChars: Sentence[] = [
      {
        id: 's-1',
        text: 'Use regex pattern: foo.bar* here.',
        source: { turn_hash: 'sha256:a', start_char: 0, end_char: 33 },
      },
    ];

    const id = findBestSourceSentenceId('foo.bar*', sentencesWithSpecialChars);
    expect(id).toBe('s-1');
  });
});

describe('buildConstraints', () => {
  const sentences: Sentence[] = [
    {
      id: 's-1',
      text: 'Price is $5000.',
      source: { turn_hash: 'sha256:a', start_char: 0, end_char: 15 },
    },
    {
      id: 's-2',
      text: 'Payment in 30 days.',
      source: { turn_hash: 'sha256:a', start_char: 16, end_char: 35 },
    },
  ];

  it('builds REQUIRE constraints from mustHave', () => {
    const constraints = buildConstraints(['$5000'], [], sentences);

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toEqual({
      type: 'require',
      id: 'c1',
      value: '$5000',
      match: 'exact',
      source_sentence_id: 's-1',
      suggested: false,
    });
  });

  it('builds EXCLUDE constraints from mustntHave', () => {
    const constraints = buildConstraints([], ['CompetitorX'], sentences);

    expect(constraints).toHaveLength(1);
    expect(constraints[0]).toEqual({
      type: 'exclude',
      id: 'c1',
      value: 'CompetitorX',
      match: 'exact',
    });
  });

  it('builds mixed constraints with correct IDs', () => {
    const constraints = buildConstraints(
      ['$5000', '30 days'],
      ['CompetitorX', 'BadTerm'],
      sentences
    );

    expect(constraints).toHaveLength(4);
    expect(constraints[0].id).toBe('c1');
    expect(constraints[0].type).toBe('require');
    expect(constraints[1].id).toBe('c2');
    expect(constraints[1].type).toBe('require');
    expect(constraints[2].id).toBe('c3');
    expect(constraints[2].type).toBe('exclude');
    expect(constraints[3].id).toBe('c4');
    expect(constraints[3].type).toBe('exclude');
  });

  it('exclude constraints do not have source_sentence_id', () => {
    const constraints = buildConstraints([], ['BadTerm'], sentences);

    expect(constraints[0]).not.toHaveProperty('source_sentence_id');
  });

  it('require constraints have undefined source_sentence_id when not found', () => {
    const constraints = buildConstraints(['NotInText'], [], sentences);

    expect(constraints[0].type).toBe('require');
    expect((constraints[0] as { source_sentence_id?: string }).source_sentence_id).toBeUndefined();
  });

  it('handles empty arrays', () => {
    const constraints = buildConstraints([], [], sentences);

    expect(constraints).toEqual([]);
  });

  it('sets suggested: false for all require constraints', () => {
    const constraints = buildConstraints(['$5000', '30 days'], [], sentences);

    for (const c of constraints) {
      if (c.type === 'require') {
        expect(c.suggested).toBe(false);
      }
    }
  });
});

describe('getLocalAuthor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns author with local identity', () => {
    delete process.env.T3X_AUTHOR_NAME;

    const author = getLocalAuthor();

    expect(author.verification).toBe('none');
    expect(author.identity).toMatch(/^local:/);
    expect(author.name).toBeTruthy();
  });

  it('uses T3X_AUTHOR_NAME env var when set', () => {
    process.env.T3X_AUTHOR_NAME = 'CustomAuthor';

    const author = getLocalAuthor();

    expect(author.name).toBe('CustomAuthor');
    expect(author.identity).toBe('local:CustomAuthor');
  });
});

describe('getDockerAuthor', () => {
  it('returns author with device verification', () => {
    const containerId = 'abc123def456789';

    const author = getDockerAuthor(containerId);

    expect(author).toEqual({
      name: 'container-abc123de',
      identity: 'device:abc123def456789',
      verification: 'device',
    });
  });

  it('truncates container ID to 8 chars for name', () => {
    const author = getDockerAuthor('1234567890abcdef');

    expect(author.name).toBe('container-12345678');
  });
});

describe('getWebAuthor', () => {
  it('returns author with verified status', () => {
    const session = {
      name: 'Alice Smith',
      email: 'alice@example.com',
    };

    const author = getWebAuthor(session);

    expect(author).toEqual({
      name: 'Alice Smith',
      identity: 'email:alice@example.com',
      verification: 'verified',
    });
  });
});
