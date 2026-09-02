import type { LLMPrompt, LLMProvider } from '@t3x-dev/core';
import {
  GENERATION_MODEL_SPECIFICATION_VERSION,
  type GenerationModel,
  GenerationModelError,
  type GenerationModelInvocation,
  type GenerationModelRequest,
} from './model-runtime-contract';

function textPrompt(request: GenerationModelRequest): LLMPrompt | null {
  const messages: LLMPrompt['messages'] = [];
  let system: string | undefined;

  for (const message of request.messages) {
    if (message.role === 'tool') return null;
    const content =
      typeof message.content === 'string'
        ? message.content
        : message.content.every((part) => part.type === 'text')
          ? message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
          : null;
    if (content === null) return null;
    if (message.role === 'system') {
      system = system ? `${system}\n\n${content}` : content;
      continue;
    }
    messages.push({ role: message.role, content });
  }

  return { ...(system ? { system } : {}), messages };
}

/** Keep historical provider methods behind the new model contract during migration. */
export function createLegacyGenerationModel(
  providerId: string,
  modelId: string,
  provider: LLMProvider
): GenerationModel {
  return Object.freeze({
    specificationVersion: GENERATION_MODEL_SPECIFICATION_VERSION,
    provider: providerId,
    modelId,
    capabilities: Object.freeze(['text'] as const),
    async generate(invocation: GenerationModelInvocation, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new GenerationModelError('generation_cancelled', 'not_started');
      }
      const { request } = invocation;
      if ((request.output?.type ?? 'text') !== 'text' || request.tools?.length) {
        throw new GenerationModelError('generation_capability_unsupported', 'not_started');
      }
      const prompt = textPrompt(request);
      if (!prompt) {
        throw new GenerationModelError('generation_content_unsupported', 'not_started');
      }

      const options = {
        model: modelId,
        temperature: request.temperature,
        maxTokens: request.maxOutputTokens,
        stopSequences: request.stopSequences ? [...request.stopSequences] : undefined,
      };

      try {
        const result = provider.generateFromPrompt
          ? await provider.generateFromPrompt(prompt, options)
          : await provider.generate(
              [prompt.system, ...prompt.messages.map((message) => String(message.content))]
                .filter(Boolean)
                .join('\n\n'),
              options
            );

        return {
          output: [{ type: 'text' as const, text: result.text }],
          evidence: {
            provider: providerId,
            model: modelId,
            usage: result.usage,
            finishReason: 'stop' as const,
          },
        };
      } catch {
        throw new GenerationModelError('legacy_provider_failure', 'unknown');
      }
    },
  });
}
