/**
 * Draft Validator
 *
 * Validates generated drafts against Must-Have / Mustn't-Have constraints.
 */

import { ValidationResult } from "./types";

/**
 * Must-Have / Mustn't-Have Validator
 */
export class MustHaveValidator {
  /**
   * Validate draft text against constraints
   *
   * @param text - Draft text to validate
   * @param mustHave - Keywords that must be present
   * @param mustntHave - Keywords that must not be present
   * @returns Validation result
   */
  validate(
    text: string,
    mustHave: string[],
    mustntHave: string[]
  ): ValidationResult {
    const normalizedText = text.toLowerCase();

    // Check missing must-have
    const missingMustHave = mustHave.filter(
      (keyword) => !normalizedText.includes(keyword.toLowerCase())
    );

    // Check violated mustn't-have
    const violatedMustntHave = mustntHave.filter(
      (keyword) => normalizedText.includes(keyword.toLowerCase())
    );

    return {
      passed: missingMustHave.length === 0 && violatedMustntHave.length === 0,
      missingMustHave,
      violatedMustntHave,
    };
  }
}

/**
 * Create a validator
 */
export function createValidator(): MustHaveValidator {
  return new MustHaveValidator();
}
