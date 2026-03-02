/**
 * Leaf Constraint Validation
 *
 * Validates generated output against constraints (REQUIRE/EXCLUDE).
 * Supports both exact string matching and semantic similarity.
 *
 * Validation Rules:
 * ┌────────────┬────────────┬─────────────────────────────────┬───────────┐
 * │ Constraint │ Match Mode │ Rule                            │ Threshold │
 * ├────────────┼────────────┼─────────────────────────────────┼───────────┤
 * │ REQUIRE    │ exact      │ Case-insensitive substring      │ -         │
 * │ REQUIRE    │ semantic   │ Cosine similarity               │ >= 0.85   │
 * │ EXCLUDE    │ exact      │ String must NOT appear          │ -         │
 * │ EXCLUDE    │ semantic   │ Cosine similarity               │ < 0.70    │
 * └────────────┴────────────┴─────────────────────────────────┴───────────┘
 *
 * Owner: VAL-* track
 * @see docs/plans/parallel-dev-guidelines.md
 */

import { nanoid } from 'nanoid';
import type { EmbeddingProvider } from '../providers/embedding/base';
import { cosineSimilarity } from '../providers/embedding/base';
import type { Assertion, Constraint } from '../types/v4';
import { ID_PREFIXES } from '../types/v4';
import type { ConstraintCheckResult, ValidateOptions, ValidationResult } from './types';
import { SEMANTIC_EXCLUDE_THRESHOLD, SEMANTIC_REQUIRE_THRESHOLD } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// ID Generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique assertion ID with ast_ prefix.
 *
 * @returns Assertion ID in format "ast_" + nanoid(12)
 */
export function generateAssertionId(): string {
  return `${ID_PREFIXES.assertion}${nanoid(12)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Exact Match Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate REQUIRE constraint with exact (case-insensitive) matching.
 *
 * @param output - The generated output text to validate
 * @param value - The required value that must be present
 * @returns ConstraintCheckResult with passed=true if value is found
 */
export function validateRequireExact(
  output: string,
  value: string
): Omit<ConstraintCheckResult, 'constraint'> {
  const outputLower = output.toLowerCase();
  const valueLower = value.toLowerCase();
  const index = outputLower.indexOf(valueLower);

  if (index !== -1) {
    // Found: extract the actual matched text (preserving original case)
    const foundText = output.substring(index, index + value.length);
    return {
      passed: true,
      evidence: {
        found: foundText,
        location: index,
      },
      message: `Required value "${value}" found at position ${index}`,
    };
  }

  return {
    passed: false,
    message: `Required value "${value}" not found in output`,
  };
}

/**
 * Validate EXCLUDE constraint with exact (case-insensitive) matching.
 *
 * @param output - The generated output text to validate
 * @param value - The excluded value that must NOT be present
 * @returns ConstraintCheckResult with passed=true if value is NOT found
 */
export function validateExcludeExact(
  output: string,
  value: string
): Omit<ConstraintCheckResult, 'constraint'> {
  const outputLower = output.toLowerCase();
  const valueLower = value.toLowerCase();
  const index = outputLower.indexOf(valueLower);

  if (index === -1) {
    // Not found: constraint passes
    return {
      passed: true,
      message: `Excluded value "${value}" not found in output (good)`,
    };
  }

  // Found: constraint fails
  const foundText = output.substring(index, index + value.length);
  return {
    passed: false,
    evidence: {
      found: foundText,
      location: index,
    },
    message: `Excluded value "${value}" found at position ${index}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Semantic Match Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate REQUIRE constraint with semantic (embedding-based) matching.
 *
 * Passes when cosine similarity between output and value >= threshold.
 * Uses configurable threshold if provided, otherwise falls back to SEMANTIC_REQUIRE_THRESHOLD (0.85).
 *
 * @param output - The generated output text to validate
 * @param value - The required semantic meaning that must be present
 * @param embedder - Embedding provider for vector encoding
 * @param threshold - Optional custom threshold (overrides global default)
 * @returns Promise resolving to ConstraintCheckResult
 */
export async function validateRequireSemantic(
  output: string,
  value: string,
  embedder: EmbeddingProvider,
  threshold?: number
): Promise<Omit<ConstraintCheckResult, 'constraint'>> {
  const effectiveThreshold = threshold ?? SEMANTIC_REQUIRE_THRESHOLD;

  // Encode both texts to vectors
  const [outputVec, valueVec] = await embedder.encode([output, value]);

  // Calculate cosine similarity
  const similarity = cosineSimilarity(outputVec, valueVec);

  if (similarity >= effectiveThreshold) {
    return {
      passed: true,
      evidence: {
        similarity,
      },
      message: `Semantic similarity ${similarity.toFixed(3)} >= ${effectiveThreshold} threshold`,
    };
  }

  return {
    passed: false,
    evidence: {
      similarity,
    },
    message: `Semantic similarity ${similarity.toFixed(3)} < ${effectiveThreshold} threshold for required value "${value}"`,
  };
}

/**
 * Validate EXCLUDE constraint with semantic (embedding-based) matching.
 *
 * Passes when cosine similarity between output and value < threshold.
 * Uses configurable threshold if provided, otherwise falls back to SEMANTIC_EXCLUDE_THRESHOLD (0.70).
 *
 * @param output - The generated output text to validate
 * @param value - The excluded semantic meaning that must NOT be present
 * @param embedder - Embedding provider for vector encoding
 * @param threshold - Optional custom threshold (overrides global default)
 * @returns Promise resolving to ConstraintCheckResult
 */
export async function validateExcludeSemantic(
  output: string,
  value: string,
  embedder: EmbeddingProvider,
  threshold?: number
): Promise<Omit<ConstraintCheckResult, 'constraint'>> {
  const effectiveThreshold = threshold ?? SEMANTIC_EXCLUDE_THRESHOLD;

  // Encode both texts to vectors
  const [outputVec, valueVec] = await embedder.encode([output, value]);

  // Calculate cosine similarity
  const similarity = cosineSimilarity(outputVec, valueVec);

  if (similarity < effectiveThreshold) {
    // Low similarity means the excluded content is NOT present - good!
    return {
      passed: true,
      evidence: {
        similarity,
      },
      message: `Semantic similarity ${similarity.toFixed(3)} < ${effectiveThreshold} threshold (excluded content not present)`,
    };
  }

  // High similarity means the excluded content IS present - bad!
  return {
    passed: false,
    evidence: {
      similarity,
    },
    message: `Semantic similarity ${similarity.toFixed(3)} >= ${effectiveThreshold} threshold, excluded value "${value}" is semantically present`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Validation Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate output against constraints using exact matching only.
 *
 * This is the synchronous version that does NOT require an embedder.
 * Semantic constraints will be marked as failed with an error message.
 *
 * @param output - The generated output text to validate
 * @param constraints - Array of constraints to check
 * @returns ValidationResult with assertions for each constraint
 */
export function validateConstraintsExactOnly(
  output: string,
  constraints: Constraint[]
): ValidationResult {
  const assertions: Assertion[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const constraint of constraints) {
    let checkResult: Omit<ConstraintCheckResult, 'constraint'>;

    if (constraint.match_mode === 'semantic') {
      // Semantic matching not supported in sync version
      checkResult = {
        passed: false,
        message: `Semantic matching requires embedder. Use validateConstraints() for semantic constraints.`,
      };
    } else {
      // Exact matching
      if (constraint.type === 'require') {
        checkResult = validateRequireExact(output, constraint.value);
      } else {
        checkResult = validateExcludeExact(output, constraint.value);
      }
    }

    // Create assertion
    const assertion: Assertion = {
      id: generateAssertionId(),
      constraint_id: constraint.id,
      passed: checkResult.passed,
      details: checkResult.message,
    };

    assertions.push(assertion);

    if (checkResult.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  return {
    assertions,
    allPassed: failedCount === 0,
    passedCount,
    failedCount,
  };
}

/**
 * Validate output against constraints (async, supports semantic matching).
 *
 * This is the async version that supports both exact and semantic matching.
 * For semantic constraints, an embedder must be provided in options.
 *
 * @param options - Validation options containing output, constraints, and optional embedder
 * @returns Promise resolving to ValidationResult with assertions for each constraint
 */
export async function validateConstraints(options: ValidateOptions): Promise<ValidationResult> {
  const { output, constraints, embedder, semanticThreshold } = options;
  const assertions: Assertion[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const constraint of constraints) {
    let checkResult: Omit<ConstraintCheckResult, 'constraint'>;

    if (constraint.match_mode === 'semantic') {
      // Semantic matching requires embedder
      if (!embedder) {
        checkResult = {
          passed: false,
          message: `Semantic matching requires embedder but none was provided.`,
        };
      } else {
        // Use semantic validation with optional per-leaf threshold overrides
        if (constraint.type === 'require') {
          checkResult = await validateRequireSemantic(
            output,
            constraint.value,
            embedder,
            semanticThreshold?.require
          );
        } else {
          checkResult = await validateExcludeSemantic(
            output,
            constraint.value,
            embedder,
            semanticThreshold?.exclude
          );
        }
      }
    } else {
      // Exact matching
      if (constraint.type === 'require') {
        checkResult = validateRequireExact(output, constraint.value);
      } else {
        checkResult = validateExcludeExact(output, constraint.value);
      }
    }

    // Create assertion
    const assertion: Assertion = {
      id: generateAssertionId(),
      constraint_id: constraint.id,
      passed: checkResult.passed,
      details: checkResult.message,
    };

    assertions.push(assertion);

    if (checkResult.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  return {
    assertions,
    allPassed: failedCount === 0,
    passedCount,
    failedCount,
  };
}
