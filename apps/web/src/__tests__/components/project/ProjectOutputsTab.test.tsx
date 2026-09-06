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

function makeCommit(overrides: Partial<ApiCommit> = {}): ApiCommit {
  return {
    branch: 'main',
    committed_at: '2026-07-13T08:00:00.000Z',
    hash: 'sha256:latest123456789',
    project_id: 'proj_1',
    schema: 't3x/commit/v2',
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
  it('retains an explicit missing Leaf instead of opening a different artifact', () => {
    navigationMocks.searchParams = new URLSearchParams('leaf=missing');
    render(<ProjectOutputsTab projectId="proj_test" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Requested Leaf is unavailable');
    expect(screen.queryByText('New Leaf')).not.toBeInTheDocument();
    expect(mocks.createLeaf).not.toHaveBeenCalled();
    expect(mocks.deleteLeaf).not.toHaveBeenCalled();
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
