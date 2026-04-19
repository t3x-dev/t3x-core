import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  dispatchProviderCredentialsUpdatedEvent,
} from '@/infrastructure/providerEvents';
import {
  useProviderCommands,
  type LocalProviderCredentialInput,
  type LocalProviderId,
  type LocalProviderStatus,
  type RoleAssignment,
  type TestConnectionResult,
} from '@/hooks/providers/useProviderCommands';
import { fetchLocalProviderStatus } from '@/queries/providerStatus';
import {
  fetchProviderRoles,
  fetchProviders as fetchProvidersQuery,
  toLocalProviderId,
  type ProviderInfo,
} from '@/queries/providers';

export type RoleGroup = 'generation' | 'embedding' | 'extraction' | 'merge';

interface DialogProviderState {
  id: LocalProviderId;
  name: string;
  availableModels: string[];
}

export function useProvidersSettingsPanel() {
  const {
    removeLocalProviderCredential,
    runProviderConnectionTest,
    saveLocalProviderCredential,
    saveProviderRoles,
  } = useProviderCommands();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [dialogProvider, setDialogProvider] = useState<DialogProviderState | null>(null);
  const [dialogStatus, setDialogStatus] = useState<LocalProviderStatus | null>(null);
  const [dialogStatusLoading, setDialogStatusLoading] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResult | 'loading'>>(
    {}
  );
  const [saving, setSaving] = useState(false);

  const fetchProviders = useCallback(async (): Promise<ProviderInfo[]> => {
    const [data, roles] = await Promise.all([fetchProvidersQuery(), fetchProviderRoles()]);
    return reorderByRoles(data, roles);
  }, []);

  const loadProviders = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      setTestResults({});

      const reordered = await fetchProviders();
      setProviders(reordered);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load providers';
      setLoadError(message);
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchProviders]);

  const refreshProvidersSilently = useCallback(async () => {
    const reordered = await fetchProviders();
    setProviders(reordered);
  }, [fetchProviders]);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (!dialogProvider) {
      setDialogStatus(null);
      setDialogStatusLoading(false);
      setDialogError(null);
      return;
    }

    let cancelled = false;
    setDialogStatusLoading(true);
    setDialogError(null);

    void fetchLocalProviderStatus(dialogProvider.id)
      .then((status) => {
        if (cancelled) return;
        setDialogStatus(status);
      })
      .catch((error) => {
        if (cancelled) return;
        setDialogError(error instanceof Error ? error.message : 'Failed to load provider status');
      })
      .finally(() => {
        if (!cancelled) {
          setDialogStatusLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dialogProvider]);

  const handleTest = async (providerId: string) => {
    setTestResults((previous) => ({ ...previous, [providerId]: 'loading' }));
    try {
      const result = await runProviderConnectionTest(providerId);
      setTestResults((previous) => ({ ...previous, [providerId]: result }));
      dispatchProviderCredentialsUpdatedEvent();
    } catch {
      setTestResults((previous) => ({
        ...previous,
        [providerId]: { ok: false, error: 'Connection test failed' },
      }));
    }
  };

  const handleManageCredentials = (provider: ProviderInfo) => {
    const localProviderId = getLocalGenerationProviderId(provider);
    if (!localProviderId) return;

    setDialogStatus(null);
    setDialogError(null);
    setDialogProvider({
      id: localProviderId,
      name: getSettingsProviderName(provider),
      availableModels: provider.available_models ?? [],
    });
  };

  const closeDialog = () => {
    setDialogProvider(null);
  };

  const handleDialogSave = async (input: LocalProviderCredentialInput) => {
    if (!dialogProvider) return;

    setDialogError(null);

    try {
      const status = await saveLocalProviderCredential(dialogProvider.id, input);
      setDialogStatus(status);
      clearTestResultsForLocalProvider(dialogProvider.id, setTestResults);
      dispatchProviderCredentialsUpdatedEvent();
      try {
        await refreshProvidersSilently();
      } catch (error) {
        console.error('Failed to refresh providers after credential save:', error);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save provider credentials';
      setDialogError(message);
      throw error;
    }
  };

  const handleDialogDelete = async () => {
    if (!dialogProvider) return;

    setDialogError(null);

    try {
      const status = await removeLocalProviderCredential(dialogProvider.id);
      setDialogStatus(status);
      clearTestResultsForLocalProvider(dialogProvider.id, setTestResults);
      dispatchProviderCredentialsUpdatedEvent();
      try {
        await refreshProvidersSilently();
      } catch (error) {
        console.error('Failed to refresh providers after credential removal:', error);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to remove provider credentials';
      setDialogError(message);
      throw error;
    }
  };

  const handleReorder = async (role: RoleGroup, oldIndex: number, newIndex: number) => {
    const roleProviders = providers.filter(
      (provider) => provider.role === role && provider.configured
    );
    const reordered = arrayMove(roleProviders, oldIndex, newIndex);

    setProviders((previous) => {
      const others = previous.filter((provider) => provider.role !== role || !provider.configured);
      const unconfigured = previous.filter(
        (provider) => provider.role === role && !provider.configured
      );
      return [...others, ...reordered, ...unconfigured].sort((left, right) => {
        const roleOrder: RoleGroup[] = ['generation', 'embedding', 'extraction', 'merge'];
        const leftRole = roleOrder.indexOf(left.role as RoleGroup);
        const rightRole = roleOrder.indexOf(right.role as RoleGroup);
        if (leftRole !== rightRole) return leftRole - rightRole;
        if (left.configured !== right.configured) return left.configured ? -1 : 1;
        return 0;
      });
    });

    try {
      setSaving(true);
      const grouped = groupByRole(providers);
      grouped[role] = [
        ...reordered,
        ...providers.filter((provider) => provider.role === role && !provider.configured),
      ];

      const roles: RoleAssignment[] = Object.entries(grouped).map(([name, roleProvidersForSave]) => ({
        role: name,
        provider_ids: roleProvidersForSave
          .filter((provider) => provider.configured)
          .map((provider) => provider.id),
      }));

      await saveProviderRoles(roles);
    } catch (error) {
      console.error('Failed to save provider order:', error);
      await loadProviders();
    } finally {
      setSaving(false);
    }
  };

  return {
    closeDialog,
    dialogError,
    dialogProvider,
    dialogStatus,
    dialogStatusLoading,
    groupedProviders: groupByRole(providers),
    handleDialogDelete,
    handleDialogSave,
    handleManageCredentials,
    handleReorder,
    handleTest,
    loadError,
    loadProviders,
    loading,
    providers,
    saving,
    testResults,
  };
}

function groupByRole(providers: ProviderInfo[]): Record<RoleGroup, ProviderInfo[]> {
  return providers.reduce(
    (accumulator, provider) => {
      const role = provider.role as RoleGroup;
      if (!accumulator[role]) {
        accumulator[role] = [];
      }
      accumulator[role].push(provider);
      return accumulator;
    },
    {} as Record<RoleGroup, ProviderInfo[]>
  );
}

function reorderByRoles(providers: ProviderInfo[], roles: RoleAssignment[]): ProviderInfo[] {
  const roleMap = new Map<string, string[]>();
  for (const role of roles) {
    roleMap.set(role.role, role.provider_ids);
  }

  const orderedProviders: ProviderInfo[] = [];
  const used = new Set<string>();
  const roleOrder: RoleGroup[] = ['generation', 'embedding', 'extraction', 'merge'];

  for (const role of roleOrder) {
    const savedOrder = roleMap.get(role) ?? [];
    const roleProviders = providers.filter((provider) => provider.role === role);

    for (const providerId of savedOrder) {
      const provider = roleProviders.find((candidate) => candidate.id === providerId);
      if (provider && !used.has(provider.id)) {
        orderedProviders.push(provider);
        used.add(provider.id);
      }
    }

    for (const provider of roleProviders) {
      if (!used.has(provider.id)) {
        orderedProviders.push(provider);
        used.add(provider.id);
      }
    }
  }

  return orderedProviders;
}

export function getLocalGenerationProviderId(provider: ProviderInfo): LocalProviderId | null {
  if (provider.role !== 'generation') return null;
  return toLocalProviderId(provider.id);
}

export function getSettingsProviderName(provider: ProviderInfo): string {
  const localProviderId = getLocalGenerationProviderId(provider);
  if (localProviderId === 'google') return 'Google';
  return provider.name;
}

function clearTestResultsForLocalProvider(
  providerId: LocalProviderId,
  setTestResults: Dispatch<SetStateAction<Record<string, TestConnectionResult | 'loading'>>>
) {
  setTestResults((previous) => {
    const next = { ...previous };

    for (const key of Object.keys(next)) {
      if (toLocalProviderId(key) === providerId) {
        delete next[key];
      }
    }

    return next;
  });
}

export type {
  DialogProviderState,
  LocalProviderCredentialInput,
  LocalProviderId,
  ProviderInfo,
  TestConnectionResult,
};
