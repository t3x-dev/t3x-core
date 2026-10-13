// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { useProjectWorkspaceSchemaBindingsStore } from '@/store/projectWorkspaceSchemaBindingsStore';
import type { PublishedSchemaVersionManifest } from '@/types/schemaModules';
import type { WorkspaceCandidate } from '@/types/workspaces';

let schemaRouteQuery = '';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(schemaRouteQuery),
}));

vi.mock('@/components/schemas/SchemaCatalogExperience', () => ({
  SchemaCatalogExperience: ({ children }: { children: React.ReactNode }) => children,
}));

const refreshWorkspaces = vi.fn();
const saveDraft = vi.fn();
const refreshPublishedVersions = vi.fn();
let workspaces: WorkspaceCandidate[] = [];
let publishedVersions: PublishedSchemaVersionManifest[] = [];
const PROMPT_SCHEMA_HASH =
  'sha256:1d05f6c4ae0aeef34f15714e166377e4fd4c08644c885a2ddc7c2e50bf39f930';
const BLUEPRINT_SCHEMA_HASH = `sha256:${'b'.repeat(64)}`;

function publishedSchemaFixtures(): PublishedSchemaVersionManifest[] {
  return (['prd', 'skill', 'prompt'] as const).map((family) => ({
    apiVersion: 't3x.dev/yschema-blueprint/v1',
    canonicalName: `t3x/${family}`,
    version: 'v1',
    family,
    title: `${family === 'prd' ? 'PRD' : family === 'skill' ? 'Skill' : 'Prompt'} Schema`,
    description: `Published ${family} contract.`,
    status: 'published',
    source: 'team',
    schema: {
      yschema: '0.1',
      name: `t3x/${family}`,
      version: 'v1',
      strict: false,
      nodes: { [family]: { required: true, repeated: false } },
    },
    registry: {
      schemaHash:
        family === 'prompt'
          ? PROMPT_SCHEMA_HASH
          : `sha256:${(family === 'prd' ? 'a' : 'c').repeat(64)}`,
    },
  }));
}

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    error: null,
    loading: false,
    refresh: refreshWorkspaces,
    workspaces,
  }),
}));
vi.mock('@/hooks/workspaces/useWorkspaceFlow', () => ({
  useWorkspaceFlow: () => ({ saveDraft }),
}));
vi.mock('@/hooks/schemas/useProjectYSchemaVersions', () => ({
  useProjectYSchemaVersions: () => ({
    error: undefined,
    pending: false,
    refresh: refreshPublishedVersions,
    versions: publishedVersions,
  }),
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
  schemaRouteQuery = '';
  workspaces = [];
  publishedVersions = publishedSchemaFixtures();
  refreshWorkspaces.mockReset().mockResolvedValue(undefined);
  refreshPublishedVersions.mockReset().mockResolvedValue([]);
  saveDraft.mockReset();
  useProjectWorkspaceSchemaBindingsStore.setState({ bindingsByProjectId: {} });
});

describe('ProjectSchemasTab', () => {
  it('does not bind a different Workspace when an explicit deep link is stale', () => {
    workspaces = [workspace];
    schemaRouteQuery = 'workspace=missing';
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Workspace missing was not found on this branch in this project'
    );
    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.click(screen.getByRole('radio', { name: /v1 Published/i }));
    expect(screen.queryByRole('button', { name: 'Apply to Main workspace' })).toBeNull();
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it('does not bind a Workspace from another branch', () => {
    workspaces = [workspace];
    schemaRouteQuery = 'workspace=workspace_main&branch=release';
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Workspace workspace_main was not found on this branch'
    );
    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.click(screen.getByRole('radio', { name: /v1 Published/i }));
    expect(screen.queryByRole('button', { name: 'Apply to Main workspace' })).toBeNull();
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it('does not select a Workspace from another branch as the implicit target', () => {
    workspaces = [workspace];
    schemaRouteQuery = 'branch=release';
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByRole('alert')).toHaveTextContent('No Workspace was found on branch release');
    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.click(screen.getByRole('radio', { name: /v1 Published/i }));
    expect(screen.queryByRole('button', { name: 'Apply to Main workspace' })).toBeNull();
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it('renders the multi-family browser from published project versions', () => {
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
    expect(screen.getByText('Select a Schema version')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((radio) => !radio.hasAttribute('checked'))).toBe(
      true
    );
    expect(screen.queryByText('Docker Compose')).not.toBeInTheDocument();
  });

  it('does not infer a project default version from release status or order', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.queryByText('Current version')).not.toBeInTheDocument();
    expect(screen.getByText(/Versions are not project defaults/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((radio) => !radio.hasAttribute('checked'))).toBe(
      true
    );
  });

  it('keeps published project Schemas out of the Official scope', () => {
    render(<ProjectSchemasTab projectId="proj_test" />);

    fireEvent.click(screen.getByRole('button', { name: 'My Schemas' }));
    expect(screen.getByRole('button', { name: /PRD Schema/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Official' }));

    expect(screen.queryByRole('button', { name: /PRD Schema/ })).not.toBeInTheDocument();
    expect(screen.getByText('No Schemas match this search or status.')).toBeInTheDocument();
  });

  it('does not populate an empty project with built-in Schema versions', () => {
    publishedVersions = [];
    render(<ProjectSchemasTab projectId="proj_test" />);

    expect(screen.getByText(/No project schema versions are published yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PRD Schema/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skill Schema/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Prompt Schema/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('saves a stale binding for the current Workspace', async () => {
    workspaces = [workspace];
    saveDraft.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: { ...candidate, revision: 2 },
    }));
    render(<ProjectSchemasTab projectId="proj_test" />);

    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.click(screen.getByRole('radio', { name: /v1 Published/i }));
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
    expect(
      await screen.findByText(/Main workspace now uses Prompt Schema v1\./)
    ).toBeInTheDocument();
  });

  it('applies a published project Blueprint to the Workspace', async () => {
    workspaces = [workspace];
    publishedVersions = [
      {
        apiVersion: 't3x.dev/yschema-blueprint/v1',
        canonicalName: 'projects/proj_test/product-schema',
        version: '1.0.0',
        family: 'open',
        title: 'Product Schema',
        description: 'Published project contract.',
        status: 'published',
        source: 'team',
        schema: {
          yschema: '0.1',
          name: 'projects/proj_test/product-schema',
          version: '1.0.0',
          strict: false,
          nodes: { product: { required: true, repeated: false } },
        },
        registry: { schemaHash: BLUEPRINT_SCHEMA_HASH },
      },
    ];
    saveDraft.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: { ...candidate, revision: 2 },
    }));
    render(<ProjectSchemasTab projectId="proj_test" />);

    fireEvent.click(screen.getByRole('button', { name: 'My Schemas' }));
    fireEvent.click(screen.getByRole('button', { name: /Product Schema/ }));
    fireEvent.click(screen.getByRole('radio', { name: /1.0.0 Published/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Main workspace' }));

    await waitFor(() => expect(saveDraft).toHaveBeenCalledTimes(1));
    expect((saveDraft.mock.calls[0][0] as WorkspaceCandidate).schemaBindings).toEqual([
      {
        canonicalName: 'projects/proj_test/product-schema',
        schemaHash: BLUEPRINT_SCHEMA_HASH,
        schemaName: 'Product Schema',
        version: '1.0.0',
        mode: 'pinned',
      },
    ]);
    expect(await screen.findByText(/now uses Product Schema 1\.0\.0\./)).toBeInTheDocument();
  });

  it('persists the stale Prompt binding and refreshes the Workspace list', async () => {
    workspaces = [workspace];
    saveDraft.mockImplementation(async (candidate: WorkspaceCandidate) => ({
      candidate_id: candidate.id,
      workspace: { ...candidate, revision: 2 },
    }));
    render(<ProjectSchemasTab projectId="proj_test" />);

    fireEvent.click(screen.getByRole('button', { name: /Prompt Schema/ }));
    fireEvent.click(screen.getByRole('radio', { name: /v1 Published/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Main workspace' }));

    expect(await screen.findByText(/now uses Prompt Schema v1\./)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('radio', { name: /v1 Published/i }));

    expect(screen.getByRole('button', { name: 'Applied to Main workspace' })).toBeDisabled();
  });
});
