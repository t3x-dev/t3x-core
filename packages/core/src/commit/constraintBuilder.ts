/**
 * Constraint Builder
 *
 * Builds CommitV3 constraints from mustHave/mustntHave arrays.
 */

import type {
  Constraint,
  ExcludeConstraint,
  RequireConstraint,
  Sentence,
} from '../types/commit-v3';

/**
 * Find the best matching source sentence ID for a value.
 *
 * Uses boundary matching to avoid substring issues (e.g., "$500" matching "$5000").
 * When multiple sentences match, uses deterministic selection (shortest sentence first,
 * then earliest by start_char).
 *
 * @param value - The value to find in sentences
 * @param sentences - Array of sentences to search
 * @returns The sentence ID if found, undefined otherwise
 */
export function findBestSourceSentenceId(value: string, sentences: Sentence[]): string | undefined {
  // Empty value cannot match anything meaningfully
  if (!value) {
    return undefined;
  }

  // Escape special regex characters in value
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Word boundary pattern: match value not surrounded by word characters
  // This prevents "$500" from matching inside "$5000"
  const pattern = new RegExp(`(?<!\\w)${escaped}(?!\\w)`);

  // Find all matching sentences
  const matches = sentences.filter((s) => pattern.test(s.text));

  if (matches.length === 0) {
    return undefined;
  }

  if (matches.length === 1) {
    return matches[0].id;
  }

  // Multiple matches: deterministic selection
  // 1. Prefer shortest sentence (more specific context)
  // 2. Tie-breaker: earliest by start_char
  matches.sort((a, b) => {
    const lenDiff = a.text.length - b.text.length;
    if (lenDiff !== 0) return lenDiff;
    return a.source.start_char - b.source.start_char;
  });

  return matches[0].id;
}

/**
 * Build CommitV3 constraints from mustHave and mustntHave arrays.
 *
 * - mustHave values become RequireConstraint (type: 'require')
 * - mustntHave values become ExcludeConstraint (type: 'exclude')
 *
 * RequireConstraints are linked to source sentences via findBestSourceSentenceId.
 * ExcludeConstraints do not have source_sentence_id (by design - they come from
 * compliance/policy/preferences, not necessarily from original text).
 *
 * @param mustHave - Values that must be present
 * @param mustntHave - Values that must not be present
 * @param sentences - Sentences to search for source linking
 * @returns Array of constraints
 */
export function buildConstraints(
  mustHave: string[],
  mustntHave: string[],
  sentences: Sentence[]
): Constraint[] {
  const constraints: Constraint[] = [];
  // NOTE: id is local-only; if hashed, switch to stable id (e.g., c-${hash(type+value)})
  let id = 1;

  // Build REQUIRE constraints from mustHave
  for (const value of mustHave) {
    const sourceSentenceId = findBestSourceSentenceId(value, sentences);

    constraints.push({
      type: 'require',
      id: `c${id++}`,
      value,
      match: 'exact',
      source_sentence_id: sourceSentenceId,
      suggested: false, // User-confirmed from legacy
    } satisfies RequireConstraint);
  }

  // Build EXCLUDE constraints from mustntHave
  for (const value of mustntHave) {
    constraints.push({
      type: 'exclude',
      id: `c${id++}`,
      value,
      match: 'exact',
    } satisfies ExcludeConstraint);
  }

  return constraints;
}
