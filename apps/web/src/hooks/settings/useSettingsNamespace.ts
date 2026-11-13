'use client';

import { useSearchParams } from 'next/navigation';
import { namespaceSettingsHref } from '@/domain/settingsLocation';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { safeInternalReturnTo } from '@/utils/navigationReturn';

export function useSettingsNamespace() {
  const params = useSearchParams();
  const requested = params?.get('namespace') ?? null;
  const { accounts, activeAccount, isLoading, error, refetch } = useNamespaceAccounts();
  const account = error
    ? null
    : requested
      ? (accounts.find(({ namespace }) => namespace.slug === requested) ?? null)
      : activeAccount;
  const returnTo = safeInternalReturnTo(params?.get('returnTo'), '');

  return {
    account,
    activeAccount,
    requested,
    isLoading,
    error,
    refetch,
    returnTo,
    generalHref: namespaceSettingsHref(requested, returnTo),
  };
}
