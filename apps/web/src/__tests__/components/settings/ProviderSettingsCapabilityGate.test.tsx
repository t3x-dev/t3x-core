// @vitest-environment jsdom

import '@testing-library/jest-dom';
import {
  type DeploymentCapabilities,
  SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  UNAVAILABLE_DEPLOYMENT_CAPABILITIES,
} from '@t3x-dev/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeploymentCapabilitiesProvider } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { ProviderSettingsCapabilityGate } from '@/components/settings/ProviderSettingsCapabilityGate';
import { ProviderSettingsOverviewCard } from '@/components/settings/ProviderSettingsOverviewCard';

vi.mock('@/components/settings/ProvidersSettingsPanel', () => ({
  ProvidersSettingsPanel: () => <div>Local provider credential controls</div>,
}));

const MANAGED_CAPABILITIES: DeploymentCapabilities = {
  ...SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
  deployment_mode: 'managed',
  provider_credentials: { administration: 'disabled' },
  inference: { mode: 'managed' },
  identity: {
    ...SELF_HOSTED_DEPLOYMENT_CAPABILITIES.identity,
    mode: 'managed',
    auth_operations: ['sign_in', 'sign_out'],
  },
  usage: { mode: 'credits' },
  ui_extensions: { account: true, billing: true },
};

function renderGate(capabilities: DeploymentCapabilities) {
  return render(
    <DeploymentCapabilitiesProvider initialCapabilities={capabilities}>
      <ProviderSettingsCapabilityGate />
    </DeploymentCapabilitiesProvider>
  );
}

describe('ProviderSettingsCapabilityGate', () => {
  it('renders local credential controls only for self-hosted administration', () => {
    renderGate(SELF_HOSTED_DEPLOYMENT_CAPABILITIES);

    expect(screen.getByText('Local provider credential controls')).toBeInTheDocument();
  });

  it('renders an explanatory managed surface on direct navigation', () => {
    renderGate(MANAGED_CAPABILITIES);

    expect(screen.getByText('Managed inference')).toBeInTheDocument();
    expect(screen.queryByText('Local provider credential controls')).not.toBeInTheDocument();
  });

  it('fails closed when deployment capabilities are unavailable', () => {
    renderGate(UNAVAILABLE_DEPLOYMENT_CAPABILITIES);

    expect(screen.getByRole('alert')).toHaveTextContent('Provider settings unavailable');
    expect(screen.queryByText('Local provider credential controls')).not.toBeInTheDocument();
  });

  it('advertises provider setup on the overview only when local administration is enabled', () => {
    const selfHosted = render(
      <DeploymentCapabilitiesProvider initialCapabilities={SELF_HOSTED_DEPLOYMENT_CAPABILITIES}>
        <ProviderSettingsOverviewCard />
      </DeploymentCapabilitiesProvider>
    );
    expect(screen.getByRole('link', { name: 'AI Providers Configure' })).toBeInTheDocument();

    selfHosted.unmount();
    render(
      <DeploymentCapabilitiesProvider initialCapabilities={MANAGED_CAPABILITIES}>
        <ProviderSettingsOverviewCard />
      </DeploymentCapabilitiesProvider>
    );
    expect(screen.queryByRole('link', { name: 'AI Providers Configure' })).not.toBeInTheDocument();
  });
});
