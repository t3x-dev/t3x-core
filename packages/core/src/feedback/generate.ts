import type { Constraint } from '../types';

/**
 * Generate a human-readable lesson string from a failed constraint.
 * Pure function — no LLM, deterministic output.
 */
export function generateLesson(constraint: Constraint, _failureDetails: string): string {
  if (constraint.type === 'require') {
    const mode =
      constraint.match_mode === 'exact' ? 'include exact text' : 'convey the meaning of';
    return `Output must ${mode}: "${constraint.value}"`;
  }

  const modeNeg = constraint.match_mode === 'exact' ? 'contain' : 'convey the meaning of';
  const reason = constraint.reason ? ` (reason: ${constraint.reason})` : '';
  return `Output must NOT ${modeNeg}: "${constraint.value}"${reason}`;
}
