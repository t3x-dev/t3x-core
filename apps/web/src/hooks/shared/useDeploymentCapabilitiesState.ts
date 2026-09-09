import {
  type DeploymentCapabilities,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { fetchDeploymentCapabilities } from '@/queries/deploymentCapabilities';

export type DeploymentCapabilitiesStatus = 'loading' | 'ready' | 'error';

export function useDeploymentCapabilitiesState(initialCapabilities?: DeploymentCapabilities) {
  const [state, setState] = useState<{
    capabilities: DeploymentCapabilities;
    status: DeploymentCapabilitiesStatus;
  }>(() => ({
    capabilities: initialCapabilities ?? UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
    status: initialCapabilities ? 'ready' : 'loading',
  }));

  useEffect(() => {
    if (initialCapabilities) return;

    let cancelled = false;
    void fetchDeploymentCapabilities()
      .then((capabilities) => {
        if (!cancelled) setState({ capabilities, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ capabilities: UNAVAILABLE_DEPLOYMENT_CAPABILITIES, status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialCapabilities]);

  return state;
}
