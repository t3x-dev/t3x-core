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
  name: 'Twitter Standard Template',
  description: 'Standard template for Twitter/X posts with 280 character limit',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided sentences as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Twitter/X post
- Maximum 280 characters
- Be concise and impactful
- Use hashtags sparingly if relevant
- No formal greetings or sign-offs`,
  userPrompt: `## Source Knowledge

Use the following sentences as your source material:
{{formattedSentences}}

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
      name: 'formattedSentences',
      description: 'Numbered list of source sentences',
      required: true,
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
  name: 'Article Standard Template',
  description: 'Standard template for blog posts and articles with sections and headings',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided sentences as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Article/Blog post
- Include a compelling title
- Use clear section headings
- Well-structured paragraphs
- Professional tone
- Include introduction and conclusion`,
  userPrompt: `## Source Knowledge

Use the following sentences as your source material:
{{formattedSentences}}

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
      name: 'formattedSentences',
      description: 'Numbered list of source sentences',
      required: true,
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
1. Use ONLY the provided sentences as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Email
- Include appropriate greeting
- Clear and professional body
- Include sign-off
- Be concise but complete`,
  userPrompt: `## Source Knowledge

Use the following sentences as your source material:
{{formattedSentences}}

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
      name: 'formattedSentences',
      description: 'Numbered list of source sentences',
      required: true,
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
// Weibo Template (微博)
// ═══════════════════════════════════════════════════════════════════════════

export const weiboDefaultTemplate: LeafTemplate = {
  id: 'weibo_default',
  type: 'weibo',
  name: '微博标准模板',
  description: '微博帖子标准模板，支持中文，最多2000字符',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided sentences as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Weibo post (微博)
- Write in Chinese (简体中文)
- Maximum 2000 characters (but shorter is better)
- Can include emojis if appropriate
- Adapt tone for Chinese social media culture`,
  userPrompt: `## 来源知识

请基于以下句子作为素材：
{{formattedSentences}}

{{formattedConstraints}}
{{#leafTitle}}
## 背景

标题/目的：{{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## 附加说明

{{additionalInstructions}}
{{/additionalInstructions}}
## 任务

根据以上来源知识和约束条件，生成微博内容。`,
  variables: [
    { name: 'formattedSentences', description: '编号的来源句子列表', required: true },
    {
      name: 'formattedConstraints',
      description: '格式化的约束部分',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf 标题作为背景', required: false, defaultValue: '' },
    { name: 'additionalInstructions', description: '附加说明', required: false, defaultValue: '' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// WeChat Template (微信)
// ═══════════════════════════════════════════════════════════════════════════

export const wechatDefaultTemplate: LeafTemplate = {
  id: 'wechat_default',
  type: 'wechat',
  name: '微信标准模板',
  description: '微信公众号/消息标准模板，支持中文，专业格式',
  systemPrompt: `You are a content generation assistant. Your task is to create high-quality content based on the provided knowledge and constraints.

Key principles:
1. Use ONLY the provided sentences as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: WeChat article/message (微信)
- Write in Chinese (简体中文)
- Clear and readable formatting
- Appropriate for professional or personal context
- Can be longer form if needed`,
  userPrompt: `## 来源知识

请基于以下句子作为素材：
{{formattedSentences}}

{{formattedConstraints}}
{{#leafTitle}}
## 背景

标题/目的：{{leafTitle}}
{{/leafTitle}}
{{#additionalInstructions}}
## 附加说明

{{additionalInstructions}}
{{/additionalInstructions}}
## 任务

根据以上来源知识和约束条件，生成微信内容。`,
  variables: [
    { name: 'formattedSentences', description: '编号的来源句子列表', required: true },
    {
      name: 'formattedConstraints',
      description: '格式化的约束部分',
      required: false,
      defaultValue: '',
    },
    { name: 'leafTitle', description: 'Leaf 标题作为背景', required: false, defaultValue: '' },
    { name: 'additionalInstructions', description: '附加说明', required: false, defaultValue: '' },
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
1. Use ONLY the provided sentences as your source material
2. Follow ALL constraints exactly - they are non-negotiable
3. Adapt the content to the specified format
4. Maintain accuracy and do not add information not present in the source

Format: Slack message
- Conversational but professional tone
- Can use basic formatting (bold, bullets)
- Be concise and scannable
- Avoid overly formal language`,
  userPrompt: `## Source Knowledge

Use the following sentences as your source material:
{{formattedSentences}}

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
      name: 'formattedSentences',
      description: 'Numbered list of source sentences',
      required: true,
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

import type { LeafType } from '../../types/v4';

/**
 * Map of leaf types to their default templates.
 */
export const DEFAULT_TEMPLATES: Record<LeafType, LeafTemplate> = {
  tweet: tweetDefaultTemplate,
  article: articleDefaultTemplate,
  email: emailDefaultTemplate,
  weibo: weiboDefaultTemplate,
  wechat: wechatDefaultTemplate,
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
