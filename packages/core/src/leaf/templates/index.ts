/**
 * Leaf Templates Module
 *
 * Provides default templates for all leaf types.
 * Templates define the structure of LLM prompts with variable placeholders.
 *
 * Usage:
 * ```typescript
 * import { getDefaultTemplate, DEFAULT_TEMPLATES } from './templates';
 *
 * const template = getDefaultTemplate('tweet');
 * ```
 */

export {
  articleDefaultTemplate,
  // Registry and helpers
  DEFAULT_TEMPLATES,
  emailDefaultTemplate,
  getAllDefaultTemplates,
  getDefaultTemplate,
  linkedinDefaultTemplate,
  redditDefaultTemplate,
  slackDefaultTemplate,
  threadsDefaultTemplate,
  // Individual templates
  tweetDefaultTemplate,
} from './defaults';
