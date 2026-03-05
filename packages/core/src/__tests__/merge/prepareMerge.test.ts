/**
 * Tests for Two-Way Merge (Issue #71, V4 Migration)
 *
 * Tests for prepareMerge and executeMerge functions.
 *
 * V4 Changes:
 * - prepareMerge accepts DiffableSentence[] instead of CommitContent
 * - executeMerge returns CommitV4 instead of CommitV3
 * - No constraint handling (constraints belong to Leaf)
 */

import { describe, expect, test, vi } from 'vitest';
import { sha256 } from '../../common/hash';
import type { DiffableSentence } from '../../diff/types';
import { executeMerge, prepareMerge } from '../../merge';
import type { CommitAuthor } from '../../types/v4';

// Test helpers - V4 uses DiffableSentence (only id + text)
const createSentence = (id: string, text: string): DiffableSentence => ({
  id,
  text,
});

// V4 author format
const author: CommitAuthor = {
  type: 'human',
  name: 'Test User',
};

const projectId = 'proj_test123';

// ============================================================================
// prepareMerge Tests
// ============================================================================

describe('prepareMerge', () => {
  test('identifies similar sentences', () => {
    const source: DiffableSentence[] = [createSentence('s1', 'Budget is $3000')];
    const target: DiffableSentence[] = [createSentence('t1', 'Budget is $3500')];

    const result = prepareMerge(source, target);

    expect(result.similarPairs).toHaveLength(1);
    expect(result.similarPairs[0].source.text).toBe('Budget is $3000');
    expect(result.similarPairs[0].target.text).toBe('Budget is $3500');
    expect(result.similarPairs[0].resolution).toBeUndefined();
  });

  test('defaults unique sentences to keep: true', () => {
    const source: DiffableSentence[] = [
      createSentence('s1', 'The quick brown fox jumps over the lazy dog'),
    ];
    const target: DiffableSentence[] = [
      createSentence('t1', 'Lorem ipsum dolor sit amet consectetur'),
    ];

    const result = prepareMerge(source, target);

    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInSource[0].keep).toBe(true);
    expect(result.onlyInTarget).toHaveLength(1);
    expect(result.onlyInTarget[0].keep).toBe(true);
  });

  test('identifies identical sentences', () => {
    const source: DiffableSentence[] = [createSentence('s1', 'Same text in both')];
    const target: DiffableSentence[] = [createSentence('t1', 'Same text in both')];

    const result = prepareMerge(source, target);

    expect(result.identical).toHaveLength(1);
    expect(result.identical[0].text).toBe('Same text in both');
    expect(result.similarPairs).toHaveLength(0);
    expect(result.onlyInSource).toHaveLength(0);
    expect(result.onlyInTarget).toHaveLength(0);
  });

  test('handles empty inputs', () => {
    const result = prepareMerge([], []);

    expect(result.identical).toHaveLength(0);
    expect(result.similarPairs).toHaveLength(0);
    expect(result.onlyInSource).toHaveLength(0);
    expect(result.onlyInTarget).toHaveLength(0);
  });

  test('handles multiple sentences', () => {
    const source: DiffableSentence[] = [
      createSentence('s1', 'Sentence one'),
      createSentence('s2', 'Sentence two'),
      createSentence('s3', 'Alpha beta gamma delta epsilon zeta eta theta'),
    ];
    const target: DiffableSentence[] = [
      createSentence('t1', 'Sentence one'),
      createSentence('t2', 'Sentence two modified'),
      createSentence('t3', 'Completely unrelated words for testing purposes here'),
    ];

    const result = prepareMerge(source, target);

    expect(result.identical).toHaveLength(1);
    expect(result.identical[0].text).toBe('Sentence one');
    expect(result.similarPairs).toHaveLength(1);
    expect(result.similarPairs[0].source.text).toBe('Sentence two');
    expect(result.onlyInSource).toHaveLength(1);
    expect(result.onlyInTarget).toHaveLength(1);
  });

  // V4 type contract tests
  test('DiffableSentence only requires id and text (minimal interface)', () => {
    // V4 契约：DiffableSentence 只需要 id 和 text
    const minimal: DiffableSentence = { id: 's1', text: 'Test' };
    const result = prepareMerge([minimal], []);

    expect(result.onlyInSource).toHaveLength(1);
    // position is auto-assigned by diffCommits for merge order preservation
    expect(result.onlyInSource[0].sentence).toMatchObject(minimal);
    expect(result.onlyInSource[0].sentence.id).toBe('s1');
    expect(result.onlyInSource[0].sentence.text).toBe('Test');
  });

  test('MergeCandidate has no constraints field (V4)', () => {
    // V4 契约：MergeCandidate 不含 constraints 字段
    const source: DiffableSentence[] = [createSentence('s1', 'Unique source sentence here')];
    const target: DiffableSentence[] = [];

    const result = prepareMerge(source, target);

    expect(result.onlyInSource).toHaveLength(1);
    const candidate = result.onlyInSource[0];
    expect(candidate).toHaveProperty('sentence');
    expect(candidate).toHaveProperty('keep');
    expect(candidate).not.toHaveProperty('constraints');
  });

  test('MergeSimilarPair has no constraint fields (V4)', () => {
    // V4 契约：MergeSimilarPair 不含 sourceConstraints/targetConstraints 字段
    const source: DiffableSentence[] = [createSentence('s1', 'Budget is $3000')];
    const target: DiffableSentence[] = [createSentence('t1', 'Budget is $5000')];

    const result = prepareMerge(source, target);

    expect(result.similarPairs).toHaveLength(1);
    const pair = result.similarPairs[0];
    expect(pair).toHaveProperty('source');
    expect(pair).toHaveProperty('target');
    expect(pair).toHaveProperty('wordDiff');
    expect(pair).not.toHaveProperty('sourceConstraints');
    expect(pair).not.toHaveProperty('targetConstraints');
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

    const result = executeMerge(prepared, 'sha256:aaa', 'sha256:bbb', author, 'Merge', projectId);

    expect(result.parents).toEqual(['sha256:aaa', 'sha256:bbb']);
    expect(result.schema).toBe('t3x/commit/v4');
    expect(result.hash).toMatch(/^sha256:/);
    expect(result.project_id).toBe(projectId);
  });

  test('throws on unresolved similar pair', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Source text'),
          target: createSentence('t1', 'Target text'),
          wordDiff: [],
          resolution: undefined,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    expect(() => executeMerge(prepared, 'a', 'b', author, 'Merge', projectId)).toThrow(
      'Unresolved similar pair'
    );
  });

  test('includes source sentence when resolution is source', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Budget is $3000'),
          target: createSentence('t1', 'Budget is $3500'),
          wordDiff: [],
          resolution: 'source' as const,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences[0].text).toBe('Budget is $3000');
  });

  test('includes target sentence when resolution is target', () => {
    const prepared = {
      identical: [],
      similarPairs: [
        {
          source: createSentence('s1', 'Budget is $3000'),
          target: createSentence('t1', 'Budget is $3500'),
          wordDiff: [],
          resolution: 'target' as const,
        },
      ],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences[0].text).toBe('Budget is $3500');
  });

  test('excludes sentences with keep: false', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        {
          sentence: createSentence('s1', 'Discard me'),
          keep: false,
        },
      ],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences).toHaveLength(0);
  });

  test('includes sentences with keep: true', () => {
    const prepared = {
      identical: [],
      similarPairs: [],
      onlyInSource: [
        {
          sentence: createSentence('s1', 'Keep me'),
          keep: true,
        },
      ],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    expect(result.content.sentences).toHaveLength(1);
    expect(result.content.sentences[0].text).toBe('Keep me');
  });

  test('regenerates sentence IDs with deterministic V4 format', () => {
    const prepared = {
      identical: [createSentence('old-id-1', 'Keep me')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    // Verify V4 format: s_ prefix + 12 hex chars
    expect(result.content.sentences[0].id).toMatch(/^s_[a-f0-9]{12}$/);

    // Verify deterministic: same inputs → same ID
    const expectedId = `s_${sha256('a:b:old-id-1').slice(0, 12)}`;
    expect(result.content.sentences[0].id).toBe(expectedId);
  });

  test('merge commit hash is deterministic (same inputs → same hash)', () => {
    const prepared = {
      identical: [createSentence('s1', 'Same content')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    // Mock Date to ensure same timestamp
    const fixedTimestamp = new Date('2024-01-01T00:00:00.000Z').getTime();
    vi.setSystemTime(fixedTimestamp);

    try {
      const result1 = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);
      const result2 = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

      expect(result1.hash).toBe(result2.hash);
    } finally {
      vi.useRealTimers();
    }
  });

  test('includes identical sentences in merged content', () => {
    const prepared = {
      identical: [createSentence('s1', 'Identical 1'), createSentence('s2', 'Identical 2')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

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

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge feature into main', projectId);

    expect(result.message).toBe('Merge feature into main');
    expect(result.author).toEqual(author);
  });

  test('V4 commit has no constraints in content', () => {
    const prepared = {
      identical: [createSentence('s1', 'Test sentence')],
      similarPairs: [],
      onlyInSource: [],
      onlyInTarget: [],
    };

    const result = executeMerge(prepared, 'a', 'b', author, 'Merge', projectId);

    // V4 CommitV4Content has only sentences, no constraints
    expect(result.content).toHaveProperty('sentences');
    expect(result.content).not.toHaveProperty('constraints');
  });
});
