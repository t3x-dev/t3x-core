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

  it('requires an Agent project and issues the selected Decision and Commit permissions separately', async () => {
    render(<ApiTokensSettingsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Create token' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Create API token' }));
    fireEvent.change(dialog.getByLabelText('Token type'), { target: { value: 'agent' } });
    fireEvent.change(dialog.getByLabelText('Token name'), { target: { value: ' MCP agent ' } });
    const submit = dialog.getByRole('button', { name: 'Create token' });
    expect(submit).toBeDisabled();
    fireEvent.change(dialog.getByLabelText('Project ID'), { target: { value: ' proj_mcp ' } });
    expect(dialog.getByLabelText('Expires in (days)')).toHaveValue(7);
    expect(dialog.getByRole('checkbox', { name: 'Reject changes' })).not.toBeChecked();
    expect(dialog.getByRole('checkbox', { name: 'Advance branch refs' })).not.toBeChecked();
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Accept changes' }));
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Create commits' }));

    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-23T00:00:00Z'));
    try {
      fireEvent.click(submit);
      await waitFor(() =>
        expect(mocks.createApiKey).toHaveBeenCalledWith({
          name: 'MCP agent',
          principal_kind: 'agent',
          credential_kind: 'agent',
          project_id: 'proj_mcp',
          expires_at: '2026-11-30T00:00:00.000Z',
          transition_scopes: [
            'transition:inspect',
            'transition:propose',
            'transition:verify',
            'transition:decide:accept',
            'transition:commit:create',
          ],
        })
      );
    } finally {
      now.mockRestore();
    }
    expect(await dialog.findByText('t3xk_secret-value')).toBeVisible();
  });
});
