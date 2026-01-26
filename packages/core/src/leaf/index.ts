/**
 * Leaf Module - Generation and Validation for Leaf Outputs
 *
 * This module provides functionality for:
 * - Building prompts from commits and leaves
 * - Generating leaf outputs via LLM
 * - Validating outputs against constraints
 *
 * File Ownership:
 * ┌─────────────────────────────┬─────────────┬─────────────┐
 * │ File                        │ GEN-* Owner │ VAL-* Owner │
 * ├─────────────────────────────┼─────────────┼─────────────┤
 * │ types.ts                    │ SHARED      │ SHARED      │
 * │ build-prompt.ts             │ ✓           │ ✗           │
 * │ generate.ts                 │ ✓           │ ✗           │
 * │ validate-constraints.ts     │ ✗           │ ✓           │
 * │ index.ts                    │ Add exports │ Add exports │
 * └─────────────────────────────┴─────────────┴─────────────┘
 *
 * @see docs/plans/parallel-dev-guidelines.md
 */

// ═══════════════════════════════════════════════════════════════════════════
// Type Exports (SHARED - frozen contract)
// ═══════════════════════════════════════════════════════════════════════════
export type {
  // Generation types
  BuildPromptOptions,
  BuiltPrompt,
  GenerateOptions,
  GenerateResult,
  // Validation types
  ValidateOptions,
  ValidationResult,
  ConstraintCheckResult,
} from './types';

export {
  // Shared constants
  SEMANTIC_REQUIRE_THRESHOLD,
  SEMANTIC_EXCLUDE_THRESHOLD,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Generation Exports (GEN-* adds here)
// ═══════════════════════════════════════════════════════════════════════════
export {
  buildLeafPrompt,
  buildSystemPrompt,
  getTypeInstructions,
  formatConstraints,
} from './build-prompt';
export {
  generateLeafOutput,
  isGenerationConfigured,
  GenerationError,
} from './generate';

// ═══════════════════════════════════════════════════════════════════════════
// Validation Exports (VAL-* adds here)
// ═══════════════════════════════════════════════════════════════════════════
export {
  validateConstraints,
  validateConstraintsExactOnly,
  generateAssertionId,
  validateRequireExact,
  validateExcludeExact,
  validateRequireSemantic,
  validateExcludeSemantic,
} from './validate-constraints';
