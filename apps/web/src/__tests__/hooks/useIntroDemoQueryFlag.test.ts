// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIntroDemoQueryFlag } from '@/hooks/onboarding/useIntroDemoQueryFlag';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

afterEach(() => {
  cleanupRoots();
  vi.unstubAllEnvs();
  window.history.pushState(null, '', '/');
});

describe('useIntroDemoQueryFlag', () => {
  it('enables intro demo query mode in local production auth-disabled builds', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'true');
    window.history.pushState(null, '', '/project/proj_1/commit/hash?introDemo=1');

    const { result } = renderHook(() => useIntroDemoQueryFlag());

    expect(result.current).toBe(true);

    await waitForHook();
    expect(result.current).toBe(true);
  });
});
