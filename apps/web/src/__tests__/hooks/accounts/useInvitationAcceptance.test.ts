// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvitationAcceptance } from '@/hooks/accounts/useInvitationAcceptance';

const acceptCollaborationInvitation = vi.fn();

vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ acceptCollaborationInvitation }),
}));

describe('useInvitationAcceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acceptCollaborationInvitation.mockResolvedValue({});
  });

  it('sends the one-time token through the typed POST contract', async () => {
    const { result } = renderHook(() => useInvitationAcceptance());
    const token = `t3xi_v1_${'a'.repeat(43)}`;

    await act(async () => result.current.acceptInvitation(token));

    expect(acceptCollaborationInvitation).toHaveBeenCalledWith({ token });
  });
});
