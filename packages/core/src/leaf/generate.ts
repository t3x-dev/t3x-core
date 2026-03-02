/**
 * Leaf Generation Service
 *
 * Generates leaf output using an LLM provider. Supports pluggable providers
 * via the `provider` option, with fallback to direct Anthropic API calls.
 *
 * Owner: GEN-* track
 * @see docs/plans/parallel-dev-guidelines.md
 */

import type { LLMProvider } from '../llm/types';
import { buildLeafPrompt } from './build-prompt';
import { buildCorrectivePrompt } from './corrective-prompt';
import {
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  type GenerateOptions,
  type GenerateResult,
} from './types';
import { validateConstraintsExactOnly } from './validate-constraints';

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Check
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if generation is configured.
 * Returns true if an LLM provider is available or ANTHROPIC_API_KEY is set.
 */
export function isGenerationConfigured(provider?: LLMProvider): boolean {
  if (provider) return true;
  return typeof process !== 'undefined' && !!process.env?.ANTHROPIC_API_KEY;
}

// ═══════════════════════════════════════════════════════════════════════════
// Proxy Support
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get proxy URL from environment variables
 */
function getProxyUrl(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

/**
 * Fetch with proxy support - uses undici when proxy is configured
 */
async function fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    const { ProxyAgent, fetch: undiciFetch } = await import('undici');
    const response = await undiciFetch(url, {
      ...options,
      dispatcher: new ProxyAgent(proxyUrl),
    } as Parameters<typeof undiciFetch>[1]);
    return response as unknown as Response;
  }
  return fetch(url, options);
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error thrown when generation fails.
 */
export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Anthropic API Response Types
// ═══════════════════════════════════════════════════════════════════════════

interface AnthropicMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicError {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Generation Function
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum number of generation attempts when constraints fail */
const MAX_GENERATION_ATTEMPTS = 3;

/**
 * Generate leaf output using Claude API with automatic constraint validation.
 *
 * When constraints exist, the generated output is automatically validated.
 * If validation fails, the function retries generation with feedback about
 * which constraints failed, up to MAX_GENERATION_ATTEMPTS times.
 *
 * @param options - Generation options containing commit, leaf, and optional parameters
 * @returns Promise resolving to GenerateResult with output, model, usage, validation, and attempts
 * @throws GenerationError if API call fails or API key is not configured
 */
export async function generateLeafOutput(options: GenerateOptions): Promise<GenerateResult> {
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = 1024,
    provider,
  } = options;

  // Check configuration
  if (!isGenerationConfigured(provider)) {
    throw new GenerationError(
      'No LLM provider configured and ANTHROPIC_API_KEY is not set',
      'NOT_CONFIGURED'
    );
  }

  // Build initial prompt
  const { systemPrompt, userPrompt } = buildLeafPrompt(options);

  const constraints = options.leaf.constraints;
  const hasConstraints = constraints && constraints.length > 0;
  const maxAttempts = hasConstraints ? MAX_GENERATION_ATTEMPTS : 1;

  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let lastOutput = '';
  let lastModel = model;

  // Choose generation path: pluggable provider or legacy Anthropic direct call
  const useProvider = !!provider;

  // For provider path, we accumulate prompts as a single string
  let providerPrompt = `${systemPrompt}\n\n${userPrompt}`;

  // For legacy Anthropic path, use message history for multi-turn retry
  const apiKey = !useProvider ? process.env.ANTHROPIC_API_KEY! : '';
  const baseUrl = !useProvider
    ? (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com')
    : '';
  const url = !useProvider ? `${baseUrl}/v1/messages` : '';
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: userPrompt },
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (useProvider) {
      // Provider path — use LLMProvider.generate()
      try {
        lastOutput = await provider.generate(providerPrompt, {
          temperature,
          maxTokens,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new GenerationError(
          `Provider generation failed: ${message}`,
          'API_ERROR',
          undefined,
          error
        );
      }
    } else {
      // Legacy Anthropic direct path
      const result = await callAnthropicAPI({
        url,
        apiKey,
        model,
        maxTokens,
        temperature,
        systemPrompt,
        messages,
      });

      lastOutput = result.text;
      lastModel = result.model;
      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;
    }

    // If no constraints, return immediately
    if (!hasConstraints) {
      return {
        output: lastOutput,
        model: lastModel,
        usage: totalUsage,
        prompt: { system: systemPrompt, user: userPrompt },
        attempts: attempt,
      };
    }

    // Validate output against constraints
    const validation = validateConstraintsExactOnly(lastOutput, constraints);

    if (validation.allPassed) {
      return {
        output: lastOutput,
        model: lastModel,
        usage: totalUsage,
        prompt: { system: systemPrompt, user: userPrompt },
        validation: {
          allPassed: true,
          passedCount: validation.passedCount,
          failedCount: 0,
          assertions: validation.assertions,
        },
        attempts: attempt,
      };
    }

    // Last attempt — return with failed validation
    if (attempt === maxAttempts) {
      return {
        output: lastOutput,
        model: lastModel,
        usage: totalUsage,
        prompt: { system: systemPrompt, user: userPrompt },
        validation: {
          allPassed: false,
          passedCount: validation.passedCount,
          failedCount: validation.failedCount,
          assertions: validation.assertions,
        },
        attempts: attempt,
      };
    }

    // Build corrective feedback with detailed failure analysis
    const failedAssertions = validation.assertions.filter((a) => !a.passed);
    const feedbackMessage = buildCorrectivePrompt({
      output: lastOutput,
      failedAssertions,
      constraints,
      attempt,
    });

    if (useProvider) {
      // Provider path — append feedback to the prompt
      providerPrompt += `\n\nAssistant: ${lastOutput}\n\nUser: ${feedbackMessage}`;
    } else {
      // Legacy path — add to message history
      messages.push({ role: 'assistant', content: lastOutput });
      messages.push({ role: 'user', content: feedbackMessage });
    }
  }

  // Should not reach here, but TypeScript needs it
  return {
    output: lastOutput,
    model: lastModel,
    usage: totalUsage,
    prompt: { system: systemPrompt, user: userPrompt },
    attempts: maxAttempts,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Anthropic API Call (extracted helper)
// ═══════════════════════════════════════════════════════════════════════════

interface CallAPIOptions {
  url: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface CallAPIResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Make a single Anthropic API call and return the text response.
 */
async function callAnthropicAPI(options: CallAPIOptions): Promise<CallAPIResult> {
  try {
    const response = await fetchWithProxy(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        system: options.systemPrompt,
        messages: options.messages,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = `API request failed: ${response.status}`;
      let errorCode = 'API_ERROR';

      try {
        const errorData = JSON.parse(responseText) as AnthropicError;
        if (errorData.error) {
          errorMessage = errorData.error.message;
          errorCode = mapErrorType(errorData.error.type, response.status);
        }
      } catch {
        errorMessage = responseText || errorMessage;
      }

      throw new GenerationError(errorMessage, errorCode, response.status);
    }

    const data = JSON.parse(responseText) as AnthropicMessage;
    const textContent = data.content.find((c) => c.type === 'text');
    if (!textContent) {
      throw new GenerationError('No text content in response', 'EMPTY_RESPONSE');
    }

    return {
      text: textContent.text,
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  } catch (error) {
    if (error instanceof GenerationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new GenerationError(`Request failed: ${message}`, 'NETWORK_ERROR', undefined, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map Anthropic error types to our error codes.
 */
function mapErrorType(anthropicType: string, statusCode: number): string {
  switch (anthropicType) {
    case 'rate_limit_error':
      return 'RATE_LIMIT';
    case 'overloaded_error':
      return 'OVERLOADED';
    case 'invalid_request_error':
      return 'INVALID_REQUEST';
    case 'authentication_error':
      return 'AUTH_ERROR';
    case 'permission_error':
      return 'PERMISSION_ERROR';
    case 'not_found_error':
      return 'NOT_FOUND';
    default:
      if (statusCode === 429) return 'RATE_LIMIT';
      if (statusCode === 401) return 'AUTH_ERROR';
      if (statusCode === 403) return 'PERMISSION_ERROR';
      if (statusCode >= 500) return 'SERVER_ERROR';
      return 'API_ERROR';
  }
}
