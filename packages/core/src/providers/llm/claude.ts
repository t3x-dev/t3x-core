/**
 * Claude LLM Provider
 *
 * Implementation of LLMProvider using Anthropic's Claude API.
 */

import { type LLMProvider, type LLMGenerateOptions, LLMProviderError } from '../../llm/types';

/**
 * Claude provider configuration
 */
export interface ClaudeProviderConfig {
  /** Anthropic API key */
  apiKey: string;
  /** Model to use (default: claude-sonnet-4-5-20250929) */
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
    this.model = config.model ?? 'claude-sonnet-4-5-20250929';
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
  }

  async generate(prompt: string, options?: LLMGenerateOptions): Promise<string> {
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 2048;

    const url = `${this.baseUrl}/v1/messages`;

    try {
      const response = await fetch(url, {
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
      });

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
      };

      // Extract text from response
      const textContent = data.content.find((c) => c.type === 'text');
      if (!textContent) {
        throw new LLMProviderError(this.id, undefined, 'No text content in response');
      }

      return textContent.text;
    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error;
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
  ): Promise<string> {
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
