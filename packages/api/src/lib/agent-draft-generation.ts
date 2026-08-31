import type { LLMProvider } from '@t3x-dev/core';
import {
  executeMeteredInference,
  type InferenceExecution,
  type InferenceRuntime,
  type InferenceScope,
} from './inference';

export type AgentDraftInferenceFeature = 'agent-draft.create' | 'agent-draft.patch';

export interface GenerateAgentDraftTextInput {
  runtime: InferenceRuntime;
  runId: string;
  feature: AgentDraftInferenceFeature;
  scope: InferenceScope;
  provider: Pick<LLMProvider, 'id' | 'generate'>;
  model: string;
  prompt: string;
  temperature: number;
  maxTokens: number;
}

export interface AgentDraftGenerationResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Execute one agent-draft provider call behind the shared inference lifecycle. */
export async function generateAgentDraftText(
  input: GenerateAgentDraftTextInput
): Promise<InferenceExecution<AgentDraftGenerationResult>> {
  return executeMeteredInference({
    runtime: input.runtime,
    input: {
      runId: input.runId,
      feature: input.feature,
      requestedModel: input.model,
      scope: input.scope,
    },
    resolvedProvider: input.provider.id,
    resolvedModel: input.model,
    async invoke() {
      const result = await input.provider.generate(input.prompt, {
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      return { value: result, usage: result.usage };
    },
  });
}
