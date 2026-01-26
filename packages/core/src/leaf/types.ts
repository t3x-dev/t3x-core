/**
 * Leaf Module Type Contracts
 *
 * SHARED CONTRACT FILE - Do NOT modify without team coordination.
 *
 * This file defines interfaces for:
 * - Generation (GEN-* issues)
 * - Validation (VAL-* issues)
 *
 * Both tracks import from here to ensure compatibility.
 *
 * @see docs/plans/parallel-dev-guidelines.md
 */

import type { CommitV4, Leaf, Constraint, Assertion } from '../types/v4';
import type { EmbeddingProvider } from '../providers/embedding/base';

// ═══════════════════════════════════════════════════════════════════════════
// Generation Types (GEN-* uses)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for building a prompt from commit and leaf data.
 */
export interface BuildPromptOptions {
  /** The commit containing sentences (knowledge) */
  commit: CommitV4;

  /** The leaf containing constraints and config */
  leaf: Leaf;

  /** Additional instructions to include in the prompt */
  additionalInstructions?: string;
}

/**
 * Result of building a prompt.
 */
export interface BuiltPrompt {
  /** System prompt for the LLM */
  systemPrompt: string;

  /** User prompt for the LLM */
  userPrompt: string;

  /** Metadata about the prompt content */
  metadata: {
    sentenceCount: number;
    requireCount: number;
    excludeCount: number;
  };
}

/**
 * Options for generating leaf output.
 */
export interface GenerateOptions extends BuildPromptOptions {
  /** LLM model to use (defaults to DEFAULT_MODEL) */
  model?: string;

  /** Temperature for generation (defaults to DEFAULT_TEMPERATURE) */
  temperature?: number;

  /** Max tokens for generation */
  maxTokens?: number;
}

/**
 * Result of generating leaf output.
 */
export interface GenerateResult {
  /** The generated output text */
  output: string;

  /** Model used for generation */
  model: string;

  /** Token usage statistics */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };

  /** The prompts that were used */
  prompt: {
    system: string;
    user: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Types (VAL-* uses)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for validating leaf output against constraints.
 */
export interface ValidateOptions {
  /** The output text to validate */
  output: string;

  /** Constraints to check against */
  constraints: Constraint[];

  /** Embedder for semantic matching (optional, required for semantic constraints) */
  embedder?: EmbeddingProvider;
}

/**
 * Result of validating leaf output.
 */
export interface ValidationResult {
  /** Individual assertion results */
  assertions: Assertion[];

  /** Whether all constraints passed */
  allPassed: boolean;

  /** Number of passed constraints */
  passedCount: number;

  /** Number of failed constraints */
  failedCount: number;
}

/**
 * Result of checking a single constraint.
 */
export interface ConstraintCheckResult {
  /** The constraint that was checked */
  constraint: Constraint;

  /** Whether the constraint passed */
  passed: boolean;

  /** Evidence for the check result */
  evidence?: {
    /** Text that was found (for require) or matched (for exclude) */
    found?: string;
    /** Location in the output where match was found */
    location?: number;
    /** Similarity score for semantic matching */
    similarity?: number;
  };

  /** Human-readable message about the result */
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Threshold for semantic require constraint matching */
export const SEMANTIC_REQUIRE_THRESHOLD = 0.85;

/** Threshold for semantic exclude constraint matching */
export const SEMANTIC_EXCLUDE_THRESHOLD = 0.70;

/** Default LLM model for generation */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Default temperature for generation */
export const DEFAULT_TEMPERATURE = 0.7;
