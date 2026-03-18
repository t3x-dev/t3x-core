/**
 * Stub LLM Provider for testing.
 *
 * Returns configurable preset responses — no external calls.
 */

import type { LLMGenerateOptions, LLMGenerateResult, LLMProvider } from '../../llm';

export class StubLLMProvider implements LLMProvider {
  readonly id = 'stub-llm';

  /** Queue of responses to return. If empty, falls back to default. */
  private responseQueue: string[] = [];

  /** Record of all prompts received */
  readonly calls: string[] = [];

  async generate(prompt: string, _options?: LLMGenerateOptions): Promise<LLMGenerateResult> {
    this.calls.push(prompt);
    const text = this.responseQueue.shift() ?? `LLM response to: ${prompt.slice(0, 50)}...`;
    return { text, usage: { inputTokens: 10, outputTokens: 5 } };
  }

  async resolveConflict(
    baseText: string | null,
    sourceText: string | null,
    targetText: string | null
  ): Promise<LLMGenerateResult> {
    return {
      text: sourceText ?? targetText ?? baseText ?? '',
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  }

  /** Enqueue a preset response for the next generate() call */
  enqueue(response: string): this {
    this.responseQueue.push(response);
    return this;
  }

  /** Enqueue multiple responses */
  enqueueAll(...responses: string[]): this {
    this.responseQueue.push(...responses);
    return this;
  }

  /** Reset call history and response queue */
  reset(): this {
    this.calls.length = 0;
    this.responseQueue.length = 0;
    return this;
  }
}
