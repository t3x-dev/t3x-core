'use client';

import { useCallback } from 'react';
import type { LocalProviderStatus, ProviderInfo, RoleAssignment } from '@/infrastructure';
import { fetchLocalProviderStatus } from '@/queries/providerStatus';
import { fetchProviderRoles, fetchProviders } from '@/queries/providers';

export interface UseProvidersSettingsDataResult {
  fetchProvidersWithRoles: () => Promise<[ProviderInfo[], RoleAssignment[]]>;
  fetchProviderStatus: (providerId: string) => Promise<LocalProviderStatus>;
}

export function useProvidersSettingsData(): UseProvidersSettingsDataResult {
  const fetchProvidersWithRoles = useCallback(
    async (): Promise<[ProviderInfo[], RoleAssignment[]]> =>
      Promise.all([fetchProviders(), fetchProviderRoles()]),
    []
  );

  const fetchProviderStatus = useCallback(
    (providerId: string) => fetchLocalProviderStatus(providerId),
    []
  );

  return { fetchProvidersWithRoles, fetchProviderStatus };
}
