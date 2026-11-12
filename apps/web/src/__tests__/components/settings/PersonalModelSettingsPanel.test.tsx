// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { SELF_HOSTED_DEPLOYMENT_CAPABILITIES } from '@t3x-dev/api-client';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonalModelSettingsPanel } from '@/components/settings/PersonalModelSettingsPanel';
import { getPersonalModelPreferences, updatePersonalModelPreferences } from '@/infrastructure/auth';
import { ApiError } from '@/infrastructure/core';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ returnTo: '/team/repo/workspaces' }),
}));
vi.mock('@/infrastructure/auth', () => ({
  getPersonalModelPreferences: vi.fn(),
  updatePersonalModelPreferences: vi.fn(),
}));
vi.mock('@/components/deployment/DeploymentCapabilitiesProvider', () => ({
  useDeploymentCapabilities: () => ({
    capabilities: SELF_HOSTED_DEPLOYMENT_CAPABILITIES,
    status: 'ready',
    canAdministerProviderCredentials: true,
  }),
}));

describe('personal model recovery', () => {
  beforeEach(() => vi.resetAllMocks());

  it('explains local mode and offers deployment model access without a login or retry loop', async () => {
    vi.mocked(getPersonalModelPreferences).mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'Identity required', { reason: 'local_auth_disabled' })
    );
    render(<PersonalModelSettingsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent('local authentication is disabled');
    expect(screen.getByRole('link', { name: 'Open deployment model access' })).toHaveAttribute(
      'href',
      expect.stringContaining('/settings/model-access?returnTo=')
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('offers sign-in with a return path when a session expires during save', async () => {
    vi.mocked(getPersonalModelPreferences).mockResolvedValue({
      compose_default: 'gpt-5.4',
      fallback_model: null,
      quick_switcher: [{ model: 'gpt-5.4', visible: true, available: true }],
    });
    vi.mocked(updatePersonalModelPreferences).mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'Session expired')
    );
    render(<PersonalModelSettingsPanel />);
    const save = await screen.findByRole('button', { name: 'Save changes' });
    fireEvent.click(save);

    const signIn = await screen.findByRole('link', { name: 'Sign in' });
    const href = new URL(signIn.getAttribute('href') ?? '', 'http://localhost');
    expect(href.searchParams.get('callbackUrl')).toBe(
      '/settings/providers?returnTo=%2Fteam%2Frepo%2Fworkspaces'
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Your changes have not been saved');
    expect(save).toBeDisabled();
  });

  it('retries a temporary read failure in place', async () => {
    vi.mocked(getPersonalModelPreferences)
      .mockRejectedValueOnce(new ApiError('TIMEOUT', 'Request timed out'))
      .mockResolvedValue({
        compose_default: 'gpt-5.4',
        fallback_model: null,
        quick_switcher: [{ model: 'gpt-5.4', visible: true, available: true }],
      });
    render(<PersonalModelSettingsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
