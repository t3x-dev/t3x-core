/**
 * Template Rendering Engine
 *
 * Provides template parsing and rendering functionality for leaf prompts.
 * Supports variable substitution and conditional blocks.
 *
 * Template Syntax:
 * - {{variable}} - Simple variable substitution
 * - {{#variable}}...{{/variable}} - Conditional block (shown if variable has value)
 *
 * Owner: GEN-* track
 * @see docs/plans/parallel-dev-guidelines.md
 */

import type { SemanticContent } from '../semantic/types';
import { serializeForPrompt } from '../semantic/serialize';
import { flattenTrees } from '../semantic/tree';
import type { AnyLeafType, Constraint, Leaf } from '../types';
import { isGenerationLeaf } from '../types';
import { formatConstraints, getTypeInstructions } from './build-prompt';
import { getDefaultTemplate } from './templates';
import type {
  LeafTemplate,
  RenderedTemplate,
  TemplateContext,
  TemplateVariableName,
} from './types';
import { TEMPLATE_VARIABLE_NAMES } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Template Context Builder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build template context from semantic knowledge and leaf data.
 *
 * @param knowledge - The semantic content (frames + relations)
 * @param leaf - The leaf containing constraints and config
 * @param additionalInstructions - Optional additional instructions
 * @returns Template context with all variable values
 */
export function buildTemplateContext(
  knowledge: SemanticContent,
  leaf: Leaf,
  additionalInstructions?: string
): TemplateContext {
  // Build knowledge items and formatted knowledge
  const frames = flattenTrees(knowledge.trees);
  const knowledgeItems = frames.map(
    (f: import('../semantic/types').FlatNode) =>
      `${f.type}: ${Object.entries(f.slots)
        .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ')}`
  );
  const formattedKnowledge = serializeForPrompt(knowledge);

  // Format constraints
  const { requires, excludes } = formatConstraintsForTemplate(leaf.constraints);
  const formattedConstraints = buildFormattedConstraintsSection(requires, excludes);

  // Get type instructions
  const typeInstructions = getTypeInstructions(leaf.type, leaf.config);

  return {
    knowledge: knowledgeItems,
    formattedKnowledge,
    requires,
    excludes,
    formattedConstraints,
    leafTitle: leaf.title || '',
    leafType: leaf.type,
    additionalInstructions: additionalInstructions || '',
    typeInstructions,
  };
}

/**
 * Format constraints into string arrays for template use.
 */
function formatConstraintsForTemplate(constraints: Constraint[]): {
  requires: string[];
  excludes: string[];
} {
  const { requires, excludes } = formatConstraints(constraints);
  return { requires, excludes };
}

/**
 * Build the formatted constraints section text.
 */
function buildFormattedConstraintsSection(requires: string[], excludes: string[]): string {
  if (requires.length === 0 && excludes.length === 0) {
    return '';
  }

  const parts: string[] = ['## Constraints\n'];

  if (requires.length > 0) {
    parts.push('### Required (MUST include):');
    parts.push(requires.join('\n'));
    parts.push('');
  }

  if (excludes.length > 0) {
    parts.push('### Excluded (MUST NOT include):');
    parts.push(excludes.join('\n'));
    parts.push('');
  }

  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Template Variable Parser
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract all variable names from a template string (including unknown ones).
 * Internal function used for validation.
 */
function extractAllVariableNames(template: string): string[] {
  const variableRegex = /\{\{#?([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const found = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = variableRegex.exec(template)) !== null) {
    found.add(match[1]);
  }

  return Array.from(found);
}

/**
 * Extract all variable names used in a template string.
 *
 * @param template - Template string with {{variable}} placeholders
 * @returns Array of unique known variable names found
 */
export function parseTemplateVariables(template: string): TemplateVariableName[] {
  // Filter to only known template variables
  return extractAllVariableNames(template).filter((name) =>
    TEMPLATE_VARIABLE_NAMES.includes(name as TemplateVariableName)
  ) as TemplateVariableName[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Template Renderer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a template string by substituting variables.
 *
 * Supports two syntaxes:
 * - {{variable}} - Replaced with variable value (empty string if not set)
 * - {{#variable}}...{{/variable}} - Block shown only if variable has non-empty value
 *
 * @param template - Template string with placeholders
 * @param context - Context containing variable values
 * @returns Rendered string with variables substituted
 */
export function renderTemplateString(template: string, context: TemplateContext): string {
  let result = template;

  // First, process conditional blocks {{#variable}}...{{/variable}}
  const blockRegex = /\{\{#([a-zA-Z_][a-zA-Z0-9_]*)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  result = result.replace(blockRegex, (_, variableName: string, blockContent: string) => {
    const value = getContextValue(context, variableName);
    // Show block only if variable has a non-empty value
    if (value && String(value).trim() !== '') {
      // Recursively render the block content
      return renderTemplateString(blockContent, context);
    }
    return '';
  });

  // Then, process simple variable substitutions {{variable}}
  const varRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  result = result.replace(varRegex, (_, variableName: string) => {
    const value = getContextValue(context, variableName);
    if (Array.isArray(value)) {
      return value.join('\n');
    }
    return String(value ?? '');
  });

  // Clean up multiple consecutive blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/**
 * Get a value from the template context by variable name.
 */
function getContextValue(
  context: TemplateContext,
  variableName: string
): string | string[] | undefined {
  switch (variableName) {
    case 'knowledge':
      return context.knowledge;
    case 'formattedKnowledge':
      return context.formattedKnowledge;
    case 'requires':
      return context.requires;
    case 'excludes':
      return context.excludes;
    case 'formattedConstraints':
      return context.formattedConstraints;
    case 'leafTitle':
      return context.leafTitle;
    case 'leafType':
      return context.leafType;
    case 'additionalInstructions':
      return context.additionalInstructions;
    case 'typeInstructions':
      return context.typeInstructions;
    default:
      return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Template Rendering Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for rendering a template.
 */
export interface RenderTemplateOptions {
  /** The semantic knowledge (frames + relations) */
  knowledge: SemanticContent;

  /** The leaf containing constraints and config */
  leaf: Leaf;

  /** Additional instructions to include */
  additionalInstructions?: string;

  /** Custom template to use (optional, defaults to type's default template) */
  template?: LeafTemplate;
}

/**
 * Render a complete template for a leaf.
 *
 * This is the main entry point for template rendering.
 * It builds the context, selects the template, and renders both prompts.
 *
 * @param options - Render options
 * @returns Rendered template with system and user prompts
 */
export function renderTemplate(options: RenderTemplateOptions): RenderedTemplate {
  const { knowledge, leaf, additionalInstructions, template: customTemplate } = options;

  // Select template: custom template > leaf config template_id > default
  const template = selectTemplate(leaf.type, customTemplate, leaf.config?.template_id as string);

  // Build context
  const context = buildTemplateContext(knowledge, leaf, additionalInstructions);

  // Render prompts
  const systemPrompt = renderTemplateString(template.systemPrompt, context);
  const userPrompt = renderTemplateString(template.userPrompt, context);

  // Track which variables were substituted
  const substitutedVariables = parseTemplateVariables(template.systemPrompt + template.userPrompt);

  return {
    systemPrompt,
    userPrompt,
    templateId: template.id,
    substitutedVariables,
  };
}

/**
 * Select the appropriate template based on priority:
 * 1. Custom template passed directly
 * 2. Template ID from leaf config
 * 3. Default template for leaf type
 */
function selectTemplate(
  leafType: AnyLeafType,
  customTemplate?: LeafTemplate,
  _templateId?: string
): LeafTemplate {
  // Priority 1: Custom template passed directly
  if (customTemplate) {
    return customTemplate;
  }

  // Priority 2: Template ID from config (future: lookup from template registry)
  // For now, we only support default templates, so templateId is ignored
  // This is where custom template registry lookup would go

  // Priority 3: Default template for leaf type (text generation types only)
  if (isGenerationLeaf(leafType)) {
    return getDefaultTemplate(leafType);
  }

  // Fallback for deploy types: use article template as generic base
  return getDefaultTemplate('article');
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a template string for syntax errors.
 *
 * @param template - Template string to validate
 * @returns Object with valid flag and any error messages
 */
export function validateTemplateSyntax(template: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for unclosed conditional blocks
  const openBlocks = template.match(/\{\{#([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g) || [];
  const closeBlocks = template.match(/\{\{\/([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g) || [];

  const openNames = openBlocks.map((b) => b.slice(3, -2));
  const closeNames = closeBlocks.map((b) => b.slice(3, -2));

  for (const name of openNames) {
    if (!closeNames.includes(name)) {
      errors.push(`Unclosed conditional block: {{#${name}}}`);
    }
  }

  for (const name of closeNames) {
    if (!openNames.includes(name)) {
      errors.push(`Unmatched closing block: {{/${name}}}`);
    }
  }

  // Check for unknown variables (use extractAllVariableNames to include unknown ones)
  const allVars = extractAllVariableNames(template);
  const unknownVars = allVars.filter(
    (v) => !TEMPLATE_VARIABLE_NAMES.includes(v as TemplateVariableName)
  );
  for (const v of unknownVars) {
    errors.push(`Unknown template variable: {{${v}}}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get a preview of what a template will produce with sample data.
 *
 * @param template - The template to preview
 * @param leafType - The leaf type for sample data
 * @returns Preview of rendered template
 */
export function previewTemplate(template: LeafTemplate, leafType: AnyLeafType): RenderedTemplate {
  // Create sample context
  const sampleContext: TemplateContext = {
    knowledge: ['user_preference: theme=dark mode', 'language: primary=English', 'goal: task=complete project'],
    formattedKnowledge: 'user_preference:\n  theme: dark mode\nlanguage:\n  primary: English\ngoal:\n  task: complete project',
    requires: ['- MUST include EXACTLY: "sample requirement"'],
    excludes: ['- MUST NOT include exactly: "sample exclusion"'],
    formattedConstraints: `## Constraints

### Required (MUST include):
- MUST include EXACTLY: "sample requirement"

### Excluded (MUST NOT include):
- MUST NOT include exactly: "sample exclusion"
`,
    leafTitle: 'Sample Leaf Title',
    leafType,
    additionalInstructions: 'Sample additional instructions.',
    typeInstructions: getTypeInstructions(leafType),
  };

  const systemPrompt = renderTemplateString(template.systemPrompt, sampleContext);
  const userPrompt = renderTemplateString(template.userPrompt, sampleContext);
  const substitutedVariables = parseTemplateVariables(template.systemPrompt + template.userPrompt);

  return {
    systemPrompt,
    userPrompt,
    templateId: template.id,
    substitutedVariables,
  };
}
