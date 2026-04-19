import { useCallback } from 'react';
import {
  type LocalProviderCredentialInput,
  type LocalProviderId,
  type LocalProviderStatus,
  type ProjectProviderConfig,
  type RoleAssignment,
  removeLocalProviderCredential as removeLocalProviderCredentialCommand,
  runProviderConnectionTest as runProviderConnectionTestCommand,
  saveLocalProviderCredential as saveLocalProviderCredentialCommand,
  saveProjectProviderConfig as saveProjectProviderConfigCommand,
  saveProviderRoles as saveProviderRolesCommand,
  type TestConnectionResult,
} from '@/commands/providers';

export function useProviderCommands() {
  const saveLocalProviderCredential = useCallback(
    (providerId: LocalProviderId | string, input: LocalProviderCredentialInput) =>
      saveLocalProviderCredentialCommand(providerId, input),
    []
  );

  const removeLocalProviderCredential = useCallback(
    (providerId: LocalProviderId | string): Promise<LocalProviderStatus> =>
      removeLocalProviderCredentialCommand(providerId),
    []
  );

  const runProviderConnectionTest = useCallback(
    (providerId: string): Promise<TestConnectionResult> =>
      runProviderConnectionTestCommand(providerId),
    []
  );

  const saveProviderRoles = useCallback(
    (roles: RoleAssignment[]): Promise<RoleAssignment[]> => saveProviderRolesCommand(roles),
    []
  );

  const saveProjectProviderConfig = useCallback(
    (
      projectId: string,
      config: ProjectProviderConfig | null
    ): Promise<ProjectProviderConfig | null> => saveProjectProviderConfigCommand(projectId, config),
    []
  );

  return {
    saveLocalProviderCredential,
    removeLocalProviderCredential,
    runProviderConnectionTest,
    saveProviderRoles,
    saveProjectProviderConfig,
  };
}

export type {
  LocalProviderCredentialInput,
  LocalProviderId,
  LocalProviderStatus,
  ProjectProviderConfig,
  RoleAssignment,
  TestConnectionResult,
};
