/**
 * LLM Provider Types
 *
 * Interfaces for LLM providers used in draft generation and conflict resolution.
 */

/**
 * LLM generation options
 */
export interface LLMGenerateOptions {
  /** Temperature (0-1, default: 0.3) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * LLM Provider interface
 *
 * Implemented by Claude, OpenAI, etc.
 */
export interface LLMProvider {
  /** Provider ID (e.g., "claude", "openai") */
  readonly id: string;

  /**
   * Generate text from a prompt
   *
   * @param prompt - The prompt to send
   * @param options - Generation options
   * @returns Generated text
   */
  generate(prompt: string, options?: LLMGenerateOptions): Promise<string>;

  /**
   * Resolve a merge conflict using LLM
   *
   * @param baseText - Common ancestor text
   * @param sourceText - Source branch text
   * @param targetText - Target branch text
   * @param context - Additional context
   * @returns Resolved text
   */
  resolveConflict(
    baseText: string | null,
    sourceText: string | null,
    targetText: string | null,
    context?: string
  ): Promise<string>;
}

/**
 * LLM Provider error
 */
export class LLMProviderError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly statusCode: number | undefined,
    message: string
  ) {
    super(`[${providerId}] ${message}`);
    this.name = "LLMProviderError";
  }
}
