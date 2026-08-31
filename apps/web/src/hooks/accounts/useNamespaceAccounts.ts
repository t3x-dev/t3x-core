'use client';

import { useCallback, useEffect } from 'react';
import { invalidateQueries, useQuery } from '@/hooks/shared/useQuery';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';
import {
  selectActiveNamespaceAccount,
  useNamespaceAccountStore,
} from '@/store/namespaceAccountStore';

export const ACTIVE_NAMESPACE_STORAGE_KEY = 't3x-active-namespace-id';

export function namespaceQueryKey(
  namespaceId: string,
  resource: string,
  ...identity: readonly unknown[]
): unknown[] {
  return ['namespace', namespaceId, resource, ...identity];
}

export function useNamespaceAccounts() {
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const accounts = useNamespaceAccountStore((state) => state.accounts);
  const activeAccount = useNamespaceAccountStore(selectActiveNamespaceAccount);
  const setAccounts = useNamespaceAccountStore((state) => state.setAccounts);
  const selectNamespaceInStore = useNamespaceAccountStore((state) => state.selectNamespace);
  const reset = useNamespaceAccountStore((state) => state.reset);
  const query = useQuery({
    queryKey: ['namespace-accounts', 1],
    queryFn: () => getSharedApiClient().listNamespaceAccounts(),
    enabled: !authDisabled,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (authDisabled) {
      reset();
      return;
    }
    if (!query.data) return;
    const preferredNamespaceId = localStorage.getItem(ACTIVE_NAMESPACE_STORAGE_KEY);
    setAccounts(query.data.namespaces, preferredNamespaceId);
  }, [authDisabled, query.data, reset, setAccounts]);

  useEffect(() => {
    if (!activeAccount) return;
    localStorage.setItem(ACTIVE_NAMESPACE_STORAGE_KEY, activeAccount.namespace.namespace_id);
  }, [activeAccount]);

  const selectNamespace = useCallback(
    (namespaceId: string) => {
      if (namespaceId === activeAccount?.namespace.namespace_id) return;
      selectNamespaceInStore(namespaceId);
      localStorage.setItem(ACTIVE_NAMESPACE_STORAGE_KEY, namespaceId);
      invalidateQueries('namespace');
    },
    [activeAccount?.namespace.namespace_id, selectNamespaceInStore]
  );

  return {
    accounts,
    activeAccount,
    selectNamespace,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
