/**
 * LLM Provider Types
 *
 * Interfaces for LLM providers used in draft generation and conflict resolution.
 */

/**
 * LLM generation options (basic, without model selection)
 */
export interface LLMBasicGenerateOptions {
  /** Temperature (0-1, default: 0.3) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * Result of an LLM generation call, including token usage.
 */
export interface LLMGenerateResult {
  /** Generated text */
  text: string;
  /** Token usage from the API response */
  usage: { inputTokens: number; outputTokens: number };
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
  generate(prompt: string, options?: LLMBasicGenerateOptions): Promise<LLMGenerateResult>;

  /**
   * Resolve a merge conflict using LLM
   *
   * @param baseText - Common ancestor text
   * @param sourceText - Source branch text
   * @param targetText - Target branch text
   * @param context - Additional context
   * @returns Resolved text with token usage
   */
  resolveConflict(
    baseText: string | null,
    sourceText: string | null,
    targetText: string | null,
    context?: string
  ): Promise<LLMGenerateResult>;

  /** Generate text from a structured prompt (system + messages). Optional. */
  generateFromPrompt?(prompt: LLMPrompt, options: LLMGenerateOptions): Promise<LLMResult>;

  /** Generate structured output using provider-native mechanisms. Optional. */
  generateStructured?<T>(
    prompt: LLMPrompt,
    schema: import('zod').ZodType<T>,
    options: LLMGenerateOptions
  ): Promise<StructuredResult<T>>;

  /** Generate with tool definitions, allowing multiple tool calls per response. Optional. */
  generateWithTools?(
    prompt: LLMPrompt,
    tools: ToolDefinition[],
    options: LLMGenerateOptions
  ): Promise<ToolUseResult>;
}

/**
 * Derive an error code from an HTTP status code.
 */
function deriveCode(statusCode: number | undefined): string {
  if (statusCode === undefined) return 'NETWORK_ERROR';
  if (statusCode === 429) return 'RATE_LIMIT';
  if (statusCode === 503) return 'OVERLOADED';
  if (statusCode === 401 || statusCode === 403) return 'AUTH_ERROR';
  if (statusCode >= 500) return 'SERVER_ERROR';
  return 'API_ERROR';
}

// ── Extended Types for Structured Output ──

export type ProviderName = 'anthropic' | 'openai' | 'google';
export type Capability = 'tool_use' | 'function_calling' | 'structured_output';

export interface ModelInfo {
  id: string;
  label: string;
  provider: ProviderName;
  capabilities: Capability[];
  maxOutputTokens: number;
}

export interface LLMPrompt {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface LLMGenerateOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface StructuredResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

// ── Tool-Use Types ──

/** A tool definition for LLM function calling */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** A single tool call returned by the LLM */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** Result of a generateWithTools call */
export interface ToolUseResult {
  tool_calls: ToolCall[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: { inputTokens: number; outputTokens: number };
}

// ── Debug / Observability ──

/** Log entry for a single LLM call (debug/observability) */
export interface LLMCallLog {
  agent: string;
  prompt: string;
  response: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
}

/** Callback for logging LLM calls */
export type LLMCallLogger = (log: LLMCallLog) => void;

/**
 * LLM Provider error
 */
export class LLMProviderError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly statusCode: number | undefined,
    message: string,
    public readonly code: string = deriveCode(statusCode)
  ) {
    super(`[${providerId}] ${message}`);
    this.name = 'LLMProviderError';
  }
}
