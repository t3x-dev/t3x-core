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

    fireEvent.click(screen.getByRole('tab', { name: /Validation/ }));

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
      expect(screen.getByRole('heading', { name: 'Restored backend draft' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Validation/ }));

    expect(screen.getAllByText('Schema review').length).toBeGreaterThan(0);
    expect(screen.getByText('Loaded from persisted workspace state.')).toBeInTheDocument();
  });

  it('keeps uploaded material sources when restoring a persisted workspace draft', async () => {
    const [baseWorkspace] = getWorkspacePreviewCandidates('proj_other');
    fetchMaterialsByProjectMock.mockResolvedValueOnce([
      {
        id: 'mat_uploaded_doc',
        project_id: 'proj_other',
        source_type: 'document',
        title: 'uploaded-brief.docx',
        filename: 'uploaded-brief.docx',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        content_hash: 'abc123',
        content_excerpt: 'Uploaded material should remain visible.',
        token_estimate: 8,
        metadata: {},
        created_at: '2026-07-15T00:00:00.000Z',
        archived_at: null,
        created_by: null,
      },
    ]);
    fetchProjectWorkspacesMock.mockResolvedValueOnce([
      {
        ...baseWorkspace,
        sourceBundle: [],
        title: 'Restored backend draft',
      },
    ]);

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Restored backend draft' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('uploaded-brief.docx').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 doc').length).toBeGreaterThan(0);
  });

  it('shows pasted text materials as manageable text sources', async () => {
    fetchMaterialsByProjectMock.mockResolvedValueOnce([
      {
        id: 'mat_pasted_text',
        project_id: 'proj_other',
        source_type: 'document',
        title: 'audience-note.txt',
        filename: 'audience-note.txt',
        mime_type: 'text/plain',
        content_hash: 'hash_pasted_text',
        content_excerpt: 'Audience: Product reviewers and engineering owners.',
        token_estimate: 8,
        metadata: {},
        created_at: '2026-07-15T00:00:00.000Z',
        archived_at: null,
        created_by: null,
      },
    ]);

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    await waitFor(() => {
      expect(screen.getAllByText('audience-note.txt').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('1 text').length).toBeGreaterThan(0);
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete audience-note.txt' })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('tab', { name: /Validation/ }));

    expect(screen.getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
  });
});
