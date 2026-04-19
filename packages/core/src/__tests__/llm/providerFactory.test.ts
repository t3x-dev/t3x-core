import { describe, expect, it } from 'vitest';
import { createProviderForModel } from '../../llm/providerFactory';

describe('createProviderForModel', () => {
  it('creates Anthropic provider for Claude model', () => {
    const provider = createProviderForModel('claude-sonnet-4-6', {
      anthropic: 'sk-test',
      openai: undefined,
      google: undefined,
    });
    expect(provider).toBeDefined();
    expect(provider!.id).toBe('claude');
  });

  it('creates OpenAI provider for GPT model', () => {
    const provider = createProviderForModel('gpt-5.4-mini', {
      anthropic: undefined,
      openai: 'sk-test',
      google: undefined,
    });
    expect(provider).toBeDefined();
    expect(provider!.id).toBe('openai');
  });

  it('creates Google provider for Gemini model', () => {
    const provider = createProviderForModel('gemini-3-flash-preview', {
      anthropic: undefined,
      openai: undefined,
      google: 'test-key',
    });
    expect(provider).toBeDefined();
    expect(provider!.id).toBe('google-ai');
  });

  it('returns null for unknown model', () => {
    const provider = createProviderForModel('unknown-model', {
      anthropic: 'sk-test',
      openai: undefined,
      google: undefined,
    });
    expect(provider).toBeNull();
  });

  it('returns null when API key missing for provider', () => {
    const provider = createProviderForModel('claude-sonnet-4-6', {
      anthropic: undefined,
      openai: undefined,
      google: undefined,
    });
    expect(provider).toBeNull();
  });
});
