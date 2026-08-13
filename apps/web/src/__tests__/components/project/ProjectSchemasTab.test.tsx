// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProject } from '@/commands/projects';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';
import type { WorkspaceCandidate } from '@/types/workspaces';

const refreshWorkspaces = vi.fn();
const saveDraft = vi.fn();
const extractCandidate = vi.fn();
let workspaces: WorkspaceCandidate[] = [];
const PROMPT_SCHEMA_HASH =
  'sha256:1d05f6c4ae0aeef34f15714e166377e4fd4c08644c885a2ddc7c2e50bf39f930';

vi.mock('@/commands/projects', () => ({ updateProject: vi.fn() }));
vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    error: null,
    loading: false,
    refresh: refreshWorkspaces,
    workspaces,
  }),
}));
vi.mock('@/hooks/workspaces/useWorkspaceFlow', () => ({
  useWorkspaceFlow: () => ({ extractCandidate, saveDraft }),
}));

const workspace: WorkspaceCandidate = {
  id: 'workspace_main',
  projectId: 'proj_test',
  title: 'Main workspace',
  summary: 'Draft',
  status: 'draft',
  updatedAt: '2026-07-20T00:00:00.000Z',
  baseCommitHash: null,
  targetBranch: 'main',
  sourceBundle: [],
  schemaBindings: [
    {
      canonicalName: 't3x/skill',
      schemaName: 'Skill Schema',
      version: 'v1',
      mode: 'pinned',
    },
  ],
  schemaCandidate: { summary: 'Old candidate', fields: [] },
  schemaReview: { verdict: 'ready', summary: 'Ready', gaps: [] },
  yopsDraft: { id: 'draft_main', operations: [] },
  outputTargets: [],
};

beforeEach(() => {
  workspaces = [];
  refreshWorkspaces.mockReset().mockResolvedValue(undefined);
  saveDraft.mockReset();
  extractCandidate.mockReset();
  vi.mocked(updateProject).mockReset().mockResolvedValue({
    project_id: 'proj_test',
    name: 'Test project',
    created_at: '2026-07-20T00:00:00.000Z',
  });
  useProjectWorkspaceSchemaBindingsStore.setState({ bindingsByProjectId: {} });
});

describe('ProjectSchemasTab', () => {
  it('renders the multi-family schema version browser from fixtures', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Manage Schema identities and inspect immutable versions. Compose Modules to publish without changing existing history.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PRD Schema/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skill Schema/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Prompt Schema/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
    expect(screen.queryByText('Docker Compose')).not.toBeInTheDocument();
  });

  it('uses the registry current pointer independently of workspace preview bindings', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    const currentVersionFact = screen.getByText('Current version').parentElement;
    expect(currentVersionFact).not.toBeNull();
    expect(within(currentVersionFact as HTMLElement).getByText('v2')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });

  it('keeps official Schemas out of the My Schemas scope', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    fireEvent.click(screen.getByRole('button', { name: 'My Schemas' }));

    expect(screen.queryByRole('button', { name: /PRD Schema/ })).not.toBeInTheDocument();
    expect(screen.getByText('No Schemas match this search or status.')).toBeInTheDocument();
  });

  it('persists the selected current release as the project default', async () => {
    render(
      <ProjectSchemasTab projectId="proj_test" projectMetadata={{ description: 'Test project' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Schema management menu' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Set as project default' }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('proj_test', {
        metadata: expect.objectContaining({
          description: 'Test project',
          default_schema_binding: expect.objectContaining({
            canonicalName: 't3x/prompt',
            mode: 'project_default',
            schemaHash: PROMPT_SCHEMA_HASH,
            schemaName: 'Prompt Schema',
            version: 'v1',
          }),
        }),
      });
    });
    expect(screen.getByText(/will be used by new Workspaces/)).toBeInTheDocument();
  });

  it('updates and regenerates the current persisted Workspace with the new project default', async () => {
    workspaces = [{ ...workspace, revision: 125 }];
    saveDraft.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: { ...candidate, revision: 126 },
    }));
    extractCandidate.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: {
        ...candidate,
        revision: 127,
        schemaCandidate: { summary: 'Regenerated with project default', fields: [] },
      },
    }));

    render(<ProjectSchemasTab projectId="proj_test" />);
    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Schema management menu' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Set as project default' }));

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect(saveDraft.mock.calls[0][0]).toMatchObject({
      id: 'workspace_main',
      revision: 125,
      schemaBindings: [
        {
          canonicalName: 't3x/prompt',
          schemaHash: PROMPT_SCHEMA_HASH,
          schemaName: 'Prompt Schema',
          version: 'v1',
          mode: 'pinned',
        },
      ],
      schemaReview: { verdict: 'needs_review' },
      yopsDraft: { operations: [] },
    });
    await waitFor(() => expect(extractCandidate).toHaveBeenCalledTimes(1));
    expect(updateProject).toHaveBeenCalledTimes(1);
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(/is now the project default and Main workspace was regenerated/)
    ).toBeInTheDocument();
  });

  it('saves a stale binding before regenerating the current Workspace candidate', async () => {
    workspaces = [workspace];
    saveDraft.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: { ...candidate, revision: 2 },
    }));
    extractCandidate.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: {
        ...candidate,
        revision: 3,
        schemaCandidate: { summary: 'Regenerated', fields: [] },
      },
    }));
    render(<ProjectSchemasTab projectId="proj_test" />);

    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Main workspace' }));

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    const staleWorkspace = saveDraft.mock.calls[0][0] as WorkspaceCandidate;
    expect(staleWorkspace.schemaBindings[0]).toEqual(
      expect.objectContaining({
        canonicalName: 't3x/prompt',
        schemaHash: PROMPT_SCHEMA_HASH,
        schemaName: 'Prompt Schema',
        version: 'v1',
        mode: 'pinned',
      })
    );
    expect(staleWorkspace.schemaReview.verdict).toBe('needs_review');
    expect(staleWorkspace.yopsDraft.operations).toEqual([]);
    await waitFor(() => expect(extractCandidate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/candidate was regenerated/)).toBeInTheDocument();
  });

  it('keeps the persisted stale Prompt binding recoverable when regeneration fails', async () => {
    workspaces = [workspace];
    saveDraft.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: { ...candidate, revision: 2 },
    }));
    extractCandidate.mockRejectedValue(new Error('Prompt source could not be regenerated'));
    render(<ProjectSchemasTab projectId="proj_test" />);

    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Main workspace' }));

    expect(await screen.findByText(/regeneration failed/)).toBeInTheDocument();
    const savedWorkspace = saveDraft.mock.calls[0][0] as WorkspaceCandidate;
    expect(savedWorkspace.schemaBindings).toEqual([
      {
        canonicalName: 't3x/prompt',
        schemaHash: PROMPT_SCHEMA_HASH,
        schemaName: 'Prompt Schema',
        version: 'v1',
        mode: 'pinned',
      },
    ]);
    expect(savedWorkspace.schemaCandidate.fields).toEqual([]);
    expect(savedWorkspace.schemaReview.verdict).toBe('needs_review');
    expect(savedWorkspace.yopsDraft.operations).toEqual([]);
    expect(
      useProjectWorkspaceSchemaBindingsStore.getState().bindingsByProjectId.proj_test.byWorkspaceId
        .workspace_main
    ).toEqual(savedWorkspace.schemaBindings[0]);
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('restores a persisted Prompt binding after the client binding store is reset', () => {
    workspaces = [
      {
        ...workspace,
        revision: 4,
        schemaBindings: [
          {
            canonicalName: 't3x/prompt',
            schemaHash: PROMPT_SCHEMA_HASH,
            schemaName: 'Prompt Schema',
            version: 'v1',
            mode: 'pinned',
          },
        ],
      },
    ];
    useProjectWorkspaceSchemaBindingsStore.setState({ bindingsByProjectId: {} });

    render(<ProjectSchemasTab projectId="proj_test" />);
    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));

    expect(screen.getByRole('button', { name: 'Applied to Main workspace' })).toBeDisabled();
  });
});
