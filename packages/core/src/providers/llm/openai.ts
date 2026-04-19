/**
 * OpenAI LLM Provider
 *
 * Implementation of LLMProvider using OpenAI's Responses API.
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
 * Fetch with proxy support
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

export interface OpenAIProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gpt-5.4-mini';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  private buildInputFromPrompt(prompt: LLMPrompt): Array<{
    role: 'system' | 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
  }> {
    const input: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string | Array<Record<string, unknown>>;
    }> = [];

    if (prompt.system) {
      input.push({ role: 'system', content: prompt.system });
    }

    for (const message of prompt.messages) {
      if (typeof message.content === 'string') {
        input.push({ role: message.role, content: message.content });
        continue;
      }

      input.push({
        role: message.role,
        content: message.content.map((block) => {
          if (block.type === 'text') {
            return {
              type: 'input_text',
              text: typeof block.text === 'string' ? block.text : '',
            };
          }

          const source = block.source as { media_type?: string; data?: string } | undefined;

          return {
            type: 'input_image',
            image_url: `data:${source?.media_type ?? 'image/png'};base64,${source?.data ?? ''}`,
          };
        }),
      });
    }

    return input;
  }

  private extractOutputText(data: {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  }): string {
    if (typeof data.output_text === 'string' && data.output_text.length > 0) {
      return data.output_text;
    }

    const parts =
      data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
        .map((part) => part.text as string) ?? [];

    return parts.join('');
  }

  async generate(prompt: string, options?: LLMBasicGenerateOptions): Promise<LLMGenerateResult> {
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 2048;
    const url = `${this.baseUrl}/responses`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_output_tokens: maxTokens,
          temperature,
          input: [{ role: 'user', content: prompt }],
          ...(options?.stopSequences && { stop: options.stopSequences }),
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
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text = this.extractOutputText(data);
      if (!text) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      return {
        text,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LLMProviderError) throw error;
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
    const url = `${this.baseUrl}/responses`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          max_output_tokens: maxTokens,
          temperature,
          input: this.buildInputFromPrompt(prompt),
          ...(options.stopSequences && { stop: options.stopSequences }),
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
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const text = this.extractOutputText(data);
      if (!text) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      return {
        text,
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LLMProviderError) throw error;
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
    const jsonSchema = zodToJsonSchema(schema);
    const url = `${this.baseUrl}/responses`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          max_output_tokens: maxTokens,
          temperature,
          input: this.buildInputFromPrompt(prompt),
          text: {
            type: 'json_schema',
            format: {
              type: 'json_schema',
              name: 'extract_data',
              schema: jsonSchema,
              strict: true,
            },
          },
          ...(options.stopSequences && { stop: options.stopSequences }),
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
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const usage = {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };

      const content = this.extractOutputText(data);
      if (!content) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      try {
        const jsonData = JSON.parse(content);
        const parsed = schema.parse(jsonData);
        return { data: parsed, usage };
      } catch {
        throw new LLMProviderError(
          this.id,
          undefined,
          'Failed to parse structured response as JSON'
        );
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LLMProviderError) throw error;
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

export function createOpenAIProvider(config: OpenAIProviderConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}
