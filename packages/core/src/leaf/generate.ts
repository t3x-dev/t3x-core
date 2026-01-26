/**
 * Leaf Generation Service
 *
 * Calls Claude API to generate leaf output based on commit sentences and constraints.
 *
 * Owner: GEN-* track
 * @see docs/plans/parallel-dev-guidelines.md
 */

import { buildLeafPrompt } from './build-prompt';
import { DEFAULT_MODEL, DEFAULT_TEMPERATURE, type GenerateOptions, type GenerateResult } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Check
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if generation is configured (ANTHROPIC_API_KEY is set).
 */
export function isGenerationConfigured(): boolean {
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

/**
 * Generate leaf output using Claude API.
 *
 * @param options - Generation options containing commit, leaf, and optional parameters
 * @returns Promise resolving to GenerateResult with output, model, usage, and prompt
 * @throws GenerationError if API call fails or API key is not configured
 */
export async function generateLeafOutput(options: GenerateOptions): Promise<GenerateResult> {
  const {
    model = DEFAULT_MODEL,
    temperature = DEFAULT_TEMPERATURE,
    maxTokens = 1024,
  } = options;

  // Check configuration
  if (!isGenerationConfigured()) {
    throw new GenerationError(
      'ANTHROPIC_API_KEY environment variable is not set',
      'NOT_CONFIGURED'
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com';

  // Build prompt
  const { systemPrompt, userPrompt } = buildLeafPrompt(options);

  // Call Anthropic API
  const url = `${baseUrl}/v1/messages`;

  try {
    const response = await fetchWithProxy(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      // Parse error response
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

    // Parse success response
    const data = JSON.parse(responseText) as AnthropicMessage;

    // Extract text from response
    const textContent = data.content.find((c) => c.type === 'text');
    if (!textContent) {
      throw new GenerationError('No text content in response', 'EMPTY_RESPONSE');
    }

    return {
      output: textContent.text,
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
      prompt: {
        system: systemPrompt,
        user: userPrompt,
      },
    };
  } catch (error) {
    if (error instanceof GenerationError) {
      throw error;
    }

    // Handle network errors, timeouts, etc.
    const message = error instanceof Error ? error.message : String(error);
    throw new GenerationError(
      `Request failed: ${message}`,
      'NETWORK_ERROR',
      undefined,
      error
    );
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
