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

import type { LLMProvider } from '../llm/types';
import type { EmbeddingProvider } from '../providers/embedding/base';
import type {
  AnyLeafType,
  Assertion,
  Constraint,
  Leaf,
  LeafType,
  SentenceCommit,
} from '../types/v4';

// ═══════════════════════════════════════════════════════════════════════════
// Generation Types (GEN-* uses)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for building a prompt from commit and leaf data.
 */
export interface BuildPromptOptions {
  /** The commit containing sentences (knowledge) */
  commit: SentenceCommit;

  /** The leaf containing constraints and config */
  leaf: Leaf;

  /** Additional instructions to include in the prompt */
  additionalInstructions?: string;

  /** Lessons learned from previous generation attempts (Upgrade #4: feedback loop) */
  lessons?: string[];
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
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

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
  'sentences', // 原始句子数组
  'formattedSentences', // 格式化后的句子（带编号）
  'requires', // require 约束数组
  'excludes', // exclude 约束数组
  'formattedConstraints', // 格式化后的约束文本
  'leafTitle', // Leaf 标题
  'leafType', // Leaf 类型
  'additionalInstructions', // 附加指令
  'typeInstructions', // 类型特定指令（向后兼容）
] as const;

export type TemplateVariableName = (typeof TEMPLATE_VARIABLE_NAMES)[number];

/**
 * Definition of a template variable.
 * Describes what a variable represents and whether it's required.
 */
export interface TemplateVariable {
  /** Variable name, e.g., "sentences" (变量名) */
  name: TemplateVariableName;

  /** Human-readable description (变量描述) */
  description: string;

  /** Whether this variable is required (是否必需) */
  required: boolean;

  /** Default value if not provided (默认值) */
  defaultValue?: string;
}

/**
 * A template for generating leaf output.
 * Templates define the structure of prompts with variable placeholders.
 */
export interface LeafTemplate {
  /** Unique template identifier, e.g., "tweet_default" (模板唯一标识) */
  id: string;

  /** The leaf type this template is for (对应的 leaf 类型) */
  type: LeafType;

  /** Display name, e.g., "Twitter Standard Template" (显示名称) */
  name: string;

  /** Template description (模板描述) */
  description: string;

  /** System prompt template with {{variable}} placeholders (系统提示词模板) */
  systemPrompt: string;

  /** User prompt template with {{variable}} placeholders (用户提示词模板) */
  userPrompt: string;

  /** Variables used by this template (该模板使用的变量列表) */
  variables: TemplateVariable[];
}

/**
 * Context data for rendering a template.
 * Contains all values that can be substituted into template variables.
 */
export interface TemplateContext {
  /** Raw sentence texts (原始句子文本列表) */
  sentences: string[];

  /** Formatted sentences with numbering (格式化后的句子，带编号) */
  formattedSentences: string;

  /** Formatted require constraints (必须包含的约束列表) */
  requires: string[];

  /** Formatted exclude constraints (必须排除的约束列表) */
  excludes: string[];

  /** Combined formatted constraints text (格式化后的约束文本) */
  formattedConstraints: string;

  /** Leaf title (Leaf 标题) */
  leafTitle: string;

  /** Leaf type (Leaf 类型) */
  leafType: AnyLeafType;

  /** Additional instructions (附加指令) */
  additionalInstructions: string;

  /** Type-specific instructions for backward compatibility (类型特定指令) */
  typeInstructions: string;
}

/**
 * Result of rendering a template.
 */
export interface RenderedTemplate {
  /** Rendered system prompt (渲染后的系统提示词) */
  systemPrompt: string;

  /** Rendered user prompt (渲染后的用户提示词) */
  userPrompt: string;

  /** Template ID that was used (使用的模板ID) */
  templateId: string;

  /** Variables that were substituted (被替换的变量) */
  substitutedVariables: TemplateVariableName[];
}

/**
 * Built-in template variable definitions.
 * Used for documentation and validation.
 */
export const TEMPLATE_VARIABLES: Record<TemplateVariableName, TemplateVariable> = {
  sentences: {
    name: 'sentences',
    description: 'Raw array of sentence texts from the commit (来源句子的原始文本数组)',
    required: false,
    defaultValue: '',
  },
  formattedSentences: {
    name: 'formattedSentences',
    description: 'Numbered list of sentences for display (格式化的编号句子列表)',
    required: true,
  },
  requires: {
    name: 'requires',
    description: 'Array of formatted require constraints (格式化的必须包含约束数组)',
    required: false,
    defaultValue: '',
  },
  excludes: {
    name: 'excludes',
    description: 'Array of formatted exclude constraints (格式化的必须排除约束数组)',
    required: false,
    defaultValue: '',
  },
  formattedConstraints: {
    name: 'formattedConstraints',
    description: 'Combined constraints section text (合并的约束部分文本)',
    required: false,
    defaultValue: '',
  },
  leafTitle: {
    name: 'leafTitle',
    description: 'Title of the leaf (Leaf 的标题)',
    required: false,
    defaultValue: '',
  },
  leafType: {
    name: 'leafType',
    description: 'Type of the leaf (Leaf 的类型)',
    required: true,
  },
  additionalInstructions: {
    name: 'additionalInstructions',
    description: 'Extra instructions provided by user (用户提供的附加指令)',
    required: false,
    defaultValue: '',
  },
  typeInstructions: {
    name: 'typeInstructions',
    description: 'Type-specific format instructions (类型特定的格式指令)',
    required: false,
    defaultValue: '',
  },
};
