/**
 * L3 provider read wrappers. Keep provider-related fetches out of pages/hooks.
 */

import {
  getProjectProviderConfig,
  getProviderRoles,
  listProviders,
  type ProjectProviderConfig,
  type ProviderInfo,
  type RoleAssignment,
} from '@/infrastructure/misc';
import { GENERATION_PROVIDER_ORDER } from '@/types/providers';

const VISIBLE_GENERATION_PROVIDER_IDS = new Set<string>(GENERATION_PROVIDER_ORDER);

function filterVisibleProviderIds(role: string, providerIds: string[]): string[] {
  if (role !== 'generation') return providerIds;
  return providerIds.filter((providerId) => VISIBLE_GENERATION_PROVIDER_IDS.has(providerId));
}

function isVisibleProvider(provider: ProviderInfo): boolean {
  return provider.role !== 'generation' || VISIBLE_GENERATION_PROVIDER_IDS.has(provider.id);
}

export function fetchProviders(): Promise<ProviderInfo[]> {
  return listProviders().then((providers) => providers.filter(isVisibleProvider));
}

export function fetchProviderRoles(): Promise<RoleAssignment[]> {
  return getProviderRoles().then((roles) =>
    roles.map((role) => ({
      ...role,
      provider_ids: filterVisibleProviderIds(role.role, role.provider_ids),
    }))
  );
}

export function fetchProjectProviderConfig(
  projectId: string
): Promise<ProjectProviderConfig | null> {
  return getProjectProviderConfig(projectId);
}
