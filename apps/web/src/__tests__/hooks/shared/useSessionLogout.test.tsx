// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postLogout: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('@/infrastructure/auth', () => ({ postLogout: mocks.postLogout }));
vi.mock('@/infrastructure/session', () => ({
  clearSession: mocks.clearSession,
  getSessionUser: vi.fn(),
  setSessionUser: vi.fn(),
}));

import { useSession } from '@/hooks/shared/useSession';

describe('useSession logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clears the browser credential only after server logout succeeds', async () => {
    mocks.postLogout.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSession());

    await act(async () => {
      await result.current.clear();
    });

    expect(mocks.postLogout).toHaveBeenCalledOnce();
    expect(mocks.clearSession).toHaveBeenCalledOnce();
  });

  it('keeps the browser credential when server logout fails', async () => {
    mocks.postLogout.mockRejectedValue(new Error('offline'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useSession());

    await act(async () => {
      await result.current.clear();
    });

    expect(mocks.clearSession).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
