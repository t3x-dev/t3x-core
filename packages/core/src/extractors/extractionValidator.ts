/**
 * Extraction Validator
 *
 * Validates and deduplicates extracted sentences.
 * Removes invalid entries (out-of-bounds turn_index, too short, duplicates, low confidence).
 */

import type { TurnInput } from './extractionPrompt';
import type { ExtractedSentence } from './llmExtractor';

export interface ValidationResult {
  valid: ExtractedSentence[];
  removed: Array<{ sentence: ExtractedSentence; reason: string }>;
}

/**
 * Validate extracted sentences against the source turns.
 *
 * Rules:
 * 1. turn_index out of bounds → remove
 * 2. text empty or < 5 chars → remove
 * 3. duplicate text (keep first occurrence) → remove later ones
 * 4. confidence < 0.3 → remove
 */
export function validateExtractedSentences(
  sentences: ExtractedSentence[],
  turns: TurnInput[]
): ValidationResult {
  const valid: ExtractedSentence[] = [];
  const removed: Array<{ sentence: ExtractedSentence; reason: string }> = [];
  const seenTexts = new Set<string>();

  for (const s of sentences) {
    // Rule 1: turn_index bounds
    if (s.turn_index < 0 || s.turn_index >= turns.length) {
      removed.push({
        sentence: s,
        reason: `turn_index ${s.turn_index} out of bounds (0-${turns.length - 1})`,
      });
      continue;
    }

    // Rule 2: text too short
    if (!s.text || s.text.trim().length < 5) {
      removed.push({ sentence: s, reason: 'text too short (< 5 chars)' });
      continue;
    }

    // Rule 3: duplicate text
    const normalized = s.text.trim().toLowerCase();
    if (seenTexts.has(normalized)) {
      removed.push({ sentence: s, reason: 'duplicate text' });
      continue;
    }

    // Rule 4: low confidence
    if (s.confidence < 0.3) {
      removed.push({ sentence: s, reason: `confidence too low (${s.confidence})` });
      continue;
    }

    seenTexts.add(normalized);
    valid.push(s);
  }

  return { valid, removed };
}
