import { describe, expect, it } from 'vitest';
import { safeAuthCallbackUrl } from '@/domain/authCallback';

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
