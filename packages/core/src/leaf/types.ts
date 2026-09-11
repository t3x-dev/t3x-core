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
 */

import type { Lesson } from '../feedback/types';
import type { LLMProvider } from '../llm/types';
import type { EmbeddingProvider } from '../providers/embedding/base';
import type { SemanticContent } from '../semantic/types';
import type { AnyLeafType, Assertion, Constraint, Leaf, LeafType } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Generation Types (GEN-* uses)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for building a prompt from commit and leaf data.
 */
export interface BuildPromptOptions {
  /** The semantic knowledge (frames + relations) */
  knowledge: SemanticContent;

  /** The leaf containing constraints and config */
  leaf: Leaf;

  /** Additional instructions to include in the prompt */
  additionalInstructions?: string;

  /** Lessons learned from previous generation attempts (Upgrade #4: feedback loop) */
  lessons?: Lesson[];
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
    frameCount: number;
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

  /** Optional LLM provider. If not provided, falls back to Anthropic direct API call. */
  provider?: LLMProvider;
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

  /** Validation result from auto-verify (present when constraints exist) */
  validation?: {
    allPassed: boolean;
    passedCount: number;
    failedCount: number;
    assertions: Assertion[];
  };

  /** Number of generation attempts (1 = first try passed, >1 = retries needed) */
  attempts: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Types (VAL-* uses)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Per-leaf semantic threshold overrides.
 * When set on Leaf.config.semantic_threshold, these override the global defaults.
 */
export interface SemanticThreshold {
  /** Override for require constraint threshold (default: 0.85) */
  require?: number;
  /** Override for exclude constraint threshold (default: 0.70) */
  exclude?: number;
}

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

  /** Per-leaf semantic threshold overrides (optional, falls back to global constants) */
  semanticThreshold?: SemanticThreshold;
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
export const SEMANTIC_EXCLUDE_THRESHOLD = 0.7;

/** Default LLM model for generation */
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** Default temperature for generation */
export const DEFAULT_TEMPERATURE = 0.7;

// ═══════════════════════════════════════════════════════════════════════════
// Template Types (Template System)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Supported template variable names.
 * These are the built-in variables that can be used in templates.
 */
export const TEMPLATE_VARIABLE_NAMES = [
  'knowledge', // raw knowledge item array
  'formattedKnowledge', // formatted knowledge (YAML-like)
  'formattedSemanticPoints', // selected semantic points
  'requires', // require constraint array
  'excludes', // exclude constraint array
  'formattedConstraints', // formatted constraint text
  'leafTitle', // leaf title
  'leafType', // leaf type
  'additionalInstructions', // extra instructions
  'typeInstructions', // type-specific instructions (backward compatible)
] as const;

export type TemplateVariableName = (typeof TEMPLATE_VARIABLE_NAMES)[number];

/**
 * Definition of a template variable.
 * Describes what a variable represents and whether it's required.
 */
export interface TemplateVariable {
  /** Variable name, e.g., "nodes" */
  name: TemplateVariableName;

  /** Human-readable description */
  description: string;

  /** Whether this variable is required */
  required: boolean;

  /** Default value if not provided */
  defaultValue?: string;
}

/**
 * A template for generating leaf output.
 * Templates define the structure of prompts with variable placeholders.
 */
export interface LeafTemplate {
  /** Unique template identifier, e.g., "tweet_default" */
  id: string;

  /** The leaf type this template is for */
  type: LeafType;

  /** Display name, e.g., "Twitter Standard Template" */
  name: string;

  /** Template description */
  description: string;

  /** System prompt template with {{variable}} placeholders */
  systemPrompt: string;

  /** User prompt template with {{variable}} placeholders */
  userPrompt: string;

  /** Variables used by this template */
  variables: TemplateVariable[];
}

/**
 * Context data for rendering a template.
 * Contains all values that can be substituted into template variables.
 */
export interface TemplateContext {
  /** Raw knowledge item texts */
  knowledge: string[];

  /** Formatted knowledge in YAML-like format */
  formattedKnowledge: string;

  /** Selected semantic points derived from source knowledge */
  formattedSemanticPoints: string;

  /** Formatted require constraints */
  requires: string[];

  /** Formatted exclude constraints */
  excludes: string[];

  /** Combined formatted constraints text */
  formattedConstraints: string;

  /** Leaf title */
  leafTitle: string;

  /** Leaf type */
  leafType: AnyLeafType;

  /** Additional instructions */
  additionalInstructions: string;

  /** Type-specific instructions for backward compatibility */
  typeInstructions: string;
}

/**
 * Result of rendering a template.
 */
export interface RenderedTemplate {
  /** Rendered system prompt */
  systemPrompt: string;

  /** Rendered user prompt */
  userPrompt: string;

  /** Template ID that was used */
  templateId: string;

  /** Variables that were substituted */
  substitutedVariables: TemplateVariableName[];
}

/**
 * Built-in template variable definitions.
 * Used for documentation and validation.
 */
export const TEMPLATE_VARIABLES: Record<TemplateVariableName, TemplateVariable> = {
  knowledge: {
    name: 'knowledge',
    description: 'Raw array of knowledge item texts from the commit',
    required: false,
    defaultValue: '',
  },
  formattedKnowledge: {
    name: 'formattedKnowledge',
    description: 'YAML-like formatted knowledge for display',
    required: true,
  },
  formattedSemanticPoints: {
    name: 'formattedSemanticPoints',
    description: 'Selected semantic points section derived from source knowledge',
    required: false,
    defaultValue: '',
  },
  requires: {
    name: 'requires',
    description: 'Array of formatted require constraints',
    required: false,
    defaultValue: '',
  },
  excludes: {
    name: 'excludes',
    description: 'Array of formatted exclude constraints',
    required: false,
    defaultValue: '',
  },
  formattedConstraints: {
    name: 'formattedConstraints',
    description: 'Combined constraints section text',
    required: false,
    defaultValue: '',
  },
  leafTitle: {
    name: 'leafTitle',
    description: 'Title of the leaf',
    required: false,
    defaultValue: '',
  },
  leafType: {
    name: 'leafType',
    description: 'Type of the leaf',
    required: true,
  },
  additionalInstructions: {
    name: 'additionalInstructions',
    description: 'Extra instructions provided by user',
    required: false,
    defaultValue: '',
  },
  typeInstructions: {
    name: 'typeInstructions',
    description: 'Type-specific format instructions',
    required: false,
    defaultValue: '',
  },
};
