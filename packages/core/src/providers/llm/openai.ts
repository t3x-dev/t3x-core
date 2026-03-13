/**
 * OpenAI LLM Provider
 *
 * Implementation of LLMProvider using OpenAI's Chat Completions API.
 */

import type { ZodType } from 'zod';
import {
  type LLMGenerateOptions,
  type LLMGenerateOptionsV2,
  type LLMGenerateResult,
  type LLMPrompt,
  type LLMProvider,
  type LLMResult,
  LLMProviderError,
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
    this.model = config.model ?? 'gpt-4o';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async generate(prompt: string, options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 2048;
    const url = `${this.baseUrl}/chat/completions`;

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
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }],
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
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      if (!data.choices?.[0]?.message?.content) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      return {
        text: data.choices[0].message.content,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
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

  async generateFromPrompt(prompt: LLMPrompt, options: LLMGenerateOptionsV2): Promise<LLMResult> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 2048;
    const url = `${this.baseUrl}/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (prompt.system) {
      messages.push({ role: 'system', content: prompt.system });
    }
    for (const msg of prompt.messages) {
      messages.push(msg);
    }

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
          max_tokens: maxTokens,
          temperature,
          messages,
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
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      if (!data.choices?.[0]?.message?.content) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      return {
        text: data.choices[0].message.content,
        usage: {
          inputTokens: data.usage?.prompt_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
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
    options: LLMGenerateOptionsV2
  ): Promise<StructuredResult<T>> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 2048;
    const jsonSchema = zodToJsonSchema(schema);
    const url = `${this.baseUrl}/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (prompt.system) {
      messages.push({ role: 'system', content: prompt.system });
    }
    for (const msg of prompt.messages) {
      messages.push(msg);
    }

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
          max_tokens: maxTokens,
          temperature,
          messages,
          response_format: {
            type: 'json_schema',
            json_schema: {
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
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const usage = {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };

      const content = data.choices?.[0]?.message?.content;
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
