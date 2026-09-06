// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AddToStudio } from '@/components/schemas/AddToStudio';

const mocks = vi.hoisted(() => ({ push: vi.fn(), add: vi.fn(), items: [] as unknown[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({
    projects: [
      { project_id: 'target', name: 'Target' },
      { project_id: 'other', name: 'Other' },
    ],
  }),
}));
vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({ items: mocks.items, add: mocks.add }),
}));
beforeEach(() => {
  mocks.push.mockReset();
  mocks.add.mockReset().mockResolvedValue({ id: 'saved' });
  mocks.items = [];
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
  fireEvent.click(screen.getByRole('button', { name: 'Add to Studio' }));
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
