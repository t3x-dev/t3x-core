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
import { normalizeGeminiStructuredData, toGeminiStructuredSchema } from './structuredSchema';

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

interface GeminiResponseShape {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

/**
 * Pull the visible text out of a Gemini response.
 *
 * Gemini 2.5+ responses can include "thought" parts (when thinking is enabled)
 * AND visible-output parts in the same `parts` array. The `thought: true`
 * flag distinguishes them. Older code grabbed `parts[0].text`, which silently
 * picked up a thought summary (or nothing) on Pro models and produced a
 * misleading "No content in response" error.
 *
 * Concatenate every non-thought part's `text` so we surface the actual model
 * output regardless of where it lands in the array.
 */
function extractGeminiText(data: GeminiResponseShape): string | null {
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  const visible = parts
    .filter((p) => p.thought !== true && typeof p.text === 'string' && p.text.length > 0)
    .map((p) => p.text as string)
    .join('');
  return visible.length > 0 ? visible : null;
}

/**
 * Build a diagnostic error message when Gemini returns 200 OK but no
 * extractable text. Includes finishReason / safety block reason so the
 * UI ("Test connection") can show *why* instead of just "No content".
 */
function formatGeminiNoContentError(data: GeminiResponseShape, rawResponse: string): string {
  const finishReason = data.candidates?.[0]?.finishReason;
  const blockReason = data.promptFeedback?.blockReason;
  const partKinds = data.candidates?.[0]?.content?.parts?.map((p) =>
    p.thought ? 'thought' : 'text'
  );

  const hints: string[] = [];
  if (finishReason) hints.push(`finishReason=${finishReason}`);
  if (blockReason) hints.push(`blockReason=${blockReason}`);
  if (partKinds && partKinds.length > 0) hints.push(`parts=[${partKinds.join(',')}]`);
  if (hints.length === 0) {
    // Fall back to a short slice of the raw body so the user has *some* signal.
    hints.push(`raw=${rawResponse.slice(0, 200)}`);
  }
  return `No content in response (${hints.join(' · ')})`;
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'google-ai';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'gemini-2.5-pro';
    this.baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  private buildThinkingConfig(model: string): Record<string, unknown> | undefined {
    if (model.includes('flash-lite') || model.includes('flash-preview')) {
      return { thinkingBudget: 0 };
    }

    // Pro models default to a large implicit thinking budget that can exhaust
    // maxOutputTokens before producing any content (observed on gemini-2.5-pro
    // via `No content in response`). Cap it explicitly so the model always has
    // room for output.
    if (model.includes('pro')) {
      return { thinkingBudget: 256 };
    }

    return undefined;
  }

  async generate(prompt: string, options?: LLMBasicGenerateOptions): Promise<LLMGenerateResult> {
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 2048;
    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const thinkingConfig = this.buildThinkingConfig(this.model);

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
            ...(thinkingConfig && { thinkingConfig }),
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
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          finishReason?: string;
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        promptFeedback?: { blockReason?: string };
      };

      const text = extractGeminiText(data);
      if (!text) {
        throw new LLMProviderError(
          this.id,
          undefined,
          formatGeminiNoContentError(data, responseText)
        );
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
    const thinkingConfig = this.buildThinkingConfig(model);

    const contents = prompt.messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }],
    }));

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(thinkingConfig && { thinkingConfig }),
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
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          finishReason?: string;
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        promptFeedback?: { blockReason?: string };
      };

      const text = extractGeminiText(data);
      if (!text) {
        throw new LLMProviderError(
          this.id,
          undefined,
          formatGeminiNoContentError(data, responseText)
        );
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
    const jsonSchema = toGeminiStructuredSchema(schema);
    const thinkingConfig = this.buildThinkingConfig(model);
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
        ...(thinkingConfig && { thinkingConfig }),
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
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
          finishReason?: string;
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        promptFeedback?: { blockReason?: string };
      };

      const usage = {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      };

      const content = extractGeminiText(data);
      if (!content) {
        throw new LLMProviderError(
          this.id,
          undefined,
          formatGeminiNoContentError(data, responseText)
        );
      }

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(content);
      } catch {
        throw new LLMProviderError(this.id, undefined, 'Failed to parse response as JSON');
      }
      try {
        const parsed = schema.parse(normalizeGeminiStructuredData(jsonData));
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
