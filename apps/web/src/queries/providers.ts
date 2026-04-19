/**
 * L3 provider read wrappers. Keep provider-related fetches out of pages/hooks.
 */

import {
  getProjectProviderConfig,
  getProviderRoles,
  listProviders,
  toLocalProviderId as toLocalProviderIdFromInfrastructure,
  type ProjectProviderConfig,
  type ProviderInfo,
  type RoleAssignment,
} from '@/infrastructure/misc';

export function fetchProviders(): Promise<ProviderInfo[]> {
  return listProviders();
}

export function fetchProviderRoles(): Promise<RoleAssignment[]> {
  return getProviderRoles();
}

export function toLocalProviderId(providerId: string) {
  return toLocalProviderIdFromInfrastructure(providerId);
}

export function fetchProjectProviderConfig(
  projectId: string
): Promise<ProjectProviderConfig | null> {
  return getProjectProviderConfig(projectId);
}

export type { ProviderInfo, RoleAssignment };
