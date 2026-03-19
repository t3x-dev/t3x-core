/**
 * Claude LLM Provider
 *
 * Implementation of LLMProvider using Anthropic's Claude API.
 */

import type { ZodType } from 'zod';
import {
  type LLMBasicGenerateOptions,
  type LLMGenerateOptions,
  type LLMGenerateResult,
  type LLMPrompt,
  type LLMProvider,
  LLMProviderError,
  type LLMResult,
  type StructuredResult,
} from '../../llm/types';
import { zodToJsonSchema } from '../../llm/zodToJsonSchema';

/**
 * Check if a URL's host is in the NO_PROXY list.
 */
function isNoProxy(url: string): boolean {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  if (!noProxy) return false;
  if (noProxy === '*') return true;
  try {
    const host = new URL(url).hostname;
    return noProxy.split(',').some((p) => host.endsWith(p.trim()));
  } catch {
    return false;
  }
}

/**
 * Get proxy URL from environment variables
 */
function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy
  );
}

/**
 * Fetch with proxy support - uses undici when proxy is configured.
 * Respects NO_PROXY env var: uses undici.Agent (direct) for bypassed hosts.
 */
async function fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    try {
      const { Agent, ProxyAgent, fetch: undiciFetch } = await import('undici');
      // Use direct Agent for NO_PROXY hosts, ProxyAgent otherwise
      const dispatcher = isNoProxy(url) ? new Agent() : new ProxyAgent(proxyUrl);
      const response = await undiciFetch(url, {
        ...options,
        dispatcher,
      } as Parameters<typeof undiciFetch>[1]);
      return response as unknown as Response;
    } catch {
      return fetch(url, options);
    }
  }
  return fetch(url, options);
}

/**
 * Claude provider configuration
 */
export interface ClaudeProviderConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Base URL (default: https://api.anthropic.com) */
  baseUrl?: string;
}

/**
 * Claude LLM Provider
 */
export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: ClaudeProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
  }

  async generate(prompt: string, options?: LLMBasicGenerateOptions): Promise<LLMGenerateResult> {
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 2048;

    const url = `${this.baseUrl}/v1/messages`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          ...(options?.stopSequences && { stop_sequences: options.stopSequences }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseText = await response.text();

      if (!response.ok) {
        throw new LLMProviderError(
          this.id,
          response.status,
          `API request failed: ${response.status} ${responseText}`
        );
      }

      const data = JSON.parse(responseText) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      // Extract text from response
      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent) {
        throw new LLMProviderError(this.id, undefined, 'No text content in response');
      }

      return {
        text: textContent.text,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LLMProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMProviderError(this.id, undefined, 'Request timeout after 60000ms');
      }
      throw new LLMProviderError(
        this.id,
        undefined,
        `Request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async generateFromPrompt(prompt: LLMPrompt, options: LLMGenerateOptions): Promise<LLMResult> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 2048;

    const url = `${this.baseUrl}/v1/messages`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: maxTokens,
          temperature,
          ...(prompt.system && { system: prompt.system }),
          messages: prompt.messages,
          ...(options.stopSequences && { stop_sequences: options.stopSequences }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseText = await response.text();

      if (!response.ok) {
        throw new LLMProviderError(
          this.id,
          response.status,
          `API request failed: ${response.status} ${responseText}`
        );
      }

      const data = JSON.parse(responseText) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent) {
        throw new LLMProviderError(this.id, undefined, 'No text content in response');
      }

      return {
        text: textContent.text,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LLMProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMProviderError(this.id, undefined, 'Request timeout after 60000ms');
      }
      throw new LLMProviderError(
        this.id,
        undefined,
        `Request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async generateStructured<T>(
    prompt: LLMPrompt,
    schema: ZodType<T>,
    options: LLMGenerateOptions
  ): Promise<StructuredResult<T>> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 2048;
    const toolName = 'extract_data';
    const jsonSchema = zodToJsonSchema(schema);

    const url = `${this.baseUrl}/v1/messages`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: maxTokens,
          temperature,
          ...(prompt.system && { system: prompt.system }),
          messages: prompt.messages,
          tools: [
            {
              name: toolName,
              description: 'Extract structured data',
              input_schema: jsonSchema,
            },
          ],
          tool_choice: { type: 'tool', name: toolName },
          ...(options.stopSequences && { stop_sequences: options.stopSequences }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseText = await response.text();

      if (!response.ok) {
        throw new LLMProviderError(
          this.id,
          response.status,
          `API request failed: ${response.status} ${responseText}`
        );
      }

      const data = JSON.parse(responseText) as {
        content: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const usage = {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };

      // Try to find tool_use block first
      const toolUseBlock = data.content.find((c) => c.type === 'tool_use' && c.name === toolName);
      if (toolUseBlock?.input !== undefined) {
        const parsed = schema.parse(toolUseBlock.input);
        return { data: parsed, usage };
      }

      // Fallback: try text block with JSON
      const textBlock = data.content.find((c) => c.type === 'text' && c.text);
      if (textBlock?.text) {
        try {
          const jsonData = JSON.parse(textBlock.text);
          const parsed = schema.parse(jsonData);
          return { data: parsed, usage };
        } catch {
          // fall through to error
        }
      }

      throw new LLMProviderError(this.id, undefined, 'No structured data found in response');
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LLMProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMProviderError(this.id, undefined, 'Request timeout after 60000ms');
      }
      throw new LLMProviderError(
        this.id,
        undefined,
        `Request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async resolveConflict(
    baseText: string | null,
    sourceText: string | null,
    targetText: string | null,
    context?: string
  ): Promise<LLMGenerateResult> {
    const prompt = `You are a merge conflict resolver. Given three versions of text (base, source, and target), produce a merged result that preserves the intent of both changes.

## Base Version (Common Ancestor)
${baseText ?? '(deleted)'}

## Source Version (Branch A)
${sourceText ?? '(deleted)'}

## Target Version (Branch B)
${targetText ?? '(deleted)'}

${context ? `## Additional Context\n${context}\n` : ''}

## Instructions
1. Analyze what changed in each branch relative to base
2. Combine both changes if they don't conflict semantically
3. If they conflict semantically, prefer the more specific/detailed version
4. Output ONLY the resolved text, no explanations

## Resolved Text`;

    return this.generate(prompt, { temperature: 0.2, maxTokens: 1024 });
  }
}

/**
 * Create a Claude provider
 */
export function createClaudeProvider(config: ClaudeProviderConfig): ClaudeProvider {
  return new ClaudeProvider(config);
}
