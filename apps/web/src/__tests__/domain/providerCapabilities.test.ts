import { describe, expect, it } from 'vitest';
import {
  listProvidersSupporting,
  providerSupports,
  toCapabilityId,
} from '@/domain/providerCapabilities';

describe('toCapabilityId', () => {
  // Three sources emit different ids for the same provider; the helper has
  // to fold them into a single canonical id or every UI lookup fails open.
  it.each([
    ['anthropic', 'anthropic'],
    ['claude', 'anthropic'], // /v1/chat/providers public alias
    ['openai', 'openai'],
    ['gpt', 'openai'],
    ['google', 'google'],
    ['google-ai', 'google'], // core registry runtime id
    ['gemini', 'google'],
  ])('maps %s → %s', (input, expected) => {
    expect(toCapabilityId(input)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(toCapabilityId('Claude')).toBe('anthropic');
    expect(toCapabilityId('GOOGLE-AI')).toBe('google');
  });

  it('returns null for an unknown id', () => {
    expect(toCapabilityId('mistral')).toBeNull();
    expect(toCapabilityId('')).toBeNull();
  });
});

describe('providerSupports', () => {
  it('reports the right capability for every alias', () => {
    expect(providerSupports('claude', 'thinking')).toBe(true);
    expect(providerSupports('claude', 'web_search')).toBe(true);
    expect(providerSupports('openai', 'thinking')).toBe(true);
    expect(providerSupports('openai', 'web_search')).toBe(true);
    expect(providerSupports('google', 'thinking')).toBe(true);
    expect(providerSupports('google', 'web_search')).toBe(true);
    expect(providerSupports('google-ai', 'web_search')).toBe(true);
    expect(providerSupports('gemini', 'thinking')).toBe(true);
  });

  it('returns false for unknown providers (closed-world default)', () => {
    expect(providerSupports('mistral', 'thinking')).toBe(false);
    expect(providerSupports('', 'web_search')).toBe(false);
  });
});

describe('listProvidersSupporting', () => {
  it('lists exactly the providers backing each capability', () => {
    expect(listProvidersSupporting('thinking').sort()).toEqual(['anthropic', 'google', 'openai']);
    expect(listProvidersSupporting('web_search').sort()).toEqual(['anthropic', 'google', 'openai']);
  });
});
