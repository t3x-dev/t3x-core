import type { DeploymentCapabilities } from '@t3x-dev/api-client';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

export function fetchDeploymentCapabilities(): Promise<DeploymentCapabilities> {
  return getSharedApiClient().getDeploymentCapabilities();
}
