import type { NamespaceAccount } from '@t3x-dev/api-client';
import { create } from 'zustand';

interface NamespaceAccountStore {
  accounts: NamespaceAccount[];
  activeNamespaceId: string | null;
  setAccounts: (accounts: NamespaceAccount[], preferredNamespaceId?: string | null) => void;
  selectNamespace: (namespaceId: string) => void;
  reset: () => void;
}

export function reconcileActiveNamespaceId(
  accounts: NamespaceAccount[],
  preferredNamespaceId: string | null | undefined,
  currentNamespaceId: string | null
): string | null {
  const candidates = [preferredNamespaceId, currentNamespaceId];
  for (const candidate of candidates) {
    if (candidate && accounts.some((account) => account.namespace.namespace_id === candidate)) {
      return candidate;
    }
  }
  return (
    accounts.find((account) => account.namespace.kind === 'personal')?.namespace.namespace_id ??
    accounts[0]?.namespace.namespace_id ??
    null
  );
}

export const useNamespaceAccountStore = create<NamespaceAccountStore>((set) => ({
  accounts: [],
  activeNamespaceId: null,
  setAccounts: (accounts, preferredNamespaceId) =>
    set((state) => ({
      accounts,
      activeNamespaceId: reconcileActiveNamespaceId(
        accounts,
        preferredNamespaceId,
        state.activeNamespaceId
      ),
    })),
  selectNamespace: (namespaceId) =>
    set((state) =>
      state.accounts.some((account) => account.namespace.namespace_id === namespaceId)
        ? { activeNamespaceId: namespaceId }
        : state
    ),
  reset: () => set({ accounts: [], activeNamespaceId: null }),
}));

export function selectActiveNamespaceAccount(state: NamespaceAccountStore) {
  return (
    state.accounts.find((account) => account.namespace.namespace_id === state.activeNamespaceId) ??
    null
  );
}
