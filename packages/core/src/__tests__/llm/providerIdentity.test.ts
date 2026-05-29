import { describe, expect, it } from 'vitest';
import {
  normalizeLocalProviderId,
  normalizeRuntimeProviderId,
  publicProviderIdForRuntime,
  runtimeProviderIdForPublic,
} from '../../llm/providerIdentity';

describe('provider identity helpers', () => {
  it('normalizes user-facing aliases to local provider ids', () => {
    expect(normalizeLocalProviderId('anthropic')).toBe('anthropic');
    expect(normalizeLocalProviderId('claude')).toBe('anthropic');
    expect(normalizeLocalProviderId('openai')).toBe('openai');
    expect(normalizeLocalProviderId('gpt')).toBe('openai');
    expect(normalizeLocalProviderId('google')).toBe('google');
    expect(normalizeLocalProviderId('google-ai')).toBe('google');
    expect(normalizeLocalProviderId('gemini')).toBe('google');
  });

  it('normalizes user-facing aliases to runtime provider ids', () => {
    expect(normalizeRuntimeProviderId('anthropic')).toBe('anthropic');
    expect(normalizeRuntimeProviderId('claude')).toBe('anthropic');
    expect(normalizeRuntimeProviderId('openai')).toBe('openai');
    expect(normalizeRuntimeProviderId('gpt')).toBe('openai');
    expect(normalizeRuntimeProviderId('google')).toBe('google-ai');
    expect(normalizeRuntimeProviderId('google-ai')).toBe('google-ai');
    expect(normalizeRuntimeProviderId('gemini')).toBe('google-ai');
  });

  it('maps between public and runtime provider ids', () => {
    expect(runtimeProviderIdForPublic('anthropic')).toBe('anthropic');
    expect(runtimeProviderIdForPublic('openai')).toBe('openai');
    expect(runtimeProviderIdForPublic('google')).toBe('google-ai');
    expect(publicProviderIdForRuntime('anthropic')).toBe('anthropic');
    expect(publicProviderIdForRuntime('openai')).toBe('openai');
    expect(publicProviderIdForRuntime('google-ai')).toBe('google');
  });
});
