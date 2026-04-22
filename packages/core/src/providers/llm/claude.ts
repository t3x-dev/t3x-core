/**
 * Claude LLM Provider
 *
 * Implementation of LLMProvider using Anthropic's Claude API.
 */

import type { ZodType } from 'zod';
import {
  type ContentBlock,
  type LLMBasicGenerateOptions,
  type LLMGenerateOptions,
  type LLMGenerateResult,
  type LLMPrompt,
  type LLMProvider,
  LLMProviderError,
  type LLMResult,
  type StructuredResult,
  type ToolCall,
  type ToolDefinition,
  type ToolUseResult,
} from '../../llm/types';
import { normalizeClaudeStructuredData, toClaudeStructuredSchema } from './structuredSchema';

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
 * Fetch with proxy support - always uses undici ProxyAgent when proxy is configured.
 */
async function fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    try {
      const { ProxyAgent, fetch: undiciFetch } = await import('undici');
      const response = await undiciFetch(url, {
        ...options,
        dispatcher: new ProxyAgent(proxyUrl),
      } as Parameters<typeof undiciFetch>[1]);
      return response as unknown as Response;
    } catch {
      return fetch(url, options);
    }
  }
  return fetch(url, options);
}

/**
 * Extract the first balanced JSON object or array from a text blob.
 * Handles: bare JSON, JSON inside ```json …``` fences, JSON after preamble.
 * Returns null if no object or array is found.
 */
function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const openIndex = Math.min(
    ...['{', '['].map((ch) => {
      const idx = trimmed.indexOf(ch);
      return idx === -1 ? Number.POSITIVE_INFINITY : idx;
    })
  );
  if (!Number.isFinite(openIndex)) return null;

  const open = trimmed[openIndex];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = openIndex; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return trimmed.slice(openIndex, i + 1);
    }
  }
  return null;
}

/**
 * Claude provider configuration
 */
export interface ClaudeProviderConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-6) */
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
    this.model = config.model ?? 'claude-sonnet-4-6';
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
    try {
      return await this.generateStructuredViaOutputConfig(prompt, schema, options);
    } catch (error) {
      // Deterministic fallback: the Anthropic structured-output path
      // intermittently returns a response with no tool_use block and no JSON
      // text block (observed on opus reproducibly). Rather than failing, retry
      // via the plain messages API and extract JSON from the text response.
      // No prompt change — the prompt already instructs the model to return
      // JSON only.
      if (
        error instanceof LLMProviderError &&
        error.message.endsWith('No structured data found in response')
      ) {
        return this.generateStructuredViaText(prompt, schema, options);
      }
      throw error;
    }
  }

  private async generateStructuredViaOutputConfig<T>(
    prompt: LLMPrompt,
    schema: ZodType<T>,
    options: LLMGenerateOptions
  ): Promise<StructuredResult<T>> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 2048;
    const jsonSchema = toClaudeStructuredSchema(schema);

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
          output_config: {
            format: {
              type: 'json_schema',
              schema: jsonSchema,
            },
          },
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

      // Backward-compatible fallback if the API still returns tool_use blocks.
      const toolUseBlock = data.content.find(
        (c) => c.type === 'tool_use' && c.name === 'extract_data'
      );
      if (toolUseBlock?.input !== undefined) {
        const parsed = schema.parse(normalizeClaudeStructuredData(toolUseBlock.input));
        return { data: parsed, usage };
      }

      // Fallback: try text block with JSON
      const textBlock = data.content.find((c) => c.type === 'text' && c.text);
      if (textBlock?.text) {
        try {
          const jsonData = JSON.parse(textBlock.text);
          const parsed = schema.parse(normalizeClaudeStructuredData(jsonData));
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

  private async generateStructuredViaText<T>(
    prompt: LLMPrompt,
    schema: ZodType<T>,
    options: LLMGenerateOptions
  ): Promise<StructuredResult<T>> {
    const result = await this.generateFromPrompt(prompt, options);
    const jsonText = extractJsonBlock(result.text);
    if (!jsonText) {
      throw new LLMProviderError(this.id, undefined, 'No structured data found in response');
    }
    let jsonData: unknown;
    try {
      jsonData = JSON.parse(jsonText);
    } catch {
      throw new LLMProviderError(this.id, undefined, 'Failed to parse response as JSON');
    }
    try {
      const parsed = schema.parse(normalizeClaudeStructuredData(jsonData));
      return { data: parsed, usage: result.usage };
    } catch {
      throw new LLMProviderError(
        this.id,
        undefined,
        'Response JSON does not match expected schema'
      );
    }
  }

  async generateWithTools(
    prompt: LLMPrompt,
    tools: ToolDefinition[],
    options: LLMGenerateOptions
  ): Promise<ToolUseResult> {
    const temperature = options.temperature ?? 0.3;
    const maxTokens = options.maxTokens ?? 8192;

    const url = `${this.baseUrl}/v1/messages`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

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
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          })),
          tool_choice: { type: 'auto' },
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
        content: Array<{
          type: string;
          id?: string;
          name?: string;
          input?: unknown;
          text?: string;
        }>;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const usage = {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };

      const toolCalls: ToolCall[] = data.content
        .filter(
          (c): c is typeof c & { id: string; name: string } =>
            c.type === 'tool_use' && typeof c.name === 'string' && typeof c.id === 'string'
        )
        .map((c) => ({ id: c.id, name: c.name, input: c.input }));

      const stopReason =
        data.stop_reason === 'tool_use'
          ? ('tool_use' as const)
          : data.stop_reason === 'max_tokens'
            ? ('max_tokens' as const)
            : ('end_turn' as const);

      return {
        tool_calls: toolCalls,
        stop_reason: stopReason,
        usage,
        _rawAssistantContent: data.content as ContentBlock[],
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof LLMProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMProviderError(this.id, undefined, 'Request timeout after 120000ms');
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
