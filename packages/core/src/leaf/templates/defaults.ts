/**
 * Default Templates for Leaf Types
 *
 * Each leaf type has a default template that defines the prompt structure.
 * Templates use {{variable}} syntax for variable interpolation.
 *
 * @see ../types.ts for TemplateVariable and LeafTemplate definitions
 */

import type { LeafTemplate } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Tweet Template (Twitter/X)
// ═══════════════════════════════════════════════════════════════════════════

export const tweetDefaultTemplate: LeafTemplate = {
  id: 'tweet_default',
  type: 'tweet',
  name: 'X / Twitter Standard Template',
  description: 'Standard template for X / Twitter posts with 280 character limit',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided knowledge as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: X / Twitter post
- Maximum 280 characters
- Be concise and impactful
- Use hashtags sparingly if relevant
- No formal greetings or sign-offs`,
  userPrompt: `## Source Knowledge

Use the following knowledge as your source material:
{{formattedKnowledge}}

{{formattedSemanticPoints}}
{{formattedConstraints}}
{{#leafTitle}}
## Context

Title/Purpose: {{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## Additional Instructions

{{additionalInstructions}}
{{/additionalInstructions}}
## Task

Generate the tweet content based on the above source knowledge and constraints.`,
  variables: [
    {
      name: 'formattedKnowledge',
      description: 'YAML-like formatted knowledge',
      required: true,
    },
    {
      name: 'formattedSemanticPoints',
      description: 'Selected semantic points section',
      required: false,
      defaultValue: '',
    },
    {
      name: 'formattedConstraints',
      description: 'Formatted constraints section',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf title for context', required: false, defaultValue: '' },
    {
      name: 'additionalInstructions',
      description: 'Extra instructions',
      required: false,
      defaultValue: '',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Article Template
// ═══════════════════════════════════════════════════════════════════════════

export const articleDefaultTemplate: LeafTemplate = {
  id: 'article_default',
  type: 'article',
  name: 'Blog Post Standard Template',
  description: 'Standard template for blog posts with sections and headings',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided knowledge as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Blog post
- Include a compelling title
- Use clear section headings
- Well-structured paragraphs
- Professional tone
- Include introduction and conclusion`,
  userPrompt: `## Source Knowledge

Use the following knowledge as your source material:
{{formattedKnowledge}}

{{formattedSemanticPoints}}
{{formattedConstraints}}
{{#leafTitle}}
## Context

Title/Purpose: {{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## Additional Instructions

{{additionalInstructions}}
{{/additionalInstructions}}
## Task

Generate the article content based on the above source knowledge and constraints.`,
  variables: [
    {
      name: 'formattedKnowledge',
      description: 'YAML-like formatted knowledge',
      required: true,
    },
    {
      name: 'formattedSemanticPoints',
      description: 'Selected semantic points section',
      required: false,
      defaultValue: '',
    },
    {
      name: 'formattedConstraints',
      description: 'Formatted constraints section',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf title for context', required: false, defaultValue: '' },
    {
      name: 'additionalInstructions',
      description: 'Extra instructions',
      required: false,
      defaultValue: '',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Email Template
// ═══════════════════════════════════════════════════════════════════════════

export const emailDefaultTemplate: LeafTemplate = {
  id: 'email_default',
  type: 'email',
  name: 'Email Standard Template',
  description: 'Standard template for emails with greeting, body, and signature',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided knowledge as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Email
- Include appropriate greeting
- Clear and professional body
- Include sign-off
- Be concise but complete`,
  userPrompt: `## Source Knowledge

Use the following knowledge as your source material:
{{formattedKnowledge}}

{{formattedSemanticPoints}}
{{formattedConstraints}}
{{#leafTitle}}
## Context

Title/Purpose: {{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## Additional Instructions

{{additionalInstructions}}
{{/additionalInstructions}}
## Task

Generate the email content based on the above source knowledge and constraints.`,
  variables: [
    {
      name: 'formattedKnowledge',
      description: 'YAML-like formatted knowledge',
      required: true,
    },
    {
      name: 'formattedSemanticPoints',
      description: 'Selected semantic points section',
      required: false,
      defaultValue: '',
    },
    {
      name: 'formattedConstraints',
      description: 'Formatted constraints section',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf title for context', required: false, defaultValue: '' },
    {
      name: 'additionalInstructions',
      description: 'Extra instructions',
      required: false,
      defaultValue: '',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// LinkedIn Template
// ═══════════════════════════════════════════════════════════════════════════

export const linkedinDefaultTemplate: LeafTemplate = {
  id: 'linkedin_default',
  type: 'linkedin',
  name: 'LinkedIn Standard Template',
  description: 'Standard template for professional LinkedIn posts',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided knowledge as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: LinkedIn post
- Professional but conversational tone
- Lead with the main takeaway
- Use short paragraphs for readability
- Include a clear closing insight or question`,
  userPrompt: `## Source Knowledge

Use the following knowledge as your source material:
{{formattedKnowledge}}

{{formattedSemanticPoints}}
{{formattedConstraints}}
{{#leafTitle}}
## Context

Title/Purpose: {{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## Additional Instructions

{{additionalInstructions}}
{{/additionalInstructions}}
## Task

Generate the LinkedIn post based on the above source knowledge and constraints.`,
  variables: [
    {
      name: 'formattedKnowledge',
      description: 'YAML-like formatted knowledge',
      required: true,
    },
    {
      name: 'formattedSemanticPoints',
      description: 'Selected semantic points section',
      required: false,
      defaultValue: '',
    },
    {
      name: 'formattedConstraints',
      description: 'Formatted constraints section',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf title for context', required: false, defaultValue: '' },
    {
      name: 'additionalInstructions',
      description: 'Extra instructions',
      required: false,
      defaultValue: '',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Reddit Template
// ═══════════════════════════════════════════════════════════════════════════

export const redditDefaultTemplate: LeafTemplate = {
  id: 'reddit_default',
  type: 'reddit',
  name: 'Reddit Standard Template',
  description: 'Standard template for Reddit posts designed for community discussion',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided knowledge as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Reddit post
- Use a clear, specific title-style opening
- Add enough context for community discussion
- Avoid marketing language
- End with a concrete question or prompt for replies`,
  userPrompt: `## Source Knowledge

Use the following knowledge as your source material:
{{formattedKnowledge}}

{{formattedSemanticPoints}}
{{formattedConstraints}}
{{#leafTitle}}
## Context

Title/Purpose: {{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## Additional Instructions

{{additionalInstructions}}
{{/additionalInstructions}}
## Task

Generate the Reddit post based on the above source knowledge and constraints.`,
  variables: [
    {
      name: 'formattedKnowledge',
      description: 'YAML-like formatted knowledge',
      required: true,
    },
    {
      name: 'formattedSemanticPoints',
      description: 'Selected semantic points section',
      required: false,
      defaultValue: '',
    },
    {
      name: 'formattedConstraints',
      description: 'Formatted constraints section',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf title for context', required: false, defaultValue: '' },
    {
      name: 'additionalInstructions',
      description: 'Extra instructions',
      required: false,
      defaultValue: '',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Threads Template
// ═══════════════════════════════════════════════════════════════════════════

export const threadsDefaultTemplate: LeafTemplate = {
  id: 'threads_default',
  type: 'threads',
  name: 'Threads Standard Template',
  description: 'Standard template for concise Threads posts',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided knowledge as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Threads post
- Short, conversational, and easy to scan
- Can use a compact multi-line structure
- Avoid heavy formatting
- Keep the tone direct and human`,
  userPrompt: `## Source Knowledge

Use the following knowledge as your source material:
{{formattedKnowledge}}

{{formattedSemanticPoints}}
{{formattedConstraints}}
{{#leafTitle}}
## Context

Title/Purpose: {{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## Additional Instructions

{{additionalInstructions}}
{{/additionalInstructions}}
## Task

Generate the Threads post based on the above source knowledge and constraints.`,
  variables: [
    {
      name: 'formattedKnowledge',
      description: 'YAML-like formatted knowledge',
      required: true,
    },
    {
      name: 'formattedSemanticPoints',
      description: 'Selected semantic points section',
      required: false,
      defaultValue: '',
    },
    {
      name: 'formattedConstraints',
      description: 'Formatted constraints section',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf title for context', required: false, defaultValue: '' },
    {
      name: 'additionalInstructions',
      description: 'Extra instructions',
      required: false,
      defaultValue: '',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Slack Template
// ═══════════════════════════════════════════════════════════════════════════

export const slackDefaultTemplate: LeafTemplate = {
  id: 'slack_default',
  type: 'slack',
  name: 'Slack Standard Template',
  description: 'Standard template for Slack messages with conversational tone',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided knowledge as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Slack message
- Conversational but professional tone
- Can use basic formatting (bold, bullets)
- Be concise and scannable
- Avoid overly formal language`,
  userPrompt: `## Source Knowledge

Use the following knowledge as your source material:
{{formattedKnowledge}}

{{formattedSemanticPoints}}
{{formattedConstraints}}
{{#leafTitle}}
## Context

Title/Purpose: {{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## Additional Instructions

{{additionalInstructions}}
{{/additionalInstructions}}
## Task

Generate the Slack message based on the above source knowledge and constraints.`,
  variables: [
    {
      name: 'formattedKnowledge',
      description: 'YAML-like formatted knowledge',
      required: true,
    },
    {
      name: 'formattedSemanticPoints',
      description: 'Selected semantic points section',
      required: false,
      defaultValue: '',
    },
    {
      name: 'formattedConstraints',
      description: 'Formatted constraints section',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf title for context', required: false, defaultValue: '' },
    {
      name: 'additionalInstructions',
      description: 'Extra instructions',
      required: false,
      defaultValue: '',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Default Templates Registry
// ═══════════════════════════════════════════════════════════════════════════

import type { LeafType } from '../../types';

/**
 * Map of leaf types to their default templates.
 */
export const DEFAULT_TEMPLATES: Record<LeafType, LeafTemplate> = {
  tweet: tweetDefaultTemplate,
  linkedin: linkedinDefaultTemplate,
  reddit: redditDefaultTemplate,
  threads: threadsDefaultTemplate,
  article: articleDefaultTemplate,
  email: emailDefaultTemplate,
  slack: slackDefaultTemplate,
};

/**
 * Get the default template for a leaf type.
 */
export function getDefaultTemplate(leafType: LeafType): LeafTemplate {
  return DEFAULT_TEMPLATES[leafType];
}

/**
 * Get all default templates.
 */
export function getAllDefaultTemplates(): LeafTemplate[] {
  return Object.values(DEFAULT_TEMPLATES);
}
