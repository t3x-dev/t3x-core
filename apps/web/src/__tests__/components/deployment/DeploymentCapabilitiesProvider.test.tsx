// @vitest-environment jsdom

import '@testing-library/jest-dom';
import {
  type DeploymentCapabilities,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeploymentCapabilitiesProvider,
  useDeploymentCapabilities,
} from '@/components/deployment/DeploymentCapabilitiesProvider';

const { mockGetDeploymentCapabilities } = vi.hoisted(() => ({
  mockGetDeploymentCapabilities: vi.fn(),
}));

vi.mock('@/queries/deploymentCapabilities', () => ({
  fetchDeploymentCapabilities: mockGetDeploymentCapabilities,
}));

const MANAGED_CAPABILITIES: DeploymentCapabilities = {
  version: 1,
  deployment_mode: 'managed',
  provider_credentials: { administration: 'disabled' },
  inference: { mode: 'managed' },
  identity: {
    mode: 'managed',
    auth_operations: ['sign_in', 'sign_out'],
    account_operations: ['read', 'update'],
    namespaces: true,
  },
  usage: { mode: 'credits' },
  ui_extensions: { account: true, billing: true },
};

function Probe() {
  const state = useDeploymentCapabilities();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="mode">{state.capabilities.deployment_mode}</span>
      <span data-testid="provider-admin">
        {state.canAdministerProviderCredentials ? 'enabled' : 'disabled'}
      </span>
    </div>
  );
}

describe('DeploymentCapabilitiesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a validated initial self-hosted contract without refetching', () => {
    render(
      <DeploymentCapabilitiesProvider initialCapabilities={SELF_HOSTED_DEPLOYMENT_CAPABILITIES}>
        <Probe />
      </DeploymentCapabilitiesProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByTestId('mode')).toHaveTextContent('self_hosted');
    expect(screen.getByTestId('provider-admin')).toHaveTextContent('enabled');
    expect(mockGetDeploymentCapabilities).not.toHaveBeenCalled();
  });

  it('loads managed capabilities through the shared runtime-validating client', async () => {
    mockGetDeploymentCapabilities.mockResolvedValue(MANAGED_CAPABILITIES);

    render(
      <DeploymentCapabilitiesProvider>
        <Probe />
      </DeploymentCapabilitiesProvider>
    );

    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('mode')).toHaveTextContent('managed');
    expect(screen.getByTestId('provider-admin')).toHaveTextContent('disabled');
  });

  it('fails closed when capability discovery rejects', async () => {
    mockGetDeploymentCapabilities.mockRejectedValue(new Error('incompatible capability version'));

    render(
      <DeploymentCapabilitiesProvider>
        <Probe />
      </DeploymentCapabilitiesProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    expect(screen.getByTestId('mode')).toHaveTextContent(
      UNAVAILABLE_DEPLOYMENT_CAPABILITIES.deployment_mode
    );
    expect(screen.getByTestId('provider-admin')).toHaveTextContent('disabled');
  });
});
