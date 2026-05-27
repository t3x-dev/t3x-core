/**
 * OpenAI LLM Provider
 *
 * Implementation of LLMProvider using OpenAI's Chat Completions API.
 */

import type { ZodType } from 'zod';
import { buildOpenAIChatCompletionBody } from '../../extractors/v2/providerAdapters';
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
import { extractJsonBlock } from './jsonExtract';
import { tryParseWithRepair } from './jsonRepair';
import { toOpenAIStructuredSchema } from './structuredSchema';

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
    this.model = config.model ?? 'gpt-5.4';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  async generate(prompt: string, options?: LLMBasicGenerateOptions): Promise<LLMGenerateResult> {
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
        body: JSON.stringify(
          buildOpenAIChatCompletionBody({
            model: this.model,
            maxTokens,
            temperature,
            messages: [{ role: 'user', content: prompt }],
            stop: options?.stopSequences,
          })
        ),
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

  async generateFromPrompt(prompt: LLMPrompt, options: LLMGenerateOptions): Promise<LLMResult> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 2048;
    const url = `${this.baseUrl}/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (prompt.system) {
      messages.push({ role: 'system', content: prompt.system });
    }
    for (const msg of prompt.messages) {
      messages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
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
        body: JSON.stringify(
          buildOpenAIChatCompletionBody({
            model: options.model,
            maxTokens,
            temperature,
            messages,
            stop: options.stopSequences,
          })
        ),
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
    options: LLMGenerateOptions
  ): Promise<StructuredResult<T>> {
    try {
      return await this.generateStructuredViaResponseFormat(prompt, schema, options);
    } catch (error) {
      // Deterministic fallback, mirrors the Claude adapter's F5 behavior.
      // OpenAI's json_schema response_format occasionally returns non-JSON
      // content (observed on gpt-5.4 × product-design, stability run).
      // Retry via generateFromPrompt + extractJsonBlock so a plain-text JSON
      // response still validates. No prompt change — the prompt already
      // instructs the model to return JSON only.
      if (
        error instanceof LLMProviderError &&
        (error.message.endsWith('Failed to parse structured response as JSON') ||
          error.message.endsWith('No content in response'))
      ) {
        return this.generateStructuredViaText(prompt, schema, options);
      }
      throw error;
    }
  }

  private async generateStructuredViaResponseFormat<T>(
    prompt: LLMPrompt,
    schema: ZodType<T>,
    options: LLMGenerateOptions
  ): Promise<StructuredResult<T>> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 2048;
    const jsonSchema = toOpenAIStructuredSchema(schema);
    const url = `${this.baseUrl}/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (prompt.system) {
      messages.push({ role: 'system', content: prompt.system });
    }
    for (const msg of prompt.messages) {
      messages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
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
        body: JSON.stringify(
          buildOpenAIChatCompletionBody({
            model: options.model,
            maxTokens,
            temperature,
            messages,
            stop: options.stopSequences,
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'extract_data',
                schema: jsonSchema,
                strict: true,
              },
            },
          })
        ),
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
        choices: Array<{ message: { content: string | null; refusal?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const usage = {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };

      // F14: refusal is a first-class signal from OpenAI's structured-output
      // API — the model declined to produce structured output (safety,
      // policy, ambiguity). Surface it with a dedicated `REFUSAL` code so
      // the resilient contract can show the refusal text to the user
      // instead of a generic "extraction failed" diagnostic. Also bail out
      // of the plain-text fallback — retrying the same prompt won't help.
      const refusal = data.choices?.[0]?.message?.refusal;
      if (typeof refusal === 'string' && refusal.length > 0) {
        throw new LLMProviderError(
          this.id,
          undefined,
          `Model refused to produce structured output: ${refusal}`,
          'REFUSAL',
          { refusalText: refusal, rawText: responseText }
        );
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new LLMProviderError(this.id, undefined, 'No content in response');
      }

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(content);
      } catch {
        throw new LLMProviderError(
          this.id,
          undefined,
          'Failed to parse structured response as JSON',
          'JSON_PARSE',
          { jsonText: content, rawText: content }
        );
      }

      const parsed = schema.safeParse(jsonData);
      if (parsed.success) {
        return { data: parsed.data, usage };
      }

      throw new LLMProviderError(
        this.id,
        undefined,
        'Response JSON does not match expected schema',
        'SCHEMA_MISMATCH',
        { jsonText: content, rawText: content, issues: parsed.error.issues }
      );
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

  private async generateStructuredViaText<T>(
    prompt: LLMPrompt,
    schema: ZodType<T>,
    options: LLMGenerateOptions
  ): Promise<StructuredResult<T>> {
    const result = await this.generateFromPrompt(prompt, options);
    const jsonText = extractJsonBlock(result.text);
    if (!jsonText) {
      throw new LLMProviderError(
        this.id,
        undefined,
        'Failed to parse structured response as JSON',
        'JSON_PARSE',
        { rawText: result.text }
      );
    }
    // F12: JSON.parse + deterministic repairs (strip comments, close
    // brackets, strip trailing commas).
    const repaired = tryParseWithRepair(jsonText);
    if (!repaired.ok) {
      throw new LLMProviderError(
        this.id,
        undefined,
        'Failed to parse structured response as JSON',
        'JSON_PARSE',
        { jsonText, rawText: result.text }
      );
    }

    const parsed = schema.safeParse(repaired.value);
    if (parsed.success) {
      return { data: parsed.data, usage: result.usage };
    }

    throw new LLMProviderError(
      this.id,
      undefined,
      'Response JSON does not match expected schema',
      'SCHEMA_MISMATCH',
      { jsonText, rawText: result.text, issues: parsed.error.issues }
    );
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
