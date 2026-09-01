import type { LLMProvider } from '@t3x-dev/core';
import {
  executeMeteredInference,
  type InferenceExecutionInput,
  type InferenceRuntime,
} from './inference';

export type InferenceLLMProvider = Pick<
  LLMProvider,
  'generate' | 'generateFromPrompt' | 'generateStructured'
>;

export interface InferenceProviderBinding {
  runtime: InferenceRuntime;
  input: InferenceExecutionInput;
  resolvedProvider: string;
  resolvedModel: string;
}

/**
 * Bind one resolved provider to the shared inference lifecycle.
 *
 * Core algorithms remain provider- and billing-neutral: every nested provider
 * call they make through this adapter receives its own admitted generation ID
 * and terminal receipt while retaining the provider's native result shape.
 */
export function bindInferenceProvider(
  provider: InferenceLLMProvider,
  binding: InferenceProviderBinding
): InferenceLLMProvider {
  const execute = async <T extends { usage: { inputTokens: number; outputTokens: number } }>(
    invoke: () => Promise<T>
  ): Promise<T> => {
    const execution = await executeMeteredInference({
      runtime: binding.runtime,
      input: binding.input,
      resolvedProvider: binding.resolvedProvider,
      resolvedModel: binding.resolvedModel,
      invoke: async () => {
        const result = await invoke();
        return { value: result, usage: result.usage };
      },
    });
    return execution.value;
  };

  const wrapped: InferenceLLMProvider = {
    generate: (prompt, options) => execute(() => provider.generate(prompt, options)),
  };

  if (provider.generateFromPrompt) {
    const promptProvider = provider as Required<Pick<LLMProvider, 'generateFromPrompt'>>;
    wrapped.generateFromPrompt = (prompt, options) =>
      execute(() => promptProvider.generateFromPrompt(prompt, options));
  }
  if (provider.generateStructured) {
    const structuredProvider = provider as Required<Pick<LLMProvider, 'generateStructured'>>;
    const generateStructured: NonNullable<LLMProvider['generateStructured']> = (
      prompt,
      schema,
      options
    ) => execute(() => structuredProvider.generateStructured(prompt, schema, options));
    wrapped.generateStructured = generateStructured;
  }

  return wrapped;
}
