/**
 * Tests for Two-Way Merge (Issue #71)
 *
 * Tests for prepareMerge and executeMerge functions.
 */

import { describe, expect, test } from 'vitest';
import type {
  CommitAuthor,
  CommitContent,
  Constraint,
  Sentence,
} from '../../types/commit';
import {
  executeMerge,
  groupConstraintsBySentence,
  prepareMerge,
} from '../../merge';

// Test helpers
const createSentence = (id: string, text: string): Sentence => ({
  id,
  text,
  confidence: 1,
  source: { type: 'turn', id: `turn_${id}` },
});

const createConstraint = (
  id: string,
  sourceSentenceId: string,
  value: string
): Constraint => ({
  id,
  source_sentence_id: sourceSentenceId,
  type: 'require',
  value,
  confidence: 1,
});

const author: CommitAuthor = {
  name: 'Test User',
  identity: 'test@example.com',
  verification: 'verified',
};

// ============================================================================
// groupConstraintsBySentence Tests
// ============================================================================

describe('groupConstraintsBySentence', () => {
  test('groups constraints by sentence ID', () => {
    const constraints: Constraint[] = [
      createConstraint('c1', 's1', '$3000'),
      createConstraint('c2', 's1', '30 days'),
      createConstraint('c3', 's2', 'CompetitorX'),
    ];
    const sentences: Sentence[] = [
      createSentence('s1', 'Budget is $3000'),
      createSentence('s2', 'Exclude CompetitorX'),
    ];

    const result = groupConstraintsBySentence(constraints, sentences);

    expect(result.get('s1')).toHaveLength(2);
    expect(result.get('s2')).toHaveLength(1);
    expect(result.get('s1')![0].value).toBe('$3000');
    expect(result.get('s1')![1].value).toBe('30 days');
    expect(result.get('s2')![0].value).toBe('CompetitorX');
  });

  test('returns empty array for sentences without constraints', () => {
    const constraints: Constraint[] = [];
    const sentences: Sentence[] = [createSentence('s1', 'No constraints here')];

    const result = groupConstraintsBySentence(constraints, sentences);

    expect(result.get('s1')).toEqual([]);
  });

  test('ignores constraints with unknown sentence IDs', () => {
    const constraints: Constraint[] = [
      createConstraint('c1', 'unknown', '$3000'),
    ];
    const sentences: Sentence[] = [createSentence('s1', 'Known sentence')];

    const result = groupConstraintsBySentence(constraints, sentences);

    expect(result.get('s1')).toEqual([]);
    expect(result.has('unknown')).toBe(false);
  });
});

// ============================================================================
// prepareMerge Tests
// ============================================================================

describe('prepareMerge', () => {
  test('attaches constraints to similar pairs', () => {
    const source: CommitContent = {
      sentences: [createSentence('s1', 'Budget is $3000')],
      constraints: [createConstraint('c1', 's1', '$3000')],
    };
    const target: CommitContent = {
      sentences: [createSentence('t1', 'Budget is $3500')],
      constraints: [createConstraint('c2', 't1', '$3500')],
    };

    const result = prepareMerge(source, target);

    expect(result.similarPairs).toHaveLength(1);
    expect(result.similarPairs[0].sourceConstraints).toHaveLength(1);
    expect(result.similarPairs[0].targetConstraints).toHaveLength(1);
    expect(result.similarPairs[0].sourceConstraints[0].value).toBe('$3000');
    expect(result.similarPairs[0].targetConstraints[0].value).toBe('$3500');
    expect(result.similarPairs[0].resolution).toBeUndefined();
  });

  test('defaults unique sentences to keep: true', () => {
    const source: CommitContent = {
      sentences: [createSentence('s1', 'The quick brown fox jumps over the lazy dog')],
      constraints: [],
    };
    const target: CommitContent = {
      sentences: [createSentence('t1', 'Lorem ipsum dolor sit amet consectetur')],
      constraints: [],
    };

    const result = prepareMerge(source, target);

    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInSource[0].keep).toBe(true);
    expect(result.onlyInTarget).toHaveLength(1);
    expect(result.onlyInTarget[0].keep).toBe(true);
  });

  test('identifies identical sentences', () => {
    const source: CommitContent = {
      sentences: [createSentence('s1', 'Same text in both')],
      constraints: [],
    };
    const target: CommitContent = {
      sentences: [createSentence('t1', 'Same text in both')],
      constraints: [],
    };

    const result = prepareMerge(source, target);

    expect(result.identical).toHaveLength(1);
    expect(result.identical[0].text).toBe('Same text in both');
    expect(result.similarPairs).toHaveLength(0);
    expect(result.onlyInSource).toHaveLength(0);
    expect(result.onlyInTarget).toHaveLength(0);
  });

  test('attaches constraints to unique sentences', () => {
    const source: CommitContent = {
      sentences: [createSentence('s1', 'The quick brown fox jumps over the lazy dog')],
      constraints: [createConstraint('c1', 's1', 'source-value')],
    };
    const target: CommitContent = {
      sentences: [createSentence('t1', 'Lorem ipsum dolor sit amet consectetur')],
      constraints: [createConstraint('c2', 't1', 'target-value')],
    };

    const result = prepareMerge(source, target);

    expect(result.onlyInSource[0].constraints).toHaveLength(1);
    expect(result.onlyInSource[0].constraints[0].value).toBe('source-value');
    expect(result.onlyInTarget[0].constraints).toHaveLength(1);
    expect(result.onlyInTarget[0].constraints[0].value).toBe('target-value');
  });
});

// ============================================================================
// executeMerge Tests
// ============================================================================

describe('executeMerge', () => {
  test('creates commit with 2 parents', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(
      prepared,
      'sha256:aaa',
      'sha256:bbb',
      author,
      'Merge'
    );

    expect(result.parents).toEqual(['sha256:aaa', 'sha256:bbb']);
    expect(result.schema).toBe('commit/v3');
    expect(result.hash).toMatch(/^sha256:/);
  });

  test('throws on unresolved similar pair', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Source text'),
          target: createSentence('t1', 'Target text'),
          wordDiff: [],
          sourceConstraints: [],
          targetConstraints: [],
          resolution: undefined,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    expect(() =>
      executeMerge(prepared, 'a', 'b', author, 'Merge')
    ).toThrow('Unresolved similar pair');
  });

  test('includes source sentence when resolution is source', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Budget is $3000'),
          target: createSentence('t1', 'Budget is $3500'),
          wordDiff: [],
          sourceConstraints: [createConstraint('c1', 's1', '$3000')],
          targetConstraints: [createConstraint('c2', 't1', '$3500')],
          resolution: 'source' as const,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge');

    expect(result.content.sentences[0].text).toBe('Budget is $3000');
    expect(result.content.constraints![0].value).toBe('$3000');
  });

  test('includes target sentence when resolution is target', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Budget is $3000'),
          target: createSentence('t1', 'Budget is $3500'),
          wordDiff: [],
          sourceConstraints: [createConstraint('c1', 's1', '$3000')],
          targetConstraints: [createConstraint('c2', 't1', '$3500')],
          resolution: 'target' as const,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge');

    expect(result.content.sentences[0].text).toBe('Budget is $3500');
    expect(result.content.constraints![0].value).toBe('$3500');
  });

  test('excludes sentences with keep: false', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        {
          sentence: createSentence('s1', 'Discard me'),
          constraints: [],
          keep: false,
        },
      ],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge');

    expect(result.content.sentences).toHaveLength(0);
  });

  test('includes sentences with keep: true', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        {
          sentence: createSentence('s1', 'Keep me'),
          constraints: [createConstraint('c1', 's1', 'value')],
          keep: true,
        },
      ],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge');

    expect(result.content.sentences).toHaveLength(1);
    expect(result.content.sentences[0].text).toBe('Keep me');
    expect(result.content.constraints).toHaveLength(1);
  });

  test('regenerates sentence and constraint IDs', () => {
    const prepared = {
      identical: [createSentence('old-id-1', 'Keep me')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge');

    expect(result.content.sentences[0].id).toBe('m1');
  });

  test('updates constraint source_sentence_id to new sentence ID', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        {
          sentence: createSentence('old-s1', 'Sentence'),
          constraints: [createConstraint('old-c1', 'old-s1', 'value')],
          keep: true,
        },
      ],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge');

    expect(result.content.sentences[0].id).toBe('m1');
    expect(result.content.constraints![0].id).toBe('mc1');
    expect(result.content.constraints![0].source_sentence_id).toBe('m1');
  });

  test('merge commit hash is deterministic (same inputs → same hash)', () => {
    const prepared = {
      identical: [createSentence('s1', 'Same content')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    // Mock Date to ensure same timestamp
    const fixedDate = new Date('2024-01-01T00:00:00.000Z');
    const originalDate = global.Date;
    global.Date = class extends originalDate {
      constructor() {
        super();
        return fixedDate;
      }
      static now() {
        return fixedDate.getTime();
      }
    } as DateConstructor;

    try {
      const result1 = executeMerge(prepared, 'a', 'b', author, 'Merge');
      const result2 = executeMerge(prepared, 'a', 'b', author, 'Merge');

      expect(result1.hash).toBe(result2.hash);
    } finally {
      global.Date = originalDate;
    }
  });

  test('includes identical sentences in merged content', () => {
    const prepared = {
      identical: [
        createSentence('s1', 'Identical 1'),
        createSentence('s2', 'Identical 2'),
      ],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge');

    expect(result.content.sentences).toHaveLength(2);
    expect(result.content.sentences[0].text).toBe('Identical 1');
    expect(result.content.sentences[1].text).toBe('Identical 2');
  });

  test('sets message and author correctly', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(
      prepared,
      'a',
      'b',
      author,
      'Merge feature into main'
    );

    expect(result.message).toBe('Merge feature into main');
    expect(result.author).toEqual(author);
  });
});
