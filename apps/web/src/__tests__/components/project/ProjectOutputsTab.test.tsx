// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from '@/__tests__/hooks/renderHook';
import { ProjectOutputsTab } from '@/components/project/ProjectOutputsTab';
import {
  buildLeafCreateCandidates,
  buildProjectOutputArtifacts,
} from '@/domain/outputs/projectOutputs';
import type { UseProjectOutputsDataResult } from '@/hooks/leaves/useProjectOutputsData';
import type { ApiCommit, Leaf } from '@/types/api';
import type { WorkspaceCandidate, WorkspaceOutputTarget } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  createLeaf: vi.fn(),
  deleteLeaf: vi.fn(),
  leafWorkspace: vi.fn(),
  toastSuccess: vi.fn(),
  useProjectOutputsData: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  pathname: '/t3x-dev/test-project/outputs',
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const dataSourceMocks = vi.hoisted(() => ({
  leaves: { error: null, leaves: [], loading: false, refresh: vi.fn() },
  loadCommits: vi.fn(),
  workspaces: { error: null, loading: false, refresh: vi.fn(), workspaces: [] },
}));

vi.mock('@/hooks/leaves/useProjectOutputsData', () => ({
  useProjectOutputsData: (...args: unknown[]) => mocks.useProjectOutputsData(...args),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ replace: navigationMocks.replace }),
  useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock('@/hooks/leaves/useCreateLeaf', () => ({
  useCreateLeaf: () => ({ create: mocks.createLeaf }),
}));

vi.mock('@/hooks/leaves/useDeleteLeaf', () => ({
  useDeleteLeaf: () => ({ remove: mocks.deleteLeaf }),
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args) },
}));

vi.mock('@/app/project/[projectId]/leaf/[leafId]/page', () => ({
  LeafDetailWorkspace: (props: {
    embeddedNavigation: {
      count: number;
      onCreateLeaf: () => void;
      onManageLeaves: () => void;
      status: { label: string };
    };
    leafIdOverride: string;
    projectIdOverride: string;
  }) => {
    mocks.leafWorkspace(props);
    return (
      <div data-testid="embedded-leaf-workspace">
        <span>Leaf workspace {props.leafIdOverride}</span>
        <span>{props.embeddedNavigation.status.label}</span>
        <button onClick={props.embeddedNavigation.onManageLeaves} type="button">
          Manage Leaves, {props.embeddedNavigation.count} existing
        </button>
        <button onClick={props.embeddedNavigation.onCreateLeaf} type="button">
          New Leaf
        </button>
      </div>
    );
  },
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
  navigationMocks.searchParams = new URLSearchParams();
  mocks.useProjectOutputsData.mockReturnValue(makeData());
  mocks.createLeaf.mockResolvedValue(makeLeaf({ id: 'leaf_created', title: 'Created Leaf' }));
  mocks.deleteLeaf.mockResolvedValue(undefined);
  dataSourceMocks.loadCommits.mockResolvedValue([]);
  dataSourceMocks.leaves.refresh.mockResolvedValue(undefined);
  dataSourceMocks.workspaces.refresh.mockResolvedValue(undefined);
});

afterEach(cleanupRoots);

describe('ProjectOutputsTab', () => {
  it('embeds the existing Leaf workspace beneath the project navigation', () => {
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
    expect(screen.getByTestId('embedded-leaf-workspace')).toBeInTheDocument();
    expect(screen.getByText('Leaf workspace leaf_fresh')).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(mocks.leafWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ leafIdOverride: 'leaf_fresh', projectIdOverride: 'proj_1' })
    );
  });

  it('manages existing Leaves and switches the embedded workspace in place', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Manage Leaves, 3 existing' }));
    expect(screen.getByRole('dialog', { name: 'Manage Leaves' })).toBeInTheDocument();
    expect(screen.getByText('Existing Leaves')).toBeInTheDocument();
    expect(screen.getByText('Ready audience brief')).toBeInTheDocument();
    expect(screen.getByText('Stale audience brief')).toBeInTheDocument();
    expect(screen.getByText('Unlinked audience brief')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Leaf: Ready audience brief' }));
    expect(screen.getByText('Leaf workspace leaf_ready')).toBeInTheDocument();
    expect(mocks.leafWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ leafIdOverride: 'leaf_ready' })
    );
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/t3x-dev/test-project/outputs?leaf=leaf_ready'
    );
  });

  it('deletes the selected Leaf, broadcasts the change, and opens the next Leaf', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const commit = makeCommit();
    const selectedLeaf = makeLeaf({
      created_at: '2026-07-14T08:30:00.000Z',
      id: 'leaf_delete',
      title: 'Delete me',
    });
    const nextLeaf = makeLeaf({ id: 'leaf_next', title: 'Next Leaf' });
    const leafChangedEvents: unknown[] = [];
    const listener = (event: Event) => {
      leafChangedEvents.push((event as CustomEvent).detail);
    };
    window.addEventListener('t3x:leaf-changed', listener);
    navigationMocks.searchParams = new URLSearchParams('leaf=leaf_delete');
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ commits: [commit], leaves: [selectedLeaf, nextLeaf], refresh })
    );

    try {
      render(<ProjectOutputsTab projectId="proj_1" />);

      fireEvent.click(screen.getByRole('button', { name: 'Manage Leaves, 2 existing' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete Leaf: Delete me' }));
      expect(screen.getByRole('dialog', { name: 'Delete Leaf' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Delete Leaf' }));

      await waitFor(() => expect(mocks.deleteLeaf).toHaveBeenCalledWith('leaf_delete'));
      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        '/t3x-dev/test-project/outputs?leaf=leaf_next'
      );
      expect(leafChangedEvents).toContainEqual({
        commitHash: selectedLeaf.commit_hash,
        leafId: 'leaf_delete',
        projectId: 'proj_1',
        reason: 'deleted',
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Deleted Delete me');
    } finally {
      window.removeEventListener('t3x:leaf-changed', listener);
    }
  });

  it('clears the Outputs Leaf route when deleting the last selected Leaf', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const leaf = makeLeaf({ id: 'leaf_only', title: 'Only Leaf' });
    navigationMocks.searchParams = new URLSearchParams('leaf=leaf_only');
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ commits: [makeCommit()], leaves: [leaf], refresh })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Leaves, 1 existing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Leaf: Only Leaf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Leaf' }));

    await waitFor(() => expect(mocks.deleteLeaf).toHaveBeenCalledWith('leaf_only'));
    expect(navigationMocks.replace).toHaveBeenCalledWith('/t3x-dev/test-project/outputs');
  });

  it('keeps commits with existing Leaves available for another Leaf', () => {
    const commit = makeCommit({ message: 'Ready handoff commit' });
    const workspace = makeWorkspace();
    const leaf = makeLeaf({ commit_hash: commit.hash, title: 'Ready audience brief' });
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ commits: [commit], leaves: [leaf], workspaces: [workspace] })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Leaves, 1 existing' }));
    expect(screen.getByText('Ready handoff commit')).toBeInTheDocument();
    expect(screen.getByText(/1 existing Leaf/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Create Leaf: ${commit.hash}` })).toBeEnabled();
  });

  it('shows committed versions from every branch as create candidates', () => {
    const mainCommit = makeCommit({ branch: 'main', hash: 'sha256:main_commit' });
    const branchCommit = makeCommit({
      branch: 'outputs/bundle-refresh',
      hash: 'sha256:branch_commit',
      message: 'Branch output refresh',
    });
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ commits: [mainCommit, branchCommit], leaves: [] })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Leaves, 0 existing' }));
    expect(screen.getByRole('button', { name: `Create Leaf: ${mainCommit.hash}` })).toBeEnabled();
    expect(screen.getByText('Branch output refresh')).toBeInTheDocument();
    expect(screen.getByText(/outputs\/bundle-refresh/)).toBeInTheDocument();
  });

  it('opens the Leaf requested by an Outputs deep link', () => {
    const workspace = makeWorkspace();
    const firstLeaf = makeLeaf({ id: 'leaf_first', title: 'First Leaf' });
    const linkedLeaf = makeLeaf({ id: 'leaf_linked', title: 'Linked Leaf' });
    navigationMocks.searchParams = new URLSearchParams('leaf=leaf_linked');
    mocks.useProjectOutputsData.mockReturnValue(
      makeData({
        commits: [makeCommit()],
        leaves: [firstLeaf, linkedLeaf],
        workspaces: [workspace],
      })
    );

    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByText('Leaf workspace leaf_linked')).toBeInTheDocument();
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

    expect(screen.getByText('Leaf workspace leaf_fresh')).toBeInTheDocument();
  });

  it('shows loading while persisted records are being fetched', () => {
    mocks.useProjectOutputsData.mockReturnValue(makeData({ loading: true }));

    render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByText('Loading Leaves...')).toBeInTheDocument();
    expect(screen.queryByText('No committed Leaves yet')).toBeNull();
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

  it('shows an honest empty state with the State page visual constitution', () => {
    render(<ProjectOutputsTab projectId="proj_1" />);

    const heading = screen.getByText('No committed Leaves yet');
    const shell = heading.closest('section');
    const createButton = screen.getByRole('button', { name: 'New Leaf' });
    const manageButton = screen.getByRole('button', { name: 'Manage Leaves' });

    expect(shell).toHaveClass(
      'rounded-md',
      'border-[var(--stroke-divider)]',
      'bg-[var(--surface-panel)]'
    );
    expect(createButton).toHaveAttribute('data-variant', 'branch');
    expect(createButton).toHaveAttribute('data-size', 'sm');
    expect(manageButton).toHaveAttribute('data-variant', 'branch');
    expect(manageButton).toHaveAttribute('data-size', 'sm');
    expect(screen.getByRole('button', { name: 'Manage Leaves, 0 existing' })).toBeInTheDocument();
  });

  it('creates an available Leaf and opens it in the reused workspace', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const commit = makeCommit();
    const createdLeaf = makeLeaf({ id: 'leaf_created', title: 'Audience handoff' });
    mocks.createLeaf.mockResolvedValue(createdLeaf);
    mocks.useProjectOutputsData.mockReturnValue(makeData({ commits: [commit], refresh }));

    const { rerender } = render(<ProjectOutputsTab projectId="proj_1" />);

    expect(screen.getByText('1 committed version is ready for Leaf creation.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Leaves, 0 existing' }));
    fireEvent.click(screen.getByRole('button', { name: `Create Leaf: ${commit.hash}` }));
    expect(screen.getByRole('dialog', { name: 'Create Leaf' })).toBeInTheDocument();

    const titleInput = screen.getByLabelText('Leaf title');
    expect(titleInput).toHaveValue('Blog post');
    fireEvent.change(titleInput, { target: { value: 'Audience handoff' } });
    expect(screen.getByLabelText('Leaf type')).toHaveValue('article');
    fireEvent.click(screen.getByRole('button', { name: 'Create Leaf' }));

    await waitFor(() => expect(mocks.createLeaf).toHaveBeenCalledTimes(1));
    expect(mocks.createLeaf).toHaveBeenCalledWith(
      expect.objectContaining({
        commit_hash: commit.hash,
        constraints: [],
        config: {},
        project_id: 'proj_1',
        title: 'Audience handoff',
        type: 'article',
      })
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    mocks.useProjectOutputsData.mockReturnValue(
      makeData({ commits: [commit], leaves: [createdLeaf], refresh })
    );
    rerender(<ProjectOutputsTab projectId="proj_1" />);

    await waitFor(() =>
      expect(screen.getByText('Leaf workspace leaf_created')).toBeInTheDocument()
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Created Audience handoff');
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/t3x-dev/test-project/outputs?leaf=leaf_created'
    );
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

describe('buildLeafCreateCandidates', () => {
  it('keeps every commit available, including commits that already have Leaves', () => {
    const mainCommit = makeCommit({ hash: 'sha256:main_commit' });
    const branchCommit = makeCommit({
      branch: 'feature',
      hash: 'sha256:branch_commit',
      committed_at: '2026-07-14T08:00:00.000Z',
    });
    const leaf = makeLeaf({ commit_hash: branchCommit.hash, id: 'leaf_existing' });

    const candidates = buildLeafCreateCandidates([leaf], [], [mainCommit, branchCommit]);

    expect(candidates.map((candidate) => candidate.commit.hash)).toEqual([
      branchCommit.hash,
      mainCommit.hash,
    ]);
    expect(candidates[0].existingLeaves.map((existingLeaf) => existingLeaf.id)).toEqual([
      'leaf_existing',
    ]);
  });
});

describe('useProjectOutputsData', () => {
  it('loads every commit page for the project without a branch filter', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      makeCommit({ hash: `sha256:page1_${index}` })
    );
    const finalCommit = makeCommit({ hash: 'sha256:final_page' });
    dataSourceMocks.loadCommits
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([finalCommit]);

    const actual = await vi.importActual<typeof import('@/hooks/leaves/useProjectOutputsData')>(
      '@/hooks/leaves/useProjectOutputsData'
    );
    const { result, unmount } = renderHook(() => actual.useProjectOutputsData('proj_1'));

    await waitFor(() => expect(result.current.commits).toHaveLength(1001));
    expect(dataSourceMocks.loadCommits).toHaveBeenNthCalledWith(1, 'proj_1', undefined, 1000, 0);
    expect(dataSourceMocks.loadCommits).toHaveBeenNthCalledWith(2, 'proj_1', undefined, 1000, 1000);
    expect(result.current.commits.at(-1)).toEqual(finalCommit);
    unmount();
  });

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
