import type { NamespaceAccount } from '@t3x-dev/api-client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  reconcileActiveNamespaceId,
  selectActiveNamespaceAccount,
  useNamespaceAccountStore,
} from '@/store/namespaceAccountStore';

function account(
  namespaceId: string,
  kind: 'personal' | 'organization',
  role: 'owner' | 'admin' = 'owner'
): NamespaceAccount {
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
      role,
      status: 'active',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
    },
    authorized_actions: ['namespace:read'],
  };
}

const personal = account('ns_personal', 'personal');
const organization = account('ns_team', 'organization', 'admin');

describe('namespaceAccountStore', () => {
  beforeEach(() => useNamespaceAccountStore.getState().reset());

  it('prefers a valid persisted namespace and otherwise selects the personal account', () => {
    expect(reconcileActiveNamespaceId([organization, personal], 'ns_team', null)).toBe('ns_team');
    expect(reconcileActiveNamespaceId([organization, personal], 'ns_missing', null)).toBe(
      'ns_personal'
    );
  });

  it('keeps selection within the latest server-authorized account projection', () => {
    useNamespaceAccountStore.getState().setAccounts([personal, organization], 'ns_team');
    expect(selectActiveNamespaceAccount(useNamespaceAccountStore.getState())).toBe(organization);

    useNamespaceAccountStore.getState().selectNamespace('ns_missing');
    expect(useNamespaceAccountStore.getState().activeNamespaceId).toBe('ns_team');

    useNamespaceAccountStore.getState().setAccounts([personal]);
    expect(useNamespaceAccountStore.getState().activeNamespaceId).toBe('ns_personal');
  });
});
