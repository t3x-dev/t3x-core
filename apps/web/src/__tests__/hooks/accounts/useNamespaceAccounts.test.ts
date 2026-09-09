// @vitest-environment jsdom

import type { NamespaceAccount } from '@t3x-dev/api-client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_NAMESPACE_STORAGE_KEY,
  namespaceQueryKey,
  useNamespaceAccounts,
} from '@/hooks/accounts/useNamespaceAccounts';
import { clearQueryCache } from '@/hooks/shared/useQuery';
import { useNamespaceAccountStore } from '@/store/namespaceAccountStore';

const listNamespaceAccounts = vi.fn();

vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({ listNamespaceAccounts }),
}));

function account(namespaceId: string, kind: 'personal' | 'organization'): NamespaceAccount {
  return {
    namespace: {
      namespace_id: namespaceId,
      slug: namespaceId.replace('ns_', ''),
      kind,
      display_name: namespaceId,
    },
    current_membership: {
      membership_id: `nsm_${namespaceId}`,
      namespace_id: namespaceId,
      principal: {
        kind: 'human',
        principal_id: 'user_1',
        display_name: 'User',
        email: 'user@example.com',
        avatar_url: null,
      },
      role: 'owner',
      status: 'active',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
    },
    authorized_actions: ['namespace:read'],
  };
}

const personal = account('ns_personal', 'personal');
const team = account('ns_team', 'organization');

describe('useNamespaceAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_AUTH_DISABLED', 'false');
    clearQueryCache();
    localStorage.clear();
    useNamespaceAccountStore.getState().reset();
    listNamespaceAccounts.mockResolvedValue({ version: 1, namespaces: [personal, team] });
  });

  it('hydrates the persisted authorized account and persists later selection', async () => {
    localStorage.setItem(ACTIVE_NAMESPACE_STORAGE_KEY, 'ns_team');
    const { result } = renderHook(() => useNamespaceAccounts());

    await waitFor(() => expect(result.current.activeAccount).toBe(team));
    expect(listNamespaceAccounts).toHaveBeenCalledTimes(1);

    act(() => result.current.selectNamespace('ns_personal'));
    expect(result.current.activeAccount).toBe(personal);
    expect(localStorage.getItem(ACTIVE_NAMESPACE_STORAGE_KEY)).toBe('ns_personal');
  });

  it('requires namespace identity in every namespace-scoped query key', () => {
    expect(namespaceQueryKey('ns_personal', 'members')).toEqual([
      'namespace',
      'ns_personal',
      'members',
    ]);
    expect(namespaceQueryKey('ns_team', 'members')).not.toEqual(
      namespaceQueryKey('ns_personal', 'members')
    );
  });
});
