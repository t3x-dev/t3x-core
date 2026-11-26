// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ProjectSettingsPage from '@/app/project/[projectId]/settings/page';
import { repositoryAgentAccessHref } from '@/domain/project/repoPath';

const repository = vi.hoisted(() => ({
  project_id: 'repo-1',
  name: 'Calendar',
  namespace: 'editor',
  can_edit: true,
  can_manage_agent_access: true,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: repository.project_id }),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/hooks/projects/useProjectSettings', () => ({
  useProjectSettings: () => ({ project: repository, loading: false, error: null }),
}));

const grants = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), update: vi.fn() }));
vi.mock('@/infrastructure/mcpDelegations', () => ({
  readRepositoryDelegations: grants.list,
  updateRepositoryDelegation: grants.update,
  revokeRepositoryDelegation: grants.revoke,
}));

const grant = {
  id: 'grant-1',
  clientName: 'Calendar agent',
  mode: 'commit',
  branch: 'release/v2',
  expiresAt: '2030-11-26T10:00:00Z',
  revoked: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  repository.can_edit = true;
  repository.can_manage_agent_access = true;
  grants.list.mockResolvedValue({ grants: [grant] });
  window.history.replaceState(
    null,
    '',
    repositoryAgentAccessHref('/editor/calendar', 'release/v2')
  );
});

it('opens repository-scoped management and reads the revocation result from the server', async () => {
  grants.list
    .mockResolvedValueOnce({ grants: [grant] })
    .mockResolvedValueOnce({ grants: [{ ...grant, revoked: true }] });
  render(<ProjectSettingsPage />);
  expect(await screen.findByRole('heading', { name: 'Agent access' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'editor/Calendar' })).toHaveAttribute(
    'href',
    '/editor/calendar/branches/release%2Fv2'
  );
  expect(await screen.findByRole('heading', { name: 'Calendar agent' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Connect an Agent' })).toHaveAttribute(
    'href',
    '/settings/agent-access?projectId=repo-1&branch=release%2Fv2'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  expect(grants.revoke).toHaveBeenCalledWith('repo-1', 'grant-1');
  expect(await screen.findByText(/Revoked ·/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Revoke access' })).toBeNull();
});

it('preserves access after a failed edit and offers its error for recovery', async () => {
  grants.update.mockRejectedValue(new Error('This branch no longer exists.'));
  render(<ProjectSettingsPage />);
  fireEvent.click(await screen.findByText('Edit or renew access'));
  fireEvent.change(screen.getByLabelText('Agent actions'), { target: { value: 'prepare' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save access' }));
  await waitFor(() =>
    expect(grants.update).toHaveBeenCalledWith('repo-1', 'grant-1', {
      mode: 'prepare',
      days: 7,
      branch: 'release/v2',
    })
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('This branch no longer exists.');
  expect(screen.getByText('Active · Submit eligible changes')).toBeVisible();
});

it('keeps an editor without delegation authority out of agent management through a direct link', async () => {
  repository.can_manage_agent_access = false;
  render(<ProjectSettingsPage />);
  expect(await screen.findByRole('heading', { name: 'Agent access unavailable' })).toBeVisible();
  expect(grants.list).not.toHaveBeenCalled();
});

it('completes a legacy branch policy without asking to issue or expand a credential', async () => {
  grants.list
    .mockResolvedValueOnce({
      grants: [{ ...grant, expiresAt: null, branch: null, needsPolicy: true }],
    })
    .mockResolvedValueOnce({ grants: [grant] });
  render(<ProjectSettingsPage />);
  expect(await screen.findByText(/Any saved Draft is preserved/)).toBeVisible();
  expect(screen.getByText(/No expiry/)).toBeVisible();
  expect(screen.queryByText('Edit or renew access')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Complete authorization' }));
  expect(grants.update).toHaveBeenCalledWith('repo-1', 'grant-1', {
    repair: true,
    branch: 'release/v2',
  });
  expect(await screen.findByText('Edit or renew access')).toBeVisible();
});

it('offers renewal within a day of expiry and keeps the existing branch when narrowing to reading', async () => {
  grants.list.mockResolvedValue({
    grants: [{ ...grant, expiresAt: new Date(Date.now() + 1800000).toISOString() }],
  });
  grants.update.mockRejectedValue(new Error('Retry'));
  render(<ProjectSettingsPage />);
  expect(await screen.findByText(/Expires within 24 hours/)).toBeVisible();
  fireEvent.click(screen.getByText('Renew access'));
  expect(screen.getByLabelText('Writable branches')).toBeDisabled();
  expect(screen.getByLabelText('Branch name')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Agent actions'), { target: { value: 'read' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save access' }));
  expect(grants.update).toHaveBeenCalledWith('repo-1', grant.id, {
    mode: 'read',
    days: 7,
    branch: 'release/v2',
  });
});
