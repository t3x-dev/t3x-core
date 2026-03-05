interface AssertionLike {
  passed: boolean;
  lesson?: string;
}

interface LeafLike {
  assertions?: AssertionLike[];
}

interface CollectOptions {
  maxLessons?: number;
}

export function collectLessons(leaves: LeafLike[], options?: CollectOptions): string[] {
  const max = options?.maxLessons ?? 10;
  const seen = new Set<string>();
  const lessons: string[] = [];

  for (const leaf of leaves) {
    for (const a of leaf.assertions ?? []) {
      if (!a.passed && a.lesson && !seen.has(a.lesson)) {
        seen.add(a.lesson);
        lessons.push(a.lesson);
        if (lessons.length >= max) return lessons;
      }
    }
  }

  return lessons;
}
