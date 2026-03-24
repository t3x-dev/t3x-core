/**
 * LLM Security Utilities
 *
 * Provides sanitization, escaping, and validation functions
 * to protect against prompt injection and other LLM security risks.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Content Escaping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Escape user-supplied content before embedding in prompts.
 *
 * Wraps content in XML-style delimiters so the LLM treats it as data,
 * not instructions. This is the primary defense against prompt injection.
 */
export function escapePromptContent(content: string, tag: string): string {
  // Replace any occurrence of the closing tag in content to prevent breakout
  const safeContent = content.replace(new RegExp(`</${tag}>`, 'gi'), `</${tag}_escaped>`);
  return `<${tag}>\n${safeContent}\n</${tag}>`;
}

/**
 * Escape a constraint value for safe embedding in prompts.
 * Uses JSON.stringify to handle quotes, newlines, and special chars.
 */
export function escapeConstraintValue(value: string): string {
  return JSON.stringify(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// Chat Message Validation
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum characters allowed per chat message content */
export const MAX_MESSAGE_CONTENT_LENGTH = 128_000;

/** Allowed chat message roles */
const ALLOWED_CHAT_ROLES = new Set(['system', 'user', 'assistant']);

export interface ChatMessageValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a chat message for safety.
 */
export function validateChatMessage(msg: unknown): ChatMessageValidationResult {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: 'Message must be an object' };
  }

  const { role, content } = msg as Record<string, unknown>;

  if (typeof role !== 'string' || !ALLOWED_CHAT_ROLES.has(role)) {
    return {
      valid: false,
      error: `Invalid role: ${String(role)}. Must be system, user, or assistant`,
    };
  }

  if (typeof content !== 'string') {
    return { valid: false, error: 'Message content must be a string' };
  }

  if (content.length === 0) {
    return { valid: false, error: 'Message content must not be empty' };
  }

  if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
    return {
      valid: false,
      error: `Message content exceeds ${MAX_MESSAGE_CONTENT_LENGTH} characters`,
    };
  }

  return { valid: true };
}

/**
 * Validate an array of chat messages. Returns error string or null if valid.
 */
export function validateChatMessages(messages: unknown[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const result = validateChatMessage(messages[i]);
    if (!result.valid) {
      return `messages[${i}]: ${result.error}`;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Message Sanitization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sanitize an error message before returning to client.
 * Strips API keys, response bodies, and internal details.
 */
export function sanitizeErrorForClient(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Map known patterns to safe messages
  if (/rate.limit/i.test(message) || /429/.test(message)) {
    return 'Rate limited. Please try again later.';
  }
  if (/invalid.*api.*key/i.test(message) || /unauthorized/i.test(message) || /401/.test(message)) {
    return 'Provider authentication failed. Check API key configuration.';
  }
  if (/overloaded/i.test(message) || /503/.test(message)) {
    return 'Provider temporarily overloaded. Please try again.';
  }
  if (/timeout/i.test(message) || /abort/i.test(message)) {
    return 'Request timed out. Please try again.';
  }
  if (/ECONNREFUSED|ENOTFOUND|ENETUNREACH/i.test(message)) {
    return 'Could not reach LLM provider. Check network configuration.';
  }

  // Generic fallback — never return raw API responses
  // Check if message looks like it contains raw HTTP response body
  if (message.length > 200 || message.includes('{') || message.includes('<!')) {
    return 'Generation failed. Please try again.';
  }

  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
// Token Estimation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rough token count estimate (~1 token per 4 chars for English).
 * Used for pre-flight checks before sending to LLM.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if combined prompt exceeds a model's context window.
 * Returns the estimated token count and whether it's safe.
 */
export function checkTokenBudget(
  systemPrompt: string,
  userPrompt: string,
  maxContextTokens: number
): { estimatedTokens: number; safe: boolean; overflowBy: number } {
  const estimated = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt);
  const overflowBy = Math.max(0, estimated - maxContextTokens);
  return { estimatedTokens: estimated, safe: overflowBy === 0, overflowBy };
}
