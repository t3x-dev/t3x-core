// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AddToStudio } from '@/components/schemas/AddToStudio';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  add: vi.fn(),
  items: [] as unknown[],
  targets: [
    { projectId: 'target', name: 'Target' },
    { projectId: 'other', name: 'Other' },
  ],
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/explore/useExploreData', () => ({
  useSchemaTargets: () => ({ data: { items: mocks.targets, has_more: false } }),
}));
vi.mock('@/hooks/accounts/useNamespaceAccounts', () => ({
  useNamespaceAccounts: () => ({ accounts: [] }),
}));
vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({ items: mocks.items, add: mocks.add }),
}));
beforeEach(() => {
  mocks.push.mockReset();
  mocks.add.mockReset().mockResolvedValue({ id: 'saved' });
  mocks.items = [];
  mocks.targets = [
    { projectId: 'target', name: 'Target' },
    { projectId: 'other', name: 'Other' },
  ];
});
const source = {
  sourceProjectId: 'publisher',
  canonicalName: 'team/definition',
  version: '2.0.0',
  expectedHash: 'sha256:exact',
};
function mount() {
  render(
    <AddToStudio
      source={source}
      title="Definition"
      defaultProjectId="target"
      defaultWorkspaceId="upgrade-work"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use Schema' }));
}
it('carries the reviewed Workspace to Studio without applying the definition', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Add & open Studio' }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      '/project/target?tab=schemas&schemaView=studio&candidate=saved&workspace=upgrade-work'
    )
  );
  expect(mocks.add).toHaveBeenCalledWith(source);
});
it('does not carry a Workspace ID into a different destination project', async () => {
  mount();
  fireEvent.change(screen.getByLabelText('Destination project'), { target: { value: 'other' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add & open Studio' }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      '/project/other?tab=schemas&schemaView=studio&candidate=saved'
    )
  );
});
it('does not reuse a same-name release from another source project', async () => {
  mocks.items = [
    {
      id: 'wrong-owner',
      source: {
        projectId: 'different',
        canonicalName: source.canonicalName,
        version: source.version,
        hash: source.expectedHash,
      },
    },
  ];
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Add & open Studio' }));
  await waitFor(() => expect(mocks.add).toHaveBeenCalledWith(source));
});

it('requires a deliberate destination selection on global Explore and retains the exact return URL', async () => {
  const returnTo =
    '/explore?catalogName=team%2Fdefinition&catalogVersion=2.0.0&catalogHash=sha256%3Aexact';
  render(
    <AddToStudio
      source={source}
      title="Definition"
      defaultProjectId="target"
      defaultWorkspaceId="w"
      branch="main"
      requireSelection
      returnTo={returnTo}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use Schema' }));
  expect(screen.getByLabelText('Destination project')).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Add & open Studio' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Destination project'), { target: { value: 'target' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add & open Studio' }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  const url = new URL(mocks.push.mock.calls[0][0], 'http://local');
  expect(url.searchParams.get('returnTo')).toBe(returnTo);
  expect(url.searchParams.get('workspace')).toBe('w');
  expect(url.searchParams.get('branch')).toBe('main');
});
it('offers creation without an editable target and preserves the release on the new-project link', () => {
  mocks.targets = [];
  render(
    <AddToStudio
      source={source}
      title="Definition"
      defaultProjectId=""
      requireSelection
      returnTo="/explore?catalogName=team%2Fdefinition"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Use Schema' }));
  expect(screen.getByText('You don’t have an editable project yet.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /New project/ })).toHaveAttribute(
    'href',
    '/t3x-dev/new?returnTo=%2Fexplore%3FcatalogName%3Dteam%252Fdefinition'
  );
  expect(mocks.add).not.toHaveBeenCalled();
});
it('revalidates an already-saved release at the server before opening Studio', async () => {
  mocks.items = [
    {
      id: 'saved',
      source: {
        projectId: 'publisher',
        canonicalName: source.canonicalName,
        version: source.version,
        hash: source.expectedHash,
      },
    },
  ];
  mocks.add.mockRejectedValue(new Error('Source no longer authorized'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open Studio' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Source no longer authorized')
  );
  expect(mocks.add).toHaveBeenCalledWith(source);
  expect(mocks.push).not.toHaveBeenCalled();
});
