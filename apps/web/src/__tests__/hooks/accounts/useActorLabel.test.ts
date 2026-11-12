// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useActorLabel } from '@/hooks/accounts/useActorLabel';
import { clearQueryCache } from '@/hooks/shared/useQuery';

const identity = vi.hoisted(() => ({
  resolveCollaborationUsers: vi.fn(),
}));
vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ resolveCollaborationUsers: identity.resolveCollaborationUsers }),
}));

beforeEach(() => {
  clearQueryCache();
  identity.resolveCollaborationUsers.mockReset().mockResolvedValue({
    users: [
      { user_id: 'user_a1', username: 'ui-test-a1' },
      { user_id: 'user_b1', username: 'ui-test-b1' },
      { user_id: 'user_c1', username: 'ui-test-c1' },
    ],
  });
});

it('resolves every recorded collaborator by user ID with the same rule', async () => {
  const { result } = renderHook(() =>
    useActorLabel(['user:user_a1', 'user:user_b1', 'user:user_c1'])
  );
  await waitFor(() => expect(result.current('user:user_b1')).toBe('@ui-test-b1'));
  expect(result.current('user:user_a1')).toBe('@ui-test-a1');
  expect(result.current('user:user_c1')).toBe('@ui-test-c1');
  expect(identity.resolveCollaborationUsers).toHaveBeenCalledWith([
    'user_a1',
    'user_b1',
    'user_c1',
  ]);
  expect(result.current('user:user_other')).toBe('User other');
});

it('keeps local and machine actors without looking up a user profile', () => {
  const { result } = renderHook(() => useActorLabel(['human:local-user', 'service:generator']));
  expect(result.current('human:local-user')).toBe('You');
  expect(result.current('service:generator')).toBe('Generator');
  expect(identity.resolveCollaborationUsers).not.toHaveBeenCalled();
});
