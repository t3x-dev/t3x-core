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
        'Schema families define different kinds of structured state. Choose a family to inspect its current contract, historical versions, typed relations, and canonical YAML.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'PRD Schema v2' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Skill Schema v1' })).toBeInTheDocument();
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

  it('persists the selected current release as the project default', async () => {
    render(
      <ProjectSchemasTab projectId="proj_test" projectMetadata={{ description: 'Test project' }} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use for new Workspaces' }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith('proj_test', {
        metadata: expect.objectContaining({
          description: 'Test project',
          default_schema_binding: expect.objectContaining({
            canonicalName: 't3x/prd',
            mode: 'project_default',
            schemaName: 'PRD Schema',
            version: 'v2',
          }),
        }),
      });
    });
    expect(screen.getByText(/will be used by new Workspaces/)).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Apply to Main workspace' }));

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    const staleWorkspace = saveDraft.mock.calls[0][0] as WorkspaceCandidate;
    expect(staleWorkspace.schemaBindings[0]).toEqual(
      expect.objectContaining({
        canonicalName: 't3x/prd',
        schemaName: 'PRD Schema',
        version: 'v2',
        mode: 'pinned',
      })
    );
    expect(staleWorkspace.schemaReview.verdict).toBe('needs_review');
    expect(staleWorkspace.yopsDraft.operations).toEqual([]);
    await waitFor(() => expect(extractCandidate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/candidate was regenerated/)).toBeInTheDocument();
  });
});
