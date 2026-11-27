// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AgentConsent } from '@/components/project/agent-access/AgentConsent';
import type { DelegationConsent } from '@/domain/mcpDelegation';

const api = vi.hoisted(() => ({ read: vi.fn(), decide: vi.fn() }));
vi.mock('@/infrastructure/mcpDelegations', () => ({
  readDelegationConsent: api.read,
  decideDelegationConsent: api.decide,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
const repo = { id: 'project-one', name: 'Studio/Calendar' };
const selected = {
  ...repo,
  branch: 'main',
  outcome: 'eligible' as const,
  detail: 'Can commit its changes after checks pass.',
};
const preview: DelegationConsent = {
  status: 'pending',
  previewVersion: 'preview-1',
  account: { id: 'user-one', name: 'Maya' },
  mode: 'commit',
  days: 7,
  branchOnly: false,
  priorGrant: null,
  preselections: [],
  clientName: 'Editorial agent',
  repositories: [repo],
  repositoryLocked: true,
  selected,
  scope: 'commit',
};

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(
    null,
    '',
    '/settings/agent-access/authorize?client_id=one&state=pending'
  );
  api.read.mockResolvedValue(preview);
  // Use an in-document callback in jsdom. The destination comes only from the server.
  api.decide.mockResolvedValue({ redirectTo: window.location.href + '#registered-client' });
});

it('displays the resolved client and locked repository with one confirmation', async () => {
  render(<AgentConsent />);
  expect(
    await screen.findByRole('heading', { name: 'Let Editorial agent work on Calendar?' })
  ).toBeVisible();
  expect(screen.getByText('Studio/Calendar')).toBeVisible();
  expect(screen.queryByLabelText('Repository')).toBeNull();
  expect(screen.getByText('7 days')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Authorize and start' }));
  await waitFor(() =>
    expect(api.decide).toHaveBeenCalledWith('client_id=one&state=pending', {
      decision: 'approve',
      previewVersion: 'preview-1',
      projectId: 'project-one',
      branch: 'main',
      mode: 'commit',
      days: 7,
      branchOnly: false,
    })
  );
  await waitFor(() => expect(window.location.hash).toBe('#registered-client'));
});

it('loads a picked repository and displays its independent reviewer before authorizing', async () => {
  api.read
    .mockResolvedValueOnce({ ...preview, repositoryLocked: false, selected: null })
    .mockResolvedValueOnce({
      ...preview,
      repositoryLocked: false,
      selected: {
        ...selected,
        outcome: 'protected',
        detail: 'An independent reviewer must approve each change.',
      },
      scope: 'prepare',
      mode: 'prepare',
    })
    .mockResolvedValueOnce({
      ...preview,
      repositoryLocked: false,
      scope: 'prepare',
      mode: 'read',
      previewVersion: 'narrower',
      selected: { ...selected, detail: 'The requested access covers reading content and history.' },
    });
  render(<AgentConsent />);
  expect(await screen.findByRole('heading', { name: 'Choose a repository' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Authorize and start' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Repository'), { target: { value: repo.id } });
  expect(
    await screen.findByText('An independent reviewer must approve each change.')
  ).toBeVisible();
  fireEvent.click(screen.getByText('Advanced settings'));
  expect(screen.queryByRole('option', { name: 'Submit eligible changes' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Agent actions'), { target: { value: 'read' } });
  expect(await screen.findByText('Read this repository.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Authorize and start' }));
  await waitFor(() =>
    expect(api.decide).toHaveBeenCalledWith(
      'client_id=one&state=pending&projectId=project-one&requestedMode=read',
      expect.objectContaining({ mode: 'read', projectId: repo.id, previewVersion: 'narrower' })
    )
  );
});

it('can cancel before choosing a repository', async () => {
  api.read.mockResolvedValue({ ...preview, repositoryLocked: false, selected: null });
  render(<AgentConsent />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(api.decide).toHaveBeenCalledWith(
    'client_id=one&state=pending',
    expect.objectContaining({ decision: 'cancel' })
  );
});

it('keeps a refused request on the page, without trusting an incoming redirect', async () => {
  window.history.replaceState(
    null,
    '',
    '?client_id=unknown&redirect_uri=https%3A%2F%2Fexample.com'
  );
  api.read.mockRejectedValue(new Error('Unknown client.'));
  render(<AgentConsent />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unknown client.');
  expect(screen.queryByRole('button', { name: 'Authorize and start' })).toBeNull();
  expect(api.decide).not.toHaveBeenCalled();
});

it('restores the exact consent request after a stale login session', async () => {
  api.read.mockRejectedValue(
    Object.assign(new Error('Sign in again.'), { code: 'UNAUTHENTICATED' })
  );
  render(<AgentConsent />);
  const retry = new URL(
    (await screen.findByRole('link', { name: 'Sign in to continue' })).getAttribute('href')!,
    location.origin
  );
  expect(retry.pathname).toBe('/login');
  expect(retry.searchParams.get('callbackUrl')).toBe(
    '/settings/agent-access/authorize?client_id=one&state=pending'
  );
});

it('shows the missing-policy limit for an organization and the first-Schema condition for an empty repository', async () => {
  api.read.mockResolvedValueOnce({
    ...preview,
    selected: {
      ...selected,
      outcome: 'draft_only',
      detail:
        'A repository administrator must configure a branch acceptance policy before a fixed Review.',
    },
  });
  const org = render(<AgentConsent />);
  expect(
    await screen.findByText(/administrator must configure a branch acceptance policy/)
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Authorize and start' })).toBeEnabled();
  org.unmount();
  api.read.mockResolvedValueOnce({
    ...preview,
    selected: { ...selected, detail: 'The first content commit needs a selected Schema.' },
  });
  render(<AgentConsent />);
  expect(
    await screen.findByText('The first content commit needs a selected Schema.')
  ).toBeVisible();
});

it('keeps the Schema prerequisite visible when a user narrows eligible changes to human review', async () => {
  api.read
    .mockResolvedValueOnce({
      ...preview,
      selected: { ...selected, readinessDetail: 'The first Schema needs your approval.' },
    })
    .mockResolvedValueOnce({
      ...preview,
      mode: 'prepare',
      selected: {
        ...selected,
        detail: 'You decide which changes to commit.',
        readinessDetail: 'The first Schema needs your approval.',
      },
    });
  render(<AgentConsent />);
  fireEvent.click(await screen.findByText('Advanced settings'));
  fireEvent.change(screen.getByLabelText('Agent actions'), { target: { value: 'prepare' } });
  expect(await screen.findByText(/first Schema needs your approval/)).toHaveTextContent(
    'You decide which changes to commit.'
  );
  expect(screen.queryByText(/Can commit its changes after checks pass/)).toBeNull();
});

it('reloads a conflicting preview and stops decisions on the cancelled attempt', async () => {
  api.read.mockResolvedValueOnce(preview).mockResolvedValueOnce({
    ...preview,
    status: 'cancelled',
    previewVersion: null,
    selected: null,
  });
  api.decide.mockRejectedValueOnce(
    Object.assign(new Error('Changed.'), { code: 'PREVIEW_CONFLICT' })
  );
  render(<AgentConsent />);
  fireEvent.click(await screen.findByRole('button', { name: 'Authorize and start' }));
  expect(await screen.findByText(/Authorization cancelled/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Authorize and start' })).toBeNull();
  expect(api.decide).toHaveBeenCalledOnce();
});

it('withdraws the old preview while a changed writable scope is awaiting the server', async () => {
  let resolvePreview!: (preview: DelegationConsent) => void;
  const next = new Promise<DelegationConsent>((resolve) => {
    resolvePreview = resolve;
  });
  api.read.mockResolvedValueOnce(preview).mockReturnValueOnce(next);
  render(<AgentConsent />);
  fireEvent.click(await screen.findByText('Advanced settings'));
  fireEvent.change(screen.getByLabelText('Writable branches'), { target: { value: 'current' } });
  expect(screen.queryByRole('button', { name: 'Authorize and start' })).toBeNull();
  await act(async () =>
    resolvePreview({ ...preview, branchOnly: true, previewVersion: 'single-branch' })
  );
  expect(await screen.findByText('Read this repository. Edit content only on main.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Authorize and start' }));
  await waitFor(() =>
    expect(api.decide.mock.lastCall?.[1]).toMatchObject({
      previewVersion: 'single-branch',
      branchOnly: true,
    })
  );
});

it('shows the receiving account and replacement and requires a deliberate choice of a saved selection', async () => {
  window.history.replaceState(null, '', '?client_id=one&task=private-instruction&useSelection=sel');
  api.read.mockResolvedValue({
    ...preview,
    priorGrant: { id: 'replacement', clientName: 'Editorial agent' },
    preselections: [{ id: 'sel', projectId: repo.id, repository: repo.name, branch: 'editorial' }],
  });
  render(<AgentConsent />);
  const saved = await screen.findByLabelText('Use this saved selection');
  expect(saved).toHaveValue('');
  expect(screen.getByText('Maya')).toBeVisible();
  expect(screen.getByText(/replaces Editorial agent/)).toBeVisible();
  expect(screen.queryByText('private-instruction')).toBeNull();
  expect(api.read.mock.calls[0][0]).toBe('client_id=one');
  fireEvent.change(saved, { target: { value: 'sel' } });
  await waitFor(() => expect(api.read.mock.lastCall?.[0]).toBe('client_id=one&useSelection=sel'));
});
