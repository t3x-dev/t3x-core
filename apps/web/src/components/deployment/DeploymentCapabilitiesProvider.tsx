'use client';

import {
  type DeploymentCapabilities,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { createContext, useContext, useMemo } from 'react';
import {
  type DeploymentCapabilitiesStatus,
  useDeploymentCapabilitiesState,
} from '@/hooks/shared/useDeploymentCapabilitiesState';

export interface DeploymentCapabilitiesState {
  capabilities: DeploymentCapabilities;
  status: DeploymentCapabilitiesStatus;
  canAdministerProviderCredentials: boolean;
}

const FAIL_CLOSED_STATE: DeploymentCapabilitiesState = Object.freeze({
  capabilities: UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
  status: 'error',
  canAdministerProviderCredentials: false,
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

  const value = useMemo<DeploymentCapabilitiesState>(
    () => ({
      ...state,
      canAdministerProviderCredentials:
        state.status === 'ready' &&
        state.capabilities.provider_credentials.administration === 'local',
    }),
    [state]
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
