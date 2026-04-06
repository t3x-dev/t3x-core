import { describe, expect, it } from 'vitest';
import type { Lesson, LessonSource } from '../../feedback/types';

describe('Feedback types', () => {
  it('Lesson type accepts valid lesson', () => {
    const lesson: Lesson = {
      id: 'lsn_abc123def456',
      source: 'assertion',
      signal: 'Output must include exact text: "hello"',
      constraint_id: 'cst_xyz',
      leaf_id: 'leaf_abc',
      created_at: '2026-03-31T00:00:00.000Z',
    };
    expect(lesson.source).toBe('assertion');
    expect(lesson.signal).toBeTruthy();
  });

  it('Lesson type allows omitting optional constraint_id', () => {
    const lesson: Lesson = {
      id: 'lsn_abc123def456',
      source: 'edit',
      signal: 'Prefer casual tone',
      leaf_id: 'leaf_abc',
      created_at: '2026-03-31T00:00:00.000Z',
    };
    expect(lesson.constraint_id).toBeUndefined();
  });

  it('LessonSource is one of assertion, edit, manual', () => {
    const sources: LessonSource[] = ['assertion', 'edit', 'manual'];
    expect(sources).toHaveLength(3);
  });
});
