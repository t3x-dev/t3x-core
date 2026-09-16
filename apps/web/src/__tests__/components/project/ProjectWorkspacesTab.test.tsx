// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';
import type { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import type { WorkspaceCandidate } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  query: 'tab=workspaces',
  workspaces: [] as WorkspaceCandidate[],
  branchHeads: { main: null } as Record<string, string | null>,
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  props: {} as ComponentProps<typeof WorkspaceWorkbench>,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/project/proj_test',
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock('@/hooks/materials/useProjectMaterials', () => ({
  useProjectMaterials: () => ({ materials: [], refresh: mocks.refresh }),
}));
vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branchHeads: mocks.branchHeads,
    branches: Object.keys(mocks.branchHeads),
    loading: false,
    refresh: mocks.refresh,
  }),
}));
vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    workspaces: mocks.workspaces,
    loading: false,
    error: null,
    refresh: mocks.refresh,
  }),
}));
vi.mock('@/components/workspaces/WorkspaceWorkbench', () => ({
  WorkspaceWorkbench: (props: ComponentProps<typeof WorkspaceWorkbench>) => {
    mocks.props = props;
    return (
      <button
        type="button"
        onClick={() => props.onViewCommitInState?.('sha256:saved', 'feature/test')}
      >
        View State
      </button>
    );
  },
}));
function draft(id: string, branch = 'main'): WorkspaceCandidate {
  return {
    ...getProjectWorkspaceStarterCandidate('proj_test'),
    id,
    title: id,
    targetBranch: branch,
    revision: 4,
  };
}
describe('ProjectWorkspacesTab navigation and persisted drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query = 'tab=workspaces';
    mocks.workspaces = [];
    mocks.branchHeads = { main: null };
  });
  it('starts with a clean draft and exposes branch options to Compose', () => {
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.candidates[0]).toMatchObject({
      projectId: 'proj_test',
      targetBranch: 'main',
      yopsDraft: { operations: [] },
      schemaBindings: [],
    });
    expect(mocks.props.branchOptions).toEqual(['main']);
  });
  it('preserves the explicitly requested draft when several share a branch', () => {
    mocks.workspaces = [draft('first'), draft('requested')];
    mocks.query = 'tab=workspaces&branch=main&workspace=requested';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.selectedWorkspaceId).toBe('requested');
    expect(mocks.props.candidates).toHaveLength(1);
    expect(mocks.props.candidates[0]).toMatchObject({ id: 'requested', revision: 4 });
  });
  it('keeps persisted unbound drafts unbound', () => {
    mocks.workspaces = [draft('persisted')];
    mocks.query = 'tab=workspaces&workspace=persisted';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(
      mocks.props.candidates.find((item: WorkspaceCandidate) => item.id === 'persisted')
    ).toMatchObject({ schemaBindings: [], title: 'persisted' });
  });
  it('passes the source conversation through to Compose', () => {
    mocks.query = 'tab=workspaces&sourceConversation=source_42';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.sourceConversationId).toBe('source_42');
  });
  it('starts the next draft from the advanced main HEAD', () => {
    mocks.branchHeads = { main: 'sha256:advanced' };
    mocks.workspaces = [
      { ...draft('committed'), status: 'committed', lastCommitHash: 'sha256:previous' },
    ];
    mocks.query = 'tab=workspaces&branch=main';
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    expect(mocks.props.candidates[0]).toMatchObject({
      status: 'draft',
      baseCommitHash: 'sha256:advanced',
      yopsDraft: { operations: [] },
    });
  });
  it('opens the exact committed revision and branch in State', () => {
    render(<ProjectWorkspacesTab projectId="proj_test" />);
    fireEvent.click(screen.getByRole('button', { name: 'View State' }));
    const url = new URL(mocks.push.mock.calls[0]![0], 'http://localhost:3000');
    expect(url.pathname).toBe('/project/proj_test');
    expect(url.searchParams.get('commit')).toBe('sha256:saved');
    expect(url.searchParams.get('branch')).toBe('feature/test');
  });
});
