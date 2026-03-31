import { nanoid } from 'nanoid';
import type { Assertion } from '../types';
import type { Lesson } from './types';

interface LeafWithAssertions {
  id: string;
  assertions?: Assertion[];
}

interface CollectOptions {
  maxLessons?: number;
}

/**
 * Collect lessons from failed assertions across leaves.
 * Replaces the old collectLessons() from lesson-collector.ts.
 */
export function collectLessonsFromAssertions(
  leaves: LeafWithAssertions[],
  options?: CollectOptions,
): Lesson[] {
  const max = options?.maxLessons ?? 10;
  const seen = new Set<string>();
  const lessons: Lesson[] = [];

  for (const leaf of leaves) {
    for (const a of leaf.assertions ?? []) {
      if (!a.passed && a.lesson && !seen.has(a.lesson)) {
        seen.add(a.lesson);
        lessons.push({
          id: `lsn_${nanoid(12)}`,
          source: 'assertion',
          signal: a.lesson,
          constraint_id: a.constraint_id,
          leaf_id: leaf.id,
          confidence: 1.0,
          created_at: new Date().toISOString(),
        });
        if (lessons.length >= max) return lessons;
      }
    }
  }

  return lessons;
}
