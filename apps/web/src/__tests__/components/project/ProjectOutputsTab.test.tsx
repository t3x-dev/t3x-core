// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from '@/__tests__/hooks/renderHook';
import { ProjectOutputsTab } from '@/components/project/ProjectOutputsTab';
import { buildProjectOutputArtifacts } from '@/domain/outputs/projectOutputs';
import type { UseProjectOutputsDataResult } from '@/hooks/leaves/useProjectOutputsData';
import type { ApiCommit, Leaf } from '@/types/api';
import type { WorkspaceCandidate, WorkspaceOutputTarget } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  useProjectOutputsData: vi.fn(),
}));

const dataSourceMocks = vi.hoisted(() => ({
  leaves: { error: null, leaves: [], loading: false, refresh: vi.fn() },
  loadCommits: vi.fn(),
  workspaces: { error: null, loading: false, refresh: vi.fn(), workspaces: [] },
}));

vi.mock('@/hooks/leaves/useProjectOutputsData', () => ({
  useProjectOutputsData: (...args: unknown[]) => mocks.useProjectOutputsData(...args),
}));

vi.mock('@/hooks/commits/useCommitsList', () => ({
  useCommitsList: () => ({ loadCommits: dataSourceMocks.loadCommits }),
}));

vi.mock('@/hooks/leaves/useProjectLeaves', () => ({
  useProjectLeaves: () => dataSourceMocks.leaves,
}));

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => dataSourceMocks.workspaces,
}));

const outputTarget: WorkspaceOutputTarget = {
  constraints: ['Use committed evidence only.'],
  format: 'markdown',
  id: 'target_prd_brief',
  instruction: 'Write the audience handoff.',
  leafType: 'document',
  previewBody: 'A committed target waiting for its Leaf.',
  sourceScope: 'Candidate tree and source refs.',
  status: 'draft_target',
  title: 'PRD audience brief',
  type: 'document',
};

function makeWorkspace(overrides: Partial<WorkspaceCandidate> = {}): WorkspaceCandidate {
  return {
    id: 'workspace_prd',
    lastCommitHash: 'sha256:latest123456789',
    outputTargets: [outputTarget],
    projectId: 'proj_1',
    schemaBindings: [{ mode: 'pinned', schemaName: 'PRD Schema', version: 'v2' }],
    targetBranch: 'main',
    title: 'PRD audience handoff',
    updatedAt: '2026-07-13T08:00:00.000Z',
    ...overrides,
  } as WorkspaceCandidate;
}

function makeCommit(overrides: Partial<ApiCommit> = {}): ApiCommit {
  return {
    branch: 'main',
    committed_at: '2026-07-13T08:00:00.000Z',
    hash: 'sha256:latest123456789',
    project_id: 'proj_1',
    schema: 't3x/commit',
    ...overrides,
  } as ApiCommit;
}

function makeLeaf(overrides: Partial<Leaf> = {}): Leaf {
  return {
    assertions: [
      {
        constraint_id: 'constraint_1',
        details: 'Uses committed evidence.',
        id: 'assertion_1',
        passed: true,
      },
    ],
    commit_hash: 'sha256:latest123456789',
    config: {
      format: 'markdown',
      workspace_id: 'workspace_prd',
    },
    constraints: [],
    created_at: '2026-07-13T08:30:00.000Z',
    generated_at: '2026-07-13T09:00:00.000Z',
    id: 'leaf_fresh',
    output: 'Reviewer-facing PRD brief generated from the committed candidate tree.',
    project_id: 'proj_1',
    title: 'Persisted PRD review brief',
    type: 'article',
    ...overrides,
  } as Leaf;
}

function makeData(
  overrides: Partial<UseProjectOutputsDataResult> = {}
): UseProjectOutputsDataResult {
  return {
    commits: [],
    error: null,
    leaves: [],
    loading: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    workspaces: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useProjectOutputsData.mockReturnValue(makeData());
  dataSourceMocks.leaves.refresh.mockResolvedValue(undefined);
  dataSourceMocks.workspaces.refresh.mockResolvedValue(undefined);
});

afterEach(cleanupRoots);

describe('ProjectOutputsTab', () => {
  it('renders persisted Leaf metadata and links a fresh output to its detail page', () => {
    const workspace = makeWorkspace({
      outputTargets: [{ ...outputTarget, format: 'yaml' }],
    });
    const commit = makeCommit();
    const leaf = makeLeaf();
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ commits: [commit], leaves: [leaf], workspaces: [workspace] })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(mocks.useProjectOutputsData).toHaveBeenCalledWith('proj_1');
    expect(screen.getByText('Persisted PRD review brief')).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(screen.getByText('Document / Markdown')).toBeInTheDocument();
    expect(screen.getByText('Generated 2026-07-13 from PRD audience handoff')).toBeInTheDocument();
    expect(screen.getByText('hash:latest1')).toBeInTheDocument();
    expect(screen.getByText('PRD Schema v2')).toBeInTheDocument();
    expect(screen.getByText('1/1 constraints passed.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View output: Persisted PRD review brief' })
    ).toHaveAttribute('href', '/project/proj_1/leaf/leaf_fresh');
  });

  it('keeps ready, stale, and unknown Leaves readable without exposing write actions', () => {
    const workspace = makeWorkspace();
    const latestCommit = makeCommit();
    const oldCommit = makeCommit({
      committed_at: '2026-07-12T08:00:00.000Z',
      hash: 'sha256:old123456789',
    });
    const readyLeaf = makeLeaf({
      assertions: null,
      generated_at: null,
      id: 'leaf_ready',
      output: null,
      title: 'Ready audience brief',
    });
    const staleLeaf = makeLeaf({
      commit_hash: oldCommit.hash,
      id: 'leaf_stale',
      title: 'Stale audience brief',
    });
    const unknownLeaf = makeLeaf({
      assertions: null,
      commit_hash: latestCommit.hash,
      config: {},
      generated_at: null,
      id: 'leaf_unknown',
      output: null,
      title: 'Unlinked audience brief',
    });
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({
        commits: [latestCommit, oldCommit],
        leaves: [readyLeaf, staleLeaf, unknownLeaf],
        workspaces: [workspace],
      })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'View Leaf: Ready audience brief' })).toHaveAttribute(
      'href',
      expect.stringContaining('/project/proj_1/leaf/leaf_ready')
    );
    expect(screen.getByRole('link', { name: 'View output: Stale audience brief' })).toHaveAttribute(
      'href',
      expect.stringContaining('/project/proj_1/leaf/leaf_stale')
    );
    expect(
      screen.getByRole('link', { name: 'View Leaf: Unlinked audience brief' })
    ).toHaveAttribute('href', expect.stringContaining('/project/proj_1/leaf/leaf_unknown'));
    expect(screen.queryByRole('button', { name: /generate|regenerate|create leaf/i })).toBeNull();
  });

  it('tolerates legacy Workspace records without output or schema arrays', () => {
    const workspace = makeWorkspace({
      outputTargets: undefined as never,
      schemaBindings: undefined as never,
    });
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ commits: [makeCommit()], leaves: [makeLeaf()], workspaces: [workspace] })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByText('Persisted PRD review brief')).toBeInTheDocument();
    expect(screen.getByText('Article / Markdown')).toBeInTheDocument();
    expect(screen.getByText('t3x/commit')).toBeInTheDocument();
  });

  it('shows loading while persisted records are being fetched', () => {
    mocks.useProjectOutputsData.mockReturnValue(makeData({ loading: true }));

    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByText('Loading outputs...')).toBeInTheDocument();
    expect(screen.queryByText('No committed Leaf artifacts yet')).toBeNull();
  });

  it('shows a load error, suppresses the empty state, and retries all records', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ error: 'Failed to load committed outputs.', refresh })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load committed outputs.');
    expect(screen.queryByText('No committed Leaf artifacts yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry outputs' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows an honest empty state when the project has no persisted Leaves', () => {
    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByText('No committed Leaf artifacts yet')).toBeInTheDocument();
    expect(screen.getByText('0 Leaves')).toBeInTheDocument();
  });
});

describe('buildProjectOutputArtifacts', () => {
  it('sorts by valid persisted dates and uses the Leaf id as a stable tie-break', () => {
    const datedLeaf = (id: string, createdAt: string) =>
      makeLeaf({ config: {}, created_at: createdAt, generated_at: null, id });

    expect(
      buildProjectOutputArtifacts(
        [
          datedLeaf('leaf_invalid', 'not-a-date'),
          datedLeaf('leaf_b', '2026-07-13T09:00:00.000Z'),
          datedLeaf('leaf_newer', '2026-07-14T09:00:00.000Z'),
          datedLeaf('leaf_a', '2026-07-13T09:00:00.000Z'),
        ],
        [],
        []
      ).map(({ id }) => id)
    ).toEqual(['leaf_newer', 'leaf_a', 'leaf_b', 'leaf_invalid']);
  });
});

describe('useProjectOutputsData', () => {
  it('ignores unrelated commits and keeps the latest in-project refresh result', async () => {
    let resolveFirst!: (commits: ApiCommit[]) => void;
    let resolveSecond!: (commits: ApiCommit[]) => void;
    dataSourceMocks.loadCommits
      .mockReturnValueOnce(
        new Promise<ApiCommit[]>((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise<ApiCommit[]>((resolve) => {
          resolveSecond = resolve;
        })
      );
    const actual = await vi.importActual<typeof import('@/hooks/leaves/useProjectOutputsData')>(
      '@/hooks/leaves/useProjectOutputsData'
    );
    const { result, unmount } = renderHook(() => actual.useProjectOutputsData('proj_1'));

    expect(dataSourceMocks.loadCommits).toHaveBeenCalledTimes(1);
    fireEvent(
      window,
      new CustomEvent('t3x:commit-created', { detail: { projectId: 'other_project' } })
    );
    expect(dataSourceMocks.loadCommits).toHaveBeenCalledTimes(1);
    fireEvent(window, new CustomEvent('t3x:commit-created', { detail: { projectId: 'proj_1' } }));
    expect(dataSourceMocks.loadCommits).toHaveBeenCalledTimes(2);

    const newest = makeCommit({ hash: 'sha256:newest' });
    resolveSecond([newest]);
    await waitForHook();
    expect(result.current.commits).toEqual([newest]);
    expect(result.current.loading).toBe(false);

    resolveFirst([makeCommit({ hash: 'sha256:older' })]);
    await waitForHook();
    expect(result.current.commits).toEqual([newest]);
    unmount();
  });
});
