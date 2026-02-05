/**
 * Generate a unique project name with timestamp
 */
export function generateProjectName(prefix = 'E2E Test'): string {
  return `${prefix} ${Date.now()}`;
}

/** Short random suffix for ID uniqueness across parallel tests */
function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Generate test sentences with unique IDs (safe for parallel execution)
 */
export function generateSentences(count: number): Array<{ id: string; text: string }> {
  const prefix = uid();
  const templates = [
    'User prefers dark mode',
    'User speaks English',
    'User timezone is UTC+8',
    'User is interested in AI',
    'User works in technology',
    'User prefers concise responses',
    'User values accuracy',
    'User likes detailed explanations',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `s_${prefix}_${i + 1}`,
    text: templates[i % templates.length],
  }));
}

/**
 * Generate test constraints
 */
export function generateConstraints(
  type: 'require' | 'exclude' = 'require',
  count = 2
): Array<{ type: string; value: string; match_mode: string }> {
  const values = ['dark mode', 'English', 'concise', 'accurate'];
  return Array.from({ length: count }, (_, i) => ({
    type,
    value: values[i % values.length],
    match_mode: i % 2 === 0 ? 'semantic' : 'exact',
  }));
}

/**
 * Generate merge conflict data (sentences that differ between source and target)
 */
export function generateMergeConflictData(): {
  sourceSentences: Array<{ id: string; text: string }>;
  targetSentences: Array<{ id: string; text: string }>;
} {
  const prefix = uid();
  return {
    sourceSentences: [
      { id: `s_${prefix}_1`, text: 'User prefers dark mode' },
      { id: `s_${prefix}_2`, text: 'User speaks English fluently' },
      { id: `s_${prefix}_3`, text: 'User timezone is UTC+8' },
      { id: `s_${prefix}_4`, text: 'User is a developer' },
    ],
    targetSentences: [
      { id: `s_${prefix}_1`, text: 'User prefers dark mode' },
      { id: `s_${prefix}_2`, text: 'User speaks British English' },
      { id: `s_${prefix}_3`, text: 'User timezone is UTC+8' },
      { id: `s_${prefix}_5`, text: 'User likes coffee' },
    ],
  };
}

/**
 * Known console errors to ignore during E2E tests.
 * Shared across all test files for consistency (#11).
 *
 * IMPORTANT: Patterns must be specific. Never match broad terms like "React"
 * or "Warning" — those would suppress real errors.
 */
export function isExpectedConsoleError(message: string): boolean {
  const expectedPatterns = [
    // Next.js hydration mismatch warnings (non-critical in dev mode)
    'Warning: Text content did not match',
    'Warning: Expected server HTML to contain',
    'Hydration failed because',
    'There was an error while hydrating',
    // React StrictMode double-render warnings
    "Warning: Can't perform a React state update on an unmounted component",
    'Warning: Cannot update a component',
    // Static asset 404s (not API errors)
    '/favicon.ico',
    '/manifest.json',
  ];
  return expectedPatterns.some((pattern) => message.includes(pattern));
}
