/**
 * commands/providers — aggregate provider mutation module.
 */

import {
  deleteLocalProvider,
  type ProjectProviderConfig,
  type RoleAssignment,
  type TestConnectionResult,
  testProvider,
  updateProjectProviderConfig,
  updateProviderRoles,
  upsertLocalProvider,
} from '@/infrastructure/misc';
import type {
  LocalProviderCredentialInput,
  LocalProviderId,
  LocalProviderStatus,
} from '@/infrastructure/types';

export function saveLocalProviderCredential(
  providerId: LocalProviderId | string,
  input: LocalProviderCredentialInput
): Promise<LocalProviderStatus> {
  return upsertLocalProvider(providerId, input);
}

export function removeLocalProviderCredential(
  providerId: LocalProviderId | string
): Promise<LocalProviderStatus> {
  return deleteLocalProvider(providerId);
}

export function runProviderConnectionTest(providerId: string): Promise<TestConnectionResult> {
  return testProvider(providerId);
}

export function saveProviderRoles(roles: RoleAssignment[]): Promise<RoleAssignment[]> {
  return updateProviderRoles(roles);
}

export function saveProjectProviderConfig(
  projectId: string,
  config: ProjectProviderConfig | null
): Promise<ProjectProviderConfig | null> {
  return updateProjectProviderConfig(projectId, config);
}

export type {
  LocalProviderCredentialInput,
  LocalProviderId,
  LocalProviderStatus,
  ProjectProviderConfig,
  RoleAssignment,
  TestConnectionResult,
};
