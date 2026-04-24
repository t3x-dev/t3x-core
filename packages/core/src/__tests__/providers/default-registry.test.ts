import { describe, expect, it } from 'vitest';
import { createDefaultProviderRegistry } from '../../providers/default-registry';

describe('createDefaultProviderRegistry', () => {
  it('registers the built-in provider catalog', () => {
    const reg = createDefaultProviderRegistry({ autoConfigureFromEnv: false });
    const providers = reg.listProviders();
    const ids = providers.map((provider) => provider.id).sort();

    // Exactly three LLM generation providers plus the embedding providers
    // their keys already imply. No deepseek / ollama LLM, no merge role.
    expect(ids).toEqual([
      'anthropic',
      'google-ai',
      'google-ai-embedding',
      'ollama-embedding',
      'openai',
      'openai-embedding',
    ]);
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
  });
});
