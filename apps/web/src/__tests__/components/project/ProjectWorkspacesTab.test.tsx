// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';
import { getWorkspacePreviewCandidates } from '@/data/workspaceCandidates';
import type { Material } from '@/types/api';

const replaceMock = vi.fn();
const pushMock = vi.fn();
const fetchMaterialsByProjectMock = vi.fn();
const fetchProjectWorkspacesMock = vi.fn();
let searchParamsValue = new URLSearchParams('tab=workspaces');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

vi.mock('next/navigation', () => ({
  usePathname: () => '/t3x-dev/test-project/workspaces',
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
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
    pushMock.mockClear();
    fetchMaterialsByProjectMock.mockResolvedValue([]);
    fetchProjectWorkspacesMock.mockResolvedValue([]);
    searchParamsValue = new URLSearchParams('tab=workspaces');
  });

  it('selects the workspace from the URL without showing an internal workspace selector', async () => {
    searchParamsValue = new URLSearchParams('tab=workspaces&workspace=workspace_release_notes');

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(await screen.findByText('Release note cleanup')).toBeInTheDocument();
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

    expect(screen.getByText('Release note cleanup')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Release note cleanup/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PRD audience handoff/ })).not.toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('strictly resolves the complete State handoff after persisted workspaces load', async () => {
    const [baseWorkspace] = getWorkspacePreviewCandidates('proj_other');
    fetchProjectWorkspacesMock.mockResolvedValueOnce([
      {
        ...baseWorkspace,
        lastCommitHash: 'sha256:branch-head',
        sourceBundle: [
          {
            conversationId: 'conv_branch_head',
            id: 'source_branch_head',
            title: 'Branch HEAD conversation',
            type: 'chat',
          },
        ],
        status: 'committed',
        targetBranch: 'feature/prd-audience',
        title: 'Persisted branch HEAD workspace',
      },
    ]);
    searchParamsValue = new URLSearchParams({
      branch: 'feature/prd-audience',
      commit: 'sha256:branch-head',
      workspace: baseWorkspace.id,
      conversation: 'conv_branch_head',
      sourceView: 'chat',
    });

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading workspaces');
    expect(
      await screen.findByRole('heading', { name: 'Persisted branch HEAD workspace' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { name: 'Choose a workspace' })).not.toBeInTheDocument();
  });

  it('shows the requested historical branch record when the logical workspace draft has moved', async () => {
    const [baseWorkspace] = getWorkspacePreviewCandidates('proj_other');
    fetchProjectWorkspacesMock.mockResolvedValueOnce([
      {
        ...baseWorkspace,
        baseCommitHash: 'sha256:newer-head',
        sourceBundle: [
          {
            conversationId: 'conv_newer',
            id: 'source_newer',
            title: 'Newer branch conversation',
            type: 'chat',
          },
        ],
        status: 'draft',
        targetBranch: 'feature/newer',
      },
    ]);
    searchParamsValue = new URLSearchParams({
      branch: 'feature/older',
      commit: 'sha256:older-head',
      workspace: baseWorkspace.id,
      conversation: 'conv_older',
      sourceView: 'chat',
    });

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(
      await screen.findByRole('heading', { name: 'PRD audience handoff' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: /Commit/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'View in State' }));
    expect(pushMock).toHaveBeenCalledWith(
      '/t3x-dev/test-project?branch=feature%2Folder&commit=sha256%3Aolder-head&view=canvas'
    );
  });

  it('prompts for selection when branch and commit match more than one workspace', async () => {
    const [baseWorkspace] = getWorkspacePreviewCandidates('proj_other');
    fetchProjectWorkspacesMock.mockResolvedValueOnce([
      {
        ...baseWorkspace,
        lastCommitHash: 'sha256:shared-head',
        status: 'committed',
        targetBranch: 'feature/shared',
        title: 'Shared workspace one',
      },
      {
        ...baseWorkspace,
        id: 'workspace_shared_two',
        lastCommitHash: 'sha256:shared-head',
        status: 'committed',
        targetBranch: 'feature/shared',
        title: 'Shared workspace two',
      },
    ]);
    searchParamsValue = new URLSearchParams({
      branch: 'feature/shared',
      commit: 'sha256:shared-head',
      sourceView: 'chat',
    });

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(await screen.findByRole('heading', { name: 'Choose a workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Workspace detail' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Shared workspace one/ }));
    expect(replaceMock).toHaveBeenCalledWith(
      '?branch=feature%2Fshared&commit=sha256%3Ashared-head&workspace=workspace_prd_handoff&sourceView=chat',
      { scroll: false }
    );
  });

  it('does not fall back to the first candidate for an unknown explicit workspace', async () => {
    searchParamsValue = new URLSearchParams({ workspace: 'workspace_missing' });

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(await screen.findByRole('heading', { name: 'Choose a workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Workspace detail' })).not.toBeInTheDocument();
  });

  it('restores a persisted workspace draft title over the fixture candidate', async () => {
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

    expect(screen.queryByRole('heading', { name: 'PRD audience handoff' })).not.toBeInTheDocument();
  });

  it('does not expose project A workspaces or materials while project B initializes', async () => {
    const [projectAPreview] = getWorkspacePreviewCandidates('proj_a');
    const [projectBPreview] = getWorkspacePreviewCandidates('proj_b');
    const projectBWorkspaces = deferred<ReturnType<typeof getWorkspacePreviewCandidates>>();
    const projectBMaterials = deferred<Material[]>();
    fetchProjectWorkspacesMock
      .mockResolvedValueOnce([
        {
          ...projectAPreview,
          title: 'Project A persisted workspace',
        },
      ])
      .mockReturnValueOnce(projectBWorkspaces.promise);
    fetchMaterialsByProjectMock
      .mockResolvedValueOnce([
        {
          id: 'mat_project_a',
          project_id: 'proj_a',
          source_type: 'document',
          title: 'project-a-only.docx',
          filename: 'project-a-only.docx',
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content_hash: 'hash_project_a',
          content_excerpt: 'Only project A should see this material.',
          token_estimate: 8,
          metadata: {},
          created_at: '2026-07-15T00:00:00.000Z',
          archived_at: null,
          created_by: null,
        },
      ])
      .mockReturnValueOnce(projectBMaterials.promise);

    const { rerender } = render(<ProjectWorkspacesTab projectId="proj_a" />);

    expect(
      await screen.findByRole('heading', { name: 'Project A persisted workspace' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('project-a-only.docx').length).toBeGreaterThan(0);

    rerender(<ProjectWorkspacesTab projectId="proj_b" />);

    expect(screen.getByRole('heading', { name: 'PRD audience handoff' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Project A persisted workspace' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('project-a-only.docx')).not.toBeInTheDocument();

    await act(async () => {
      projectBWorkspaces.resolve([
        {
          ...projectBPreview,
          title: 'Project B persisted workspace',
        },
      ]);
      await projectBWorkspaces.promise;
    });

    expect(
      await screen.findByRole('heading', { name: 'Project B persisted workspace' })
    ).toBeInTheDocument();
    expect(screen.queryByText('project-a-only.docx')).not.toBeInTheDocument();

    await act(async () => {
      projectBMaterials.resolve([
        {
          id: 'mat_project_b',
          project_id: 'proj_b',
          source_type: 'document',
          title: 'project-b-only.docx',
          filename: 'project-b-only.docx',
          mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content_hash: 'hash_project_b',
          content_excerpt: 'Only project B should see this material.',
          token_estimate: 8,
          metadata: {},
          created_at: '2026-07-15T00:00:00.000Z',
          archived_at: null,
          created_by: null,
        },
      ]);
      await projectBMaterials.promise;
    });

    expect((await screen.findAllByText('project-b-only.docx')).length).toBeGreaterThan(0);
    expect(screen.queryByText('project-a-only.docx')).not.toBeInTheDocument();
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

  it('routes View in State to Canvas with the committed branch and commit selected', async () => {
    const [baseWorkspace] = getWorkspacePreviewCandidates('proj_other');
    fetchProjectWorkspacesMock.mockResolvedValueOnce([
      {
        ...baseWorkspace,
        lastCommitHash: 'sha256:workspace-commit',
        status: 'committed',
        targetBranch: 'feature/prd-audience',
      },
    ]);

    render(<ProjectWorkspacesTab projectId="proj_other" />);

    fireEvent.click(screen.getByRole('tab', { name: /Commit/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'View in State' }));

    expect(pushMock).toHaveBeenCalledWith(
      '/t3x-dev/test-project?branch=feature%2Fprd-audience&commit=sha256%3Aworkspace-commit&view=canvas'
    );
  });
});
