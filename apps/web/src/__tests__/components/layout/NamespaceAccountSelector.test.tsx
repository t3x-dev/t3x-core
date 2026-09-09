// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { NamespaceAccount } from '@t3x-dev/api-client';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NamespaceAccountSelector } from '@/components/layout/NamespaceAccountSelector';

const push = vi.fn();
const selectNamespace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const accounts: NamespaceAccount[] = [
  {
    namespace: {
      namespace_id: 'ns_personal',
      slug: 'ada',
      kind: 'personal',
      display_name: 'Ada',
    },
    current_membership: {
      membership_id: 'nsm_personal',
      namespace_id: 'ns_personal',
      principal: {
        kind: 'human',
        principal_id: 'user_1',
        display_name: 'Ada',
        email: 'ada@example.com',
        avatar_url: null,
      },
      role: 'owner',
      status: 'active',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
    },
    authorized_actions: ['namespace:read', 'project:create'],
  },
  {
    namespace: {
      namespace_id: 'ns_team',
      slug: 't3x-team',
      kind: 'organization',
      display_name: 'T3X team',
    },
    current_membership: {
      membership_id: 'nsm_team',
      namespace_id: 'ns_team',
      principal: {
        kind: 'human',
        principal_id: 'user_1',
        display_name: 'Ada',
        email: 'ada@example.com',
        avatar_url: null,
      },
      role: 'editor',
      status: 'active',
      created_at: '2026-08-31T00:00:00.000Z',
      updated_at: '2026-08-31T00:00:00.000Z',
    },
    authorized_actions: ['namespace:read', 'project:create'],
  },
];

vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({
    accounts,
    activeAccount: accounts[0],
    selectNamespace,
    isLoading: false,
    error: null,
  }),
}));

describe('NamespaceAccountSelector', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows server-projected roles and navigates to the selected namespace', async () => {
    render(<NamespaceAccountSelector collapsed={false} />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Current workspace: Ada' }));
    expect(await screen.findByText('owner')).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /T3X teameditor/ }));
    expect(selectNamespace).toHaveBeenCalledWith('ns_team');
    expect(push).toHaveBeenCalledWith('/t3x-team');
  });
});
