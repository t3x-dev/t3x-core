/**
 * Draft Validation — Local constraint checking (zero LLM cost)
 *
 * Validates exact-match constraints against included sentences.
 * Semantic constraints are deferred to preview generation.
 */

import type { DraftConstraint, DraftSentence } from '@/lib/api';

export interface ValidationResult {
  constraint_id: string;
  passed: boolean;
  details: string;
}

/** Per-sentence constraint match/violation result */
export interface SentenceConstraintResult {
  constraint_id: string;
  type: 'match' | 'violation';
  constraint: DraftConstraint;
}

/**
 * Check which exact-match constraints apply to a specific sentence.
 * Returns matches (require found) and violations (exclude found).
 * Skips semantic constraints (require LLM).
 */
export function getConstraintResultsForSentence(
  sentence: DraftSentence,
  constraints: DraftConstraint[]
): SentenceConstraintResult[] {
  if (!sentence.included || constraints.length === 0) return [];

  const results: SentenceConstraintResult[] = [];
  const lowerText = sentence.text.toLowerCase();

  for (const c of constraints) {
    if (c.match_mode === 'semantic') continue;

    const lowerValue = c.value.toLowerCase();
    const found = lowerText.includes(lowerValue);

    if (c.type === 'require' && found) {
      results.push({ constraint_id: c.id, type: 'match', constraint: c });
    } else if (c.type === 'exclude' && found) {
      results.push({ constraint_id: c.id, type: 'violation', constraint: c });
    }
  }

  return results;
}

/**
 * Validate constraints locally against included sentences.
 *
 * - `require` + `exact`: included text must contain the value
 * - `exclude` + `exact`: included text must NOT contain the value
 * - `semantic` mode: always passes (requires preview for real validation)
 */
export function validateConstraintsLocally(
  sentences: DraftSentence[],
  constraints: DraftConstraint[]
): ValidationResult[] {
  if (constraints.length === 0) return [];

  const includedText = sentences
    .filter((s) => s.included)
    .map((s) => s.text)
    .join(' ');

  const lowerText = includedText.toLowerCase();

  return constraints.map((c) => {
    if (c.match_mode === 'semantic') {
      return {
        constraint_id: c.id,
        passed: true,
        details: 'Semantic validation requires preview',
      };
    }

    const lowerValue = c.value.toLowerCase();

    if (c.type === 'require') {
      const found = lowerText.includes(lowerValue);
      return {
        constraint_id: c.id,
        passed: found,
        details: found ? 'Found in included sentences' : 'Not found in included sentences',
      };
    }

    // exclude
    const found = lowerText.includes(lowerValue);
    return {
      constraint_id: c.id,
      passed: !found,
      details: found ? 'Found in included sentences (should be excluded)' : 'Not found (good)',
    };
  });
}
