/**
 * Leaf Prompt Builder
 *
 * Constructs LLM prompts from commit sentences and leaf constraints.
 * Supports both legacy string concatenation and template-based rendering.
 *
 * Owner: GEN-* track
 * @see docs/plans/parallel-dev-guidelines.md
 */

import type { AnyLeafType, Constraint } from '../types/v4';
import type { BuildPromptOptions, BuiltPrompt, LeafTemplate } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Type-specific Instructions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get format instructions for each leaf type.
 */
export function getTypeInstructions(
  leafType: AnyLeafType,
  config?: Record<string, unknown>
): string {
  switch (leafType) {
    case 'tweet':
      return `Format: Twitter/X post
- Maximum 280 characters
- Be concise and impactful
- Use hashtags sparingly if relevant
- No formal greetings or sign-offs`;

    case 'weibo':
      return `Format: Weibo post (微博)
- Write in Chinese (简体中文)
- Maximum 2000 characters (but shorter is better)
- Can include emojis if appropriate
- Adapt tone for Chinese social media culture`;

    case 'wechat':
      return `Format: WeChat article/message (微信)
- Write in Chinese (简体中文)
- Clear and readable formatting
- Appropriate for professional or personal context
- Can be longer form if needed`;

    case 'article':
      return `Format: Article/Blog post
- Include a compelling title
- Use clear section headings
- Well-structured paragraphs
- Professional tone
- Include introduction and conclusion`;

    case 'email':
      return `Format: Email
- Include appropriate greeting
- Clear and professional body
- Include sign-off
- Be concise but complete
${config?.recipient ? `- Recipient: ${config.recipient}` : ''}`;

    case 'slack':
      return `Format: Slack message
- Conversational but professional tone
- Can use basic formatting (bold, bullets)
- Be concise and scannable
- Avoid overly formal language`;

    default:
      return `Format: General text output
- Be clear and well-structured
- Adapt tone to the content`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Constraint Formatting
// ═══════════════════════════════════════════════════════════════════════════

interface FormattedConstraints {
  requires: string[];
  excludes: string[];
}

/**
 * Format constraints into human-readable instructions.
 */
export function formatConstraints(constraints: Constraint[]): FormattedConstraints {
  const requires: string[] = [];
  const excludes: string[] = [];

  for (const constraint of constraints) {
    if (constraint.type === 'require') {
      const matchType = constraint.match_mode === 'exact' ? 'EXACTLY' : 'semantically';
      requires.push(`- MUST include ${matchType}: "${constraint.value}"`);
    } else if (constraint.type === 'exclude') {
      const matchType = constraint.match_mode === 'exact' ? 'exactly' : 'semantically';
      const reason = constraint.reason ? ` (Reason: ${constraint.reason})` : '';
      excludes.push(`- MUST NOT include ${matchType}: "${constraint.value}"${reason}`);
    }
  }

  return { requires, excludes };
}

// ═══════════════════════════════════════════════════════════════════════════
// System Prompt Builder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the system prompt for a given leaf type.
 */
export function buildSystemPrompt(leafType: AnyLeafType): string {
  return `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided sentences as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

${getTypeInstructions(leafType)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Prompt Builder
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a complete prompt for leaf output generation.
 *
 * @param options - Build prompt options containing commit, leaf, and optional instructions
 * @returns Built prompt with system prompt, user prompt, and metadata
 */
export function buildLeafPrompt(options: BuildPromptOptions): BuiltPrompt {
  const { commit, leaf, additionalInstructions } = options;

  // Extract sentences from commit
  const sentences = commit.content.sentences;
  const sentenceTexts = sentences.map((s, i) => `${i + 1}. ${s.text}`).join('\n');

  // Format constraints
  const { requires, excludes } = formatConstraints(leaf.constraints);
  const requireCount = requires.length;
  const excludeCount = excludes.length;

  // Build system prompt
  const systemPrompt = buildSystemPrompt(leaf.type);

  // Build user prompt
  const userPromptParts: string[] = [];

  // Add source sentences
  userPromptParts.push('## Source Knowledge\n');
  userPromptParts.push('Use the following sentences as your source material:\n');
  userPromptParts.push(sentenceTexts);
  userPromptParts.push('');

  // Add constraints if any
  if (requireCount > 0 || excludeCount > 0) {
    userPromptParts.push('## Constraints\n');

    if (requireCount > 0) {
      userPromptParts.push('### Required (MUST include):');
      userPromptParts.push(requires.join('\n'));
      userPromptParts.push('');
    }

    if (excludeCount > 0) {
      userPromptParts.push('### Excluded (MUST NOT include):');
      userPromptParts.push(excludes.join('\n'));
      userPromptParts.push('');
    }
  }

  // Add leaf title/context if available
  if (leaf.title) {
    userPromptParts.push(`## Context\n`);
    userPromptParts.push(`Title/Purpose: ${leaf.title}`);
    userPromptParts.push('');
  }

  // Add lessons learned from previous generations
  if (options.lessons && options.lessons.length > 0) {
    userPromptParts.push('## Lessons Learned\n');
    userPromptParts.push('From previous generation attempts, keep these lessons in mind:\n');
    for (const lesson of options.lessons) {
      userPromptParts.push(`- ${lesson}`);
    }
    userPromptParts.push('');
  }

  // Add additional instructions if provided
  if (additionalInstructions) {
    userPromptParts.push('## Additional Instructions\n');
    userPromptParts.push(additionalInstructions);
    userPromptParts.push('');
  }

  // Add generation instruction
  userPromptParts.push('## Task\n');
  userPromptParts.push(
    `Generate the ${leaf.type} content based on the above source knowledge and constraints.`
  );

  const userPrompt = userPromptParts.join('\n');

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      sentenceCount: sentences.length,
      requireCount,
      excludeCount,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Template-based Prompt Builder
// ═══════════════════════════════════════════════════════════════════════════

// Lazy import to avoid circular dependency
let templateModule: typeof import('./template') | null = null;

async function getTemplateModule() {
  if (!templateModule) {
    templateModule = await import('./template');
  }
  return templateModule;
}

/**
 * Options for template-based prompt building.
 */
export interface BuildPromptWithTemplateOptions extends BuildPromptOptions {
  /** Custom template to use (optional, defaults to type's default template) */
  template?: LeafTemplate;
}

/**
 * Build a prompt using the template system.
 *
 * This function uses the template rendering engine to build prompts,
 * allowing for customizable prompt structures via templates.
 *
 * @param options - Build prompt options with optional custom template
 * @returns Built prompt with system prompt, user prompt, and metadata
 */
export async function buildLeafPromptWithTemplate(
  options: BuildPromptWithTemplateOptions
): Promise<BuiltPrompt> {
  const { commit, leaf, additionalInstructions, template: customTemplate } = options;

  const { renderTemplate } = await getTemplateModule();

  // Render using template system
  const rendered = renderTemplate({
    commit,
    leaf,
    additionalInstructions,
    template: customTemplate,
  });

  // Calculate metadata
  const { requires, excludes } = formatConstraints(leaf.constraints);

  return {
    systemPrompt: rendered.systemPrompt,
    userPrompt: rendered.userPrompt,
    metadata: {
      sentenceCount: commit.content.sentences.length,
      requireCount: requires.length,
      excludeCount: excludes.length,
    },
  };
}

/**
 * Build a prompt, optionally using templates.
 *
 * This is a convenience function that chooses between legacy and template modes:
 * - If `leaf.config.use_template` is true, uses template system
 * - Otherwise, uses legacy string concatenation (backward compatible)
 *
 * For explicit template control, use `buildLeafPromptWithTemplate()` directly.
 *
 * @param options - Build prompt options
 * @param useTemplate - Force template mode (overrides leaf.config.use_template)
 * @returns Built prompt (Promise if using templates, sync otherwise)
 */
export function buildLeafPromptAuto(
  options: BuildPromptOptions,
  useTemplate?: boolean
): BuiltPrompt | Promise<BuiltPrompt> {
  const shouldUseTemplate = useTemplate ?? options.leaf.config?.use_template === true;

  if (shouldUseTemplate) {
    return buildLeafPromptWithTemplate(options);
  }

  return buildLeafPrompt(options);
}
