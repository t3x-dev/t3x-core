import { describe, expect, it } from 'vitest';
import { isIntroDemoQueryEnabled } from '@/utils/introDemo';

describe('isIntroDemoQueryEnabled', () => {
  it('enables the intro demo in source development', () => {
    expect(
      isIntroDemoQueryEnabled(
        new URLSearchParams({ introDemo: '1' }),
        { NODE_ENV: 'development' },
        'development'
      )
    ).toBe(true);
  });

  it('enables the intro demo in local production builds with auth disabled', () => {
    expect(
      isIntroDemoQueryEnabled(
        new URLSearchParams({ introDemo: '1' }),
        { NODE_ENV: 'production', NEXT_PUBLIC_AUTH_DISABLED: 'true' },
        'production'
      )
    ).toBe(true);
  });

  it('keeps the intro demo disabled in hosted production builds', () => {
    expect(
      isIntroDemoQueryEnabled(
        new URLSearchParams({ introDemo: '1' }),
        { NODE_ENV: 'production', NEXT_PUBLIC_AUTH_DISABLED: 'false' },
        'production'
      )
    ).toBe(false);
  });

  it('requires the introDemo query flag', () => {
    expect(
      isIntroDemoQueryEnabled(
        new URLSearchParams(),
        { NODE_ENV: 'development', NEXT_PUBLIC_AUTH_DISABLED: 'true' },
        'development'
      )
    ).toBe(false);
  });
});
