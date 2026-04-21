import { describe, expect, it } from 'vitest';
import { createDefaultProviderRegistry } from '../../providers/default-registry';

describe('createDefaultProviderRegistry', () => {
  it('registers the built-in provider catalog', () => {
    const reg = createDefaultProviderRegistry({ autoConfigureFromEnv: false });
    const providers = reg.listProviders();
    const ids = providers.map((provider) => provider.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'anthropic',
        'openai',
        'deepseek',
        'google-ai',
        'ollama',
        'anthropic-merge',
        'google-ai-embedding',
        'openai-embedding',
        'ollama-embedding',
      ])
    );
  });

  it('supports overriding built-in default models', () => {
    const reg = createDefaultProviderRegistry({
      autoConfigureFromEnv: false,
      providerOverrides: {
        anthropic: {
          defaultModel: 'claude-sonnet-4-20250514',
        },
      },
    });

    expect(reg.getEntry('anthropic')?.defaultModel).toBe('claude-sonnet-4-20250514');
    expect(reg.getEntry('anthropic-merge')?.defaultModel).toBe('claude-sonnet-4-6');
  });
});
