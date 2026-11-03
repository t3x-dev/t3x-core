import { describe, expect, it } from 'vitest';
import { postAuthDestination, safeAuthCallbackUrl } from '@/domain/authCallback';

describe('safeAuthCallbackUrl', () => {
  it('preserves local paths and their query and fragment state', () => {
    expect(safeAuthCallbackUrl('/invite?source=email#continue')).toBe(
      '/invite?source=email#continue'
    );
  });

  it.each([
    null,
    '',
    'https://attacker.example/path',
    '//attacker.example/path',
    '/\\attacker.example/path',
    'javascript:alert(1)',
  ])('rejects an unsafe callback destination: %s', (candidate) => {
    expect(safeAuthCallbackUrl(candidate)).toBe('/');
  });

  it('uses the requested local fallback', () => {
    expect(safeAuthCallbackUrl('https://attacker.example', '/chat')).toBe('/chat');
  });
});

describe('postAuthDestination', () => {
  it('sends a newly registered user from the default home to namespace onboarding', () => {
    expect(postAuthDestination('register', '/')).toBe('/onboarding/namespace');
  });

  it('sends a login without a personal namespace to namespace onboarding', () => {
    expect(postAuthDestination('login', '/', null)).toBe('/onboarding/namespace');
  });

  it('sends a login with a personal namespace to that namespace', () => {
    expect(postAuthDestination('login', '/', 'test-a')).toBe('/test-a');
  });

  it('preserves an explicit local callback after registration', () => {
    expect(postAuthDestination('register', '/invite#token')).toBe('/invite#token');
  });

  it('preserves an explicit local callback after login', () => {
    expect(postAuthDestination('login', '/invite#token', 'test-a')).toBe('/invite#token');
  });
});
