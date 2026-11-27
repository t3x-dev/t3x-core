// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ConnectAgent } from '@/components/project/agent-access/ConnectAgent';

const api = vi.hoisted(() => ({ choices: vi.fn(), save: vi.fn() }));
vi.mock('@/infrastructure/mcpDelegations', () => ({
  readConnectionChoices: api.choices,
  saveConnectionSelection: api.save,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/settings/agent-access');
  api.choices.mockResolvedValue({
    clients: [{ id: 'registered', name: 'Editorial Agent' }],
    repositories: [{ id: 'project-one', name: 'Studio/Calendar' }],
  });
  api.save.mockResolvedValue({
    id: 'saved',
    expiresAt: '2030-11-26T12:00:00Z',
    launchUrl: null,
    resourceUrl: 'https://editorial.example.test/mcp',
  });
});

it('saves an explicit selection and names the manual connection action for this client', async () => {
  render(<ConnectAgent />);
  const repository = await screen.findByLabelText('Repository');
  expect(api.save).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Continue in client' })).toBeDisabled();
  fireEvent.change(repository, { target: { value: 'project-one' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue in client' }));
  expect(await screen.findByText(/Open Editorial Agent's connection settings/)).toBeVisible();
  expect(screen.getByText('https://editorial.example.test/mcp')).toBeVisible();
  expect(screen.getByText(/On the T3X authorization page/)).toHaveTextContent('reference saved');
  expect(api.save).toHaveBeenCalledWith({
    projectId: 'project-one',
    clientId: 'registered',
    branch: '',
  });
});

it('preserves the repository entry target and offers the registered launch destination', async () => {
  window.history.replaceState(null, '', '?projectId=project-one&branch=release%2Fv2');
  api.save.mockResolvedValue({
    id: 'saved',
    expiresAt: '2030-11-26T12:00:00Z',
    launchUrl: location.href + '#client-start',
  });
  render(<ConnectAgent />);
  expect(await screen.findByLabelText('Repository')).toBeDisabled();
  expect(screen.getByLabelText('Target branch')).toHaveValue('release/v2');
  fireEvent.click(screen.getByRole('button', { name: 'Continue in client' }));
  await waitFor(() => expect(location.hash).toBe('#client-start'));
  expect(api.save).toHaveBeenCalledWith({
    projectId: 'project-one',
    clientId: 'registered',
    branch: 'release/v2',
  });
});

it('keeps an unavailable repository entry from silently selecting another target', async () => {
  window.history.replaceState(null, '', '?projectId=unavailable');
  render(<ConnectAgent />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This repository is unavailable for delegation.'
  );
  expect(screen.queryByRole('button', { name: 'Continue in client' })).toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});

it('recovers an expired browser selection without opening its client link or issuing another selection', async () => {
  api.save.mockResolvedValue({
    id: 'expired',
    expiresAt: new Date(0).toISOString(),
    launchUrl: location.href + '#closed',
  });
  render(<ConnectAgent />);
  fireEvent.change(await screen.findByLabelText('Repository'), {
    target: { value: 'project-one' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue in client' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This selection expired');
  expect(location.hash).toBe('');
  expect(api.save).toHaveBeenCalledOnce();
});

it('offers sign-in when the browser session expires before saving a selection', async () => {
  const ended = Object.assign(new Error('Sign in to T3X.'), { code: 'UNAUTHENTICATED' });
  api.choices
    .mockResolvedValueOnce({
      clients: [{ id: 'one', name: 'Agent' }],
      repositories: [{ id: 'p', name: 'Studio/Plan' }],
    })
    .mockRejectedValue(ended);
  api.save.mockRejectedValue(ended);
  window.history.replaceState(null, '', '?projectId=p&branch=main');
  render(<ConnectAgent />);
  fireEvent.click(await screen.findByRole('button', { name: 'Continue in client' }));
  const login = await screen.findByRole('link', { name: 'Sign in to continue' });
  expect(
    new URL(login.getAttribute('href')!, location.origin).searchParams.get('callbackUrl')
  ).toBe('/settings/agent-access?projectId=p&branch=main');
});
