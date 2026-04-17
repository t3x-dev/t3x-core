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

export function fetchProviders(): Promise<ProviderInfo[]> {
  return listProviders();
}

export function fetchProviderRoles(): Promise<RoleAssignment[]> {
  return getProviderRoles();
}

export function fetchProjectProviderConfig(
  projectId: string
): Promise<ProjectProviderConfig | null> {
  return getProjectProviderConfig(projectId);
}
