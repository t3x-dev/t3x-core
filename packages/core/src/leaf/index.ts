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
// Generation Exports (GEN-* adds here)
// ═══════════════════════════════════════════════════════════════════════════
export type { BuildPromptWithTemplateOptions } from './build-prompt';
export {
  buildLeafPrompt,
  buildLeafPromptAuto,
  buildLeafPromptWithTemplate,
  buildSystemPrompt,
  formatConstraints,
  getTypeInstructions,
} from './build-prompt';
// ═══════════════════════════════════════════════════════════════════════════
// Constraint Suggestion Exports
// ═══════════════════════════════════════════════════════════════════════════
export type {
  ConstraintSuggestionResult,
  SuggestConstraintsOptions,
  SuggestedConstraint,
} from './constraintSuggester';
export { suggestConstraints, suggestionsToConstraints } from './constraintSuggester';
// ═══════════════════════════════════════════════════════════════════════════
// Corrective Prompt Exports (Upgrade #3: Intelligent Feedback Retry)
// ═══════════════════════════════════════════════════════════════════════════
export type { CorrectivePromptOptions } from './corrective-prompt';
export { buildCorrectivePrompt } from './corrective-prompt';
export {
  GenerationError,
  generateLeafOutput,
  isGenerationConfigured,
} from './generate';
// ═══════════════════════════════════════════════════════════════════════════
// Multi-Round Generation (#12)
// ═══════════════════════════════════════════════════════════════════════════
export {
  buildRound1Prompt,
  buildRound2Prompt,
  buildRound3Prompt,
  type GenerationMode,
  type ModeGenerateOptions,
  type MultiRoundOptions,
  type MultiRoundResult,
  modeGenerate,
  multiRoundGenerate,
  type RoundConfig,
  type RoundResult,
  type StylePreferences,
  validateConstraintsSimple,
} from './multi-round-generate';
export type { RenderTemplateOptions } from './template';
export {
  buildTemplateContext,
  // Template utilities
  parseTemplateVariables,
  previewTemplate,
  // Template rendering
  renderTemplate,
  renderTemplateString,
  validateTemplateSyntax,
} from './template';
// ═══════════════════════════════════════════════════════════════════════════
// Template Exports (Template System)
// ═══════════════════════════════════════════════════════════════════════════
export {
  articleDefaultTemplate,
  // Registry and helpers
  DEFAULT_TEMPLATES,
  emailDefaultTemplate,
  getAllDefaultTemplates,
  getDefaultTemplate,
  slackDefaultTemplate,
  // Individual default templates
  tweetDefaultTemplate,
  wechatDefaultTemplate,
  weiboDefaultTemplate,
} from './templates';
// ═══════════════════════════════════════════════════════════════════════════
// Type Exports (SHARED - frozen contract)
// ═══════════════════════════════════════════════════════════════════════════
export type {
  // Generation types
  BuildPromptOptions,
  BuiltPrompt,
  ConstraintCheckResult,
  GenerateOptions,
  GenerateResult,
  LeafTemplate,
  RenderedTemplate,
  // Semantic threshold override type
  SemanticThreshold,
  TemplateContext,
  TemplateVariable,
  // Template types
  TemplateVariableName,
  // Validation types
  ValidateOptions,
  ValidationResult,
} from './types';
export {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  SEMANTIC_EXCLUDE_THRESHOLD,
  // Shared constants
  SEMANTIC_REQUIRE_THRESHOLD,
  // Template constants
  TEMPLATE_VARIABLE_NAMES,
  TEMPLATE_VARIABLES,
} from './types';
// ═══════════════════════════════════════════════════════════════════════════
// Validation Exports (VAL-* adds here)
// ═══════════════════════════════════════════════════════════════════════════
export {
  generateAssertionId,
  validateConstraints,
  validateConstraintsExactOnly,
  validateExcludeExact,
  validateExcludeSemantic,
  validateRequireExact,
  validateRequireSemantic,
} from './validate-constraints';
