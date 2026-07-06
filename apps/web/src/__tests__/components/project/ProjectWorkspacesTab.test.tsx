// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';

const replaceMock = vi.fn();
const fetchMaterialsByProjectMock = vi.fn();
const fetchProjectWorkspacesMock = vi.fn();
let searchParamsValue = new URLSearchParams('tab=workspaces');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/queries/materials', () => ({
  fetchMaterialsByProject: (...args: unknown[]) => fetchMaterialsByProjectMock(...args),
}));

vi.mock('@/queries/workspaces', () => ({
  fetchProjectWorkspaces: (...args: unknown[]) => fetchProjectWorkspacesMock(...args),
}));

describe('ProjectWorkspacesTab', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    fetchMaterialsByProjectMock.mockResolvedValue([]);
    fetchProjectWorkspacesMock.mockResolvedValue([]);
    searchParamsValue = new URLSearchParams('tab=workspaces');
  });

  it('selects the workspace from the URL without showing an internal workspace selector', () => {
    searchParamsValue = new URLSearchParams('tab=workspaces&workspace=workspace_release_notes');

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(screen.getByRole('heading', { name: 'Release note cleanup' })).toBeInTheDocument();
    expect(screen.queryByText('Audience chat')).not.toBeInTheDocument();
    expect(screen.queryByText('PRD import')).not.toBeInTheDocument();
    expect(screen.queryByText('Release note outline')).not.toBeInTheDocument();

    const sourceChatTab = screen.getByRole('tab', { name: 'Chat' });
    fireEvent.mouseDown(sourceChatTab, { button: 0, ctrlKey: false });
    fireEvent.click(sourceChatTab);

    expect(screen.getByText('No source chat turns yet.')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Start by importing a document, pasting source text, or adding a manual note.'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'I will keep analysis separate until you mark a turn or material as source evidence.'
      )
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /YSchema/ }));

    expect(screen.getByRole('heading', { name: 'Release note cleanup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Release note cleanup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PRD audience handoff/ })).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('restores a persisted workspace draft over the fixture candidate', async () => {
    const [baseWorkspace] = getWorkspacePreviewCandidates('proj_other');
    fetchProjectWorkspacesMock.mockResolvedValueOnce([
      {
        ...baseWorkspace,
        title: 'Restored backend draft',
        status: 'schema_review',
        schemaCandidate: {
          ...baseWorkspace.schemaCandidate,
          summary: 'Loaded from persisted workspace state.',
        },
      },
    ]);

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Restored backend draft' })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /YSchema/ }));

    expect(screen.getByText('Schema review')).toBeInTheDocument();
    expect(screen.getByText('Loaded from persisted workspace state.')).toBeInTheDocument();
  });

  it('keeps fixture bindings when a legacy workspace draft is missing array fields', async () => {
    const [baseWorkspace] = getWorkspacePreviewCandidates('proj_other');
    const legacyDraft = {
      ...baseWorkspace,
      title: 'Legacy backend draft',
      outputTargets: undefined,
      schemaBindings: undefined,
    } as unknown;
    fetchProjectWorkspacesMock.mockResolvedValueOnce([legacyDraft]);

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Legacy backend draft' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /YSchema/ }));

    expect(screen.getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
  });
});
