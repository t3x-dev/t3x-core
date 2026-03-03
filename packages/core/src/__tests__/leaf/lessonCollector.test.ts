import { describe, expect, it } from 'vitest';
import { collectLessons } from '../../leaf/lesson-collector';

describe('collectLessons', () => {
  it('extracts lesson strings from failed assertions', () => {
    const leaves = [
      {
        assertions: [
          { id: 'ast_1', constraint_id: 'cst_1', passed: false, details: 'failed', lesson: 'Always include greeting' },
          { id: 'ast_2', constraint_id: 'cst_2', passed: true, details: 'ok' },
        ],
      },
      {
        assertions: [
          { id: 'ast_3', constraint_id: 'cst_3', passed: false, details: 'failed', lesson: 'Keep under 280 chars' },
        ],
      },
    ];
    const lessons = collectLessons(leaves);
    expect(lessons).toEqual(['Always include greeting', 'Keep under 280 chars']);
  });

  it('returns empty array when no failed assertions', () => {
    const leaves = [
      {
        assertions: [
          { id: 'ast_1', constraint_id: 'cst_1', passed: true, details: 'ok' },
        ],
      },
    ];
    expect(collectLessons(leaves)).toEqual([]);
  });

  it('skips assertions without lesson field', () => {
    const leaves = [
      {
        assertions: [
          { id: 'ast_1', constraint_id: 'cst_1', passed: false, details: 'failed' },
        ],
      },
    ];
    expect(collectLessons(leaves)).toEqual([]);
  });

  it('deduplicates lessons', () => {
    const leaves = [
      { assertions: [{ id: 'ast_1', constraint_id: 'c1', passed: false, details: '', lesson: 'Same lesson' }] },
      { assertions: [{ id: 'ast_2', constraint_id: 'c2', passed: false, details: '', lesson: 'Same lesson' }] },
    ];
    expect(collectLessons(leaves)).toEqual(['Same lesson']);
  });

  it('limits to maxLessons', () => {
    const leaves = Array.from({ length: 20 }, (_, i) => ({
      assertions: [{ id: `ast_${i}`, constraint_id: `cst_${i}`, passed: false, details: '', lesson: `Lesson ${i}` }],
    }));
    expect(collectLessons(leaves, { maxLessons: 10 })).toHaveLength(10);
  });

  it('defaults maxLessons to 10', () => {
    const leaves = Array.from({ length: 15 }, (_, i) => ({
      assertions: [{ id: `ast_${i}`, constraint_id: `cst_${i}`, passed: false, details: '', lesson: `Lesson ${i}` }],
    }));
    expect(collectLessons(leaves)).toHaveLength(10);
  });

  it('handles leaves with no assertions', () => {
    const leaves = [
      { assertions: undefined as any },
      { assertions: [] },
    ];
    expect(collectLessons(leaves)).toEqual([]);
  });
});
