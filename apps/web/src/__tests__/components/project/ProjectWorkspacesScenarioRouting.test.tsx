// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import type { WorkspaceCandidate } from '@/types/workspaces';

const testState = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
  workbenchProps: null as Record<string, unknown> | null,
  workspaces: [] as WorkspaceCandidate[],
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/t3x-dev/test-project/workspaces',
  useRouter: () => ({ push: vi.fn(), replace: testState.replace }),
  useSearchParams: () => testState.searchParams,
}));

vi.mock('@/components/workspaces/WorkspaceWorkbench', () => ({
  WorkspaceWorkbench: (props: Record<string, unknown>) => {
    testState.workbenchProps = props;
    return <div data-testid="workspace-workbench" />;
  },
}));

vi.mock('@/hooks/materials/useProjectMaterials', () => ({
  useProjectMaterials: () => ({ materials: [], refresh: vi.fn() }),
}));

vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branchHeads: { main: null, 'feature/scenarios': 'sha256:head' },
    branches: ['main', 'feature/scenarios'],
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    error: null,
    loading: false,
    refresh: vi.fn(),
    workspaces: testState.workspaces,
  }),
}));

import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';

describe('ProjectWorkspacesTab scenario routing', () => {
  beforeEach(() => {
    testState.replace.mockReset();
    testState.workbenchProps = null;
    testState.searchParams = new URLSearchParams(
      'branch=feature%2Fscenarios&workspace=workspace_scenario%3Atwo'
    );
    const starter = getProjectWorkspaceStarterCandidate(
      'proj_1',
      [],
      'feature/scenarios',
      'sha256:head'
    );
    const ordinary = {
      ...starter,
      id: 'workspace_branch:feature/scenarios',
      revision: 3,
      targetBranch: 'feature/scenarios',
    };
    testState.workspaces = [
      ordinary,
      scenario(ordinary, 'workspace_scenario:one', 'Scenario one'),
      scenario(ordinary, 'workspace_scenario:two', 'Scenario two'),
      { ...ordinary, id: 'workspace_main', targetBranch: 'main' },
    ];
  });

  it('passes sibling branch scenarios and preserves the requested selection', async () => {
    render(<ProjectWorkspacesTab projectId="proj_1" />);

    await waitFor(() => expect(testState.workbenchProps).not.toBeNull());
    const props = testState.workbenchProps as {
      candidates: WorkspaceCandidate[];
      onSelectedWorkspaceChange: (workspaceId: string) => void;
      selectedWorkspaceId: string;
    };
    expect(props.selectedWorkspaceId).toBe('workspace_scenario:two');
    expect(props.candidates.map((candidate) => candidate.id)).toEqual([
      'workspace_branch:feature/scenarios',
      'workspace_scenario:one',
      'workspace_scenario:two',
    ]);

    act(() => props.onSelectedWorkspaceChange('workspace_scenario:one'));
    expect(testState.replace).toHaveBeenCalledWith(
      '?branch=feature%2Fscenarios&workspace=workspace_scenario%3Aone&tab=workspaces',
      { scroll: false }
    );
  });
});

function scenario(source: WorkspaceCandidate, id: string, name: string): WorkspaceCandidate {
  return {
    ...source,
    id,
    title: name,
    revision: 1,
    scenario: {
      id,
      name,
      createdAt: '2026-08-26T00:00:00.000Z',
      sourceWorkspaceId: source.id,
    },
  };
}
