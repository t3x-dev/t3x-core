// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiTokensSettingsPanel } from '@/components/settings/ApiTokensSettingsPanel';

const mocks = vi.hoisted(() => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock('@/hooks/access/useAccessSettings', () => ({
  useAccessSettings: () => mocks,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const token = {
  id: 'token-1',
  key_prefix: 't3xk_live',
  name: 'Deployment',
  project_id: null,
  created_at: '2026-09-01T09:00:00Z',
  last_used_at: '2026-09-12T13:07:00Z',
  revoked_at: null,
};

beforeEach(() => {
  mocks.listApiKeys.mockReset().mockResolvedValue([token]);
  mocks.createApiKey.mockReset().mockResolvedValue({
    ...token,
    key: 't3xk_secret-value',
  });
  mocks.revokeApiKey.mockReset().mockResolvedValue({ ...token, revoked_at: '2026-09-15' });
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true)
  );
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('ApiTokensSettingsPanel', () => {
  it('shows an honest empty state when the server has no keys', async () => {
    mocks.listApiKeys.mockResolvedValue([]);
    render(<ApiTokensSettingsPanel />);

    expect(await screen.findByText('No API tokens yet.')).toBeVisible();
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
  });
  it('renders live API keys and filters them by search and scope', async () => {
    render(<ApiTokensSettingsPanel />);

    expect((await screen.findAllByText('Deployment'))[0]).toBeVisible();
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'API tokens' })).toBeVisible();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tokens' }), {
      target: { value: 'missing' },
    });
    expect(screen.getByText('No API tokens match these filters.')).toBeVisible();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tokens' }), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Scope' }), {
      target: { value: 'projects' },
    });
    expect(screen.getByText('No API tokens match these filters.')).toBeVisible();
  });

  it('keeps create and revoke wired to the existing API-key commands', async () => {
    render(<ApiTokensSettingsPanel />);
    expect((await screen.findAllByText('Deployment'))[0]).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = screen.getByRole('dialog', { name: 'Create API token' });
    fireEvent.change(within(dialog).getByLabelText('Token name'), {
      target: { value: 'Release automation' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create token' }));

    await waitFor(() =>
      expect(mocks.createApiKey).toHaveBeenCalledWith({ name: 'Release automation' })
    );
    expect(await within(dialog).findByText('t3xk_secret-value')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Deployment' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke token' }));
    await waitFor(() => expect(mocks.revokeApiKey).toHaveBeenCalledWith('token-1'));
  });
});
