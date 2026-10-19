'use client';

import {
  type DeploymentCapabilities,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { createContext, useCallback, useContext, useMemo } from 'react';
import { useProviderAdministration } from '@/hooks/providers/useProviderAdministration';
import {
  type DeploymentCapabilitiesStatus,
  useDeploymentCapabilitiesState,
} from '@/hooks/shared/useDeploymentCapabilitiesState';

export interface DeploymentCapabilitiesState {
  capabilities: DeploymentCapabilities;
  status: DeploymentCapabilitiesStatus;
  canAdministerProviderCredentials: boolean;
  administrationStatus: DeploymentCapabilitiesStatus;
  refresh: () => void;
}

const FAIL_CLOSED_STATE: DeploymentCapabilitiesState = Object.freeze({
  capabilities: UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
  status: 'error',
  canAdministerProviderCredentials: false,
  administrationStatus: 'error',
  refresh: () => {},
});

const DeploymentCapabilitiesContext = createContext<DeploymentCapabilitiesState>(FAIL_CLOSED_STATE);

export function DeploymentCapabilitiesProvider({
  children,
  initialCapabilities,
}: {
  children: React.ReactNode;
  initialCapabilities?: DeploymentCapabilities;
}) {
  const state = useDeploymentCapabilitiesState(initialCapabilities);

  const permitsLocal =
    state.status === 'ready' && state.capabilities.provider_credentials.administration === 'local';
  const authority = useProviderAdministration(permitsLocal);
  const { refresh: refreshDeployment } = state;
  const { refresh: refreshAuthority } = authority;
  const refresh = useCallback(() => {
    refreshDeployment();
    refreshAuthority();
  }, [refreshDeployment, refreshAuthority]);
  const value = useMemo<DeploymentCapabilitiesState>(
    () => ({
      ...state,
      canAdministerProviderCredentials:
        permitsLocal && authority.status === 'ready' && authority.operator,
      administrationStatus: permitsLocal ? authority.status : state.status,
      refresh,
    }),
    [state, authority.status, authority.operator, permitsLocal, refresh]
  );

  return (
    <DeploymentCapabilitiesContext.Provider value={value}>
      {children}
    </DeploymentCapabilitiesContext.Provider>
  );
}

/** Missing provider context is deliberately unavailable rather than permissive. */
export function useDeploymentCapabilities(): DeploymentCapabilitiesState {
  return useContext(DeploymentCapabilitiesContext);
}
