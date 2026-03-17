import { createClaudeProvider } from '../providers/llm/claude';
import { createGeminiProvider } from '../providers/llm/gemini';
import { createOpenAIProvider } from '../providers/llm/openai';
import { getModelInfo } from './catalog';
import type { LLMProvider, ProviderName } from './types';

type ApiKeys = Record<ProviderName, string | undefined>;

export function createProviderForModel(modelId: string, apiKeys: ApiKeys): LLMProvider | null {
  const model = getModelInfo(modelId);
  if (!model) return null;

  const key = apiKeys[model.provider];
  if (!key) return null;

  switch (model.provider) {
    case 'anthropic':
      return createClaudeProvider({ apiKey: key, model: modelId });
    case 'openai':
      return createOpenAIProvider({ apiKey: key, model: modelId });
    case 'google':
      return createGeminiProvider({ apiKey: key, model: modelId });
    default:
      return null;
  }
}
