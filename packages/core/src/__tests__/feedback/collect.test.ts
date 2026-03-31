import { describe, expect, it } from 'vitest';
import { collectLessonsFromAssertions } from '../../feedback/collect';
import type { Assertion } from '../../types';

describe('collectLessonsFromAssertions', () => {
  it('extracts lessons from failed assertions with lesson field', () => {
    const leaves = [
      {
        id: 'leaf_1',
        assertions: [
          {
            id: 'ast_1',
            constraint_id: 'cst_1',
            passed: false,
            details: 'failed',
            lesson: 'Always include greeting',
          },
          { id: 'ast_2', constraint_id: 'cst_2', passed: true, details: 'ok' },
        ] as Assertion[],
      },
      {
        id: 'leaf_2',
        assertions: [
          {
            id: 'ast_3',
            constraint_id: 'cst_3',
            passed: false,
            details: 'failed',
            lesson: 'Keep under 280 chars',
          },
        ] as Assertion[],
      },
    ];
    const lessons = collectLessonsFromAssertions(leaves);
    expect(lessons).toHaveLength(2);
    expect(lessons[0].signal).toBe('Always include greeting');
    expect(lessons[0].source).toBe('assertion');
    expect(lessons[0].leaf_id).toBe('leaf_1');
    expect(lessons[1].signal).toBe('Keep under 280 chars');
    expect(lessons[1].leaf_id).toBe('leaf_2');
  });

  it('returns empty array when no failed assertions', () => {
    const leaves = [
      {
        id: 'leaf_1',
        assertions: [
          { id: 'ast_1', constraint_id: 'cst_1', passed: true, details: 'ok' },
        ] as Assertion[],
      },
    ];
    expect(collectLessonsFromAssertions(leaves)).toEqual([]);
  });

  it('skips assertions without lesson field', () => {
    const leaves = [
      {
        id: 'leaf_1',
        assertions: [
          { id: 'ast_1', constraint_id: 'cst_1', passed: false, details: 'failed' },
        ] as Assertion[],
      },
    ];
    expect(collectLessonsFromAssertions(leaves)).toEqual([]);
  });

  it('deduplicates lessons by signal text', () => {
    const leaves = [
      {
        id: 'leaf_1',
        assertions: [
          {
            id: 'ast_1',
            constraint_id: 'c1',
            passed: false,
            details: '',
            lesson: 'Same lesson',
          },
        ] as Assertion[],
      },
      {
        id: 'leaf_2',
        assertions: [
          {
            id: 'ast_2',
            constraint_id: 'c2',
            passed: false,
            details: '',
            lesson: 'Same lesson',
          },
        ] as Assertion[],
      },
    ];
    expect(collectLessonsFromAssertions(leaves)).toHaveLength(1);
  });

  it('limits to maxLessons', () => {
    const leaves = Array.from({ length: 20 }, (_, i) => ({
      id: `leaf_${i}`,
      assertions: [
        {
          id: `ast_${i}`,
          constraint_id: `cst_${i}`,
          passed: false,
          details: '',
          lesson: `Lesson ${i}`,
        },
      ] as Assertion[],
    }));
    expect(collectLessonsFromAssertions(leaves, { maxLessons: 5 })).toHaveLength(5);
  });

  it('defaults maxLessons to 10', () => {
    const leaves = Array.from({ length: 15 }, (_, i) => ({
      id: `leaf_${i}`,
      assertions: [
        {
          id: `ast_${i}`,
          constraint_id: `cst_${i}`,
          passed: false,
          details: '',
          lesson: `Lesson ${i}`,
        },
      ] as Assertion[],
    }));
    expect(collectLessonsFromAssertions(leaves)).toHaveLength(10);
  });

  it('handles leaves with no assertions', () => {
    const leaves = [{ id: 'leaf_1', assertions: undefined }, { id: 'leaf_2', assertions: [] }];
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    expect(collectLessonsFromAssertions(leaves as any)).toEqual([]);
  });
});
