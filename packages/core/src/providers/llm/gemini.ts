/**
 * Gemini LLM Provider
 *
 * Implementation of LLMProvider using Google's Gemini API (generativelanguage.googleapis.com).
 * Shares GOOGLE_AI_STUDIO_KEY with the Google AI Embedding provider.
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

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'google-ai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gemini-3-flash-preview';
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async generate(prompt: string, options?: LLMBasicGenerateOptions): Promise<LLMGenerateResult> {
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 2048;
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            ...(options?.stopSequences && { stopSequences: options.stopSequences }),
          },
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
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      return {
        text,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
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
    const model = options.model ?? this.model;
    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const contents = prompt.messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }],
    }));

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(options.stopSequences && { stopSequences: options.stopSequences }),
      },
    };

    if (prompt.system) {
      requestBody.systemInstruction = { parts: [{ text: prompt.system }] };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(requestBody),
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
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      return {
        text,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
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
    const model = options.model ?? this.model;
    const jsonSchema = zodToJsonSchema(schema);
    const url = `${this.baseUrl}/models/${model}:generateContent`;

    const contents = prompt.messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }],
    }));

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        responseSchema: jsonSchema,
        responseMimeType: 'application/json',
        ...(options.stopSequences && { stopSequences: options.stopSequences }),
      },
    };

    if (prompt.system) {
      requestBody.systemInstruction = { parts: [{ text: prompt.system }] };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(requestBody),
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
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const usage = {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(content);
      } catch {
        throw new LLMProviderError(this.id, undefined, 'Failed to parse response as JSON');
      }
      try {
        const parsed = schema.parse(jsonData);
        return { data: parsed, usage };
      } catch {
        throw new LLMProviderError(
          this.id,
          undefined,
          'Response JSON does not match expected schema'
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

export function createGeminiProvider(config: GeminiProviderConfig): GeminiProvider {
  return new GeminiProvider(config);
}
