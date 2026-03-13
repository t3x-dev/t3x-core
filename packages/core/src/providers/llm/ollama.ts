/**
 * Ollama LLM Provider
 *
 * Implementation of LLMProvider using Ollama's local API.
 * Ollama runs models locally — no API key required.
 */

import {
  type LLMGenerateOptions,
  type LLMGenerateResult,
  type LLMProvider,
  LLMProviderError,
} from '../../llm/types';

export interface OllamaProviderConfig {
  model?: string;
  baseUrl?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';

  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OllamaProviderConfig = {}) {
    this.model = config.model ?? 'llama3.1';
    this.baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  async generate(prompt: string, options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    const temperature = options?.temperature ?? 0.3;
    const url = `${this.baseUrl}/api/generate`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature,
            ...(options?.maxTokens && { num_predict: options.maxTokens }),
            ...(options?.stopSequences && { stop: options.stopSequences }),
          },
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
        response: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      if (!data.response) {
        throw new LLMProviderError(this.id, undefined, 'No response content from Ollama');
      }

      return {
        text: data.response,
        usage: {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof LLMProviderError) throw error;
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

export function createOllamaProvider(config?: OllamaProviderConfig): OllamaProvider {
  return new OllamaProvider(config);
}
