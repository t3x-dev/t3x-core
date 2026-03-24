import { describe, expect, it } from 'vitest';
import type { LLMGenerateOptions, LLMPrompt, ModelInfo, ProviderName } from '../../llm/types';

describe('LLM extended types', () => {
  it('ProviderName accepts valid values', () => {
    const names: ProviderName[] = ['anthropic', 'openai', 'google'];
    expect(names).toHaveLength(3);
  });

  it('ModelInfo has required fields', () => {
    const model: ModelInfo = {
      id: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      provider: 'anthropic',
      capabilities: ['tool_use'],
      maxOutputTokens: 8192,
    };
    expect(model.id).toBe('claude-sonnet-4-20250514');
    expect(model.capabilities).toContain('tool_use');
  });

  it('LLMPrompt supports system and messages', () => {
    const prompt: LLMPrompt = {
      system: 'You are helpful.',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    };
    expect(prompt.messages).toHaveLength(2);
  });

  it('LLMGenerateOptions includes stopSequences', () => {
    const opts: LLMGenerateOptions = {
      model: 'claude-sonnet-4-20250514',
      temperature: 0.1,
      maxTokens: 4096,
      stopSequences: ['```'],
    };
    expect(opts.stopSequences).toContain('```');
  });
});
