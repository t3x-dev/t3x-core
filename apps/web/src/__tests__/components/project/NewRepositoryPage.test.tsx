// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { NewRepositoryPage } from '@/components/project/NewRepositoryPage';

const mocks = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn(), test: vi.fn() }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ owner: 't3x-dev' }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({ accounts: [{ namespace: { slug: 'another-team' } }] }),
}));
vi.mock('@/hooks/shared/useProvidersList', () => ({
  useProvidersList: () => ({
    loading: false,
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        configured: true,
        default_model: 'model-a',
        available_models: ['model-a', 'model-b'],
      },
    ],
  }),
}));
vi.mock('@/hooks/providers/useProviderCommands', () => ({
  useProviderCommands: () => ({ runProviderConnectionTest: mocks.test }),
}));
vi.mock('@/hooks/projects/useRepositorySetup', () => ({
  useRepositorySetup: () => ({ create: mocks.create, pending: false, started: false, error: null }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.test.mockResolvedValue({ ok: true });
});
it('uses dropdowns, single-line description, and file uploads from the reference', () => {
  render(<NewRepositoryPage />);
  for (const name of ['Owner', 'Visibility', 'Connection', 'Model'])
    expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
  expect(screen.getByLabelText('Description').tagName).toBe('INPUT');
  expect(screen.getByLabelText('Upload YAML')).toHaveAttribute('accept', '.yaml,.yml');
  expect(screen.getByRole('button', { name: 'Create and start conversation' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
  expect(screen.getByRole('button', { name: /General/ })).toHaveAttribute('aria-expanded', 'false');
});
it('tests the connection and submits the selected backend configuration and files', async () => {
  mocks.create.mockResolvedValue({
    project: { id: 'p', name: 'Catalog' },
    workspaceId: 'workspace_branch:main',
    conversationId: 'c',
  });
  render(<NewRepositoryPage />);
  fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'Catalog' } });
  fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'another-team' } });
  fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'unlisted' } });
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } });
  const file = new File(['notes'], 'notes.md');
  fireEvent.change(screen.getByLabelText('Upload files'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Test' }));
  await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Create and start conversation' }));
  await waitFor(() =>
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Catalog',
        owner: 'another-team',
        provider: 'openai',
        model: 'model-b',
        visibility: 'unlisted',
        files: [file],
      })
    )
  );
  expect(mocks.test).toHaveBeenCalledWith('openai');
});
it('keeps failed connection tests and invalid uploads from enabling creation', async () => {
  mocks.test.mockResolvedValue({ ok: false, error: 'Invalid key' });
  render(<NewRepositoryPage />);
  fireEvent.change(screen.getByLabelText('Repository name'), { target: { value: 'Catalog' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test' }));
  await screen.findByText('Invalid key');
  fireEvent.change(screen.getByLabelText('Upload YAML'), {
    target: { files: [new File(['x'], 'wrong.txt')] },
  });
  expect(screen.getByText('Choose a supported file, up to 5 MB each.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create and start conversation' })).toBeDisabled();
});
