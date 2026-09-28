// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectCommunityTab } from '@/components/project/ProjectCommunityTab';

const mocks = vi.hoisted(() => ({
  guests: { data: undefined as unknown, error: null as Error | null, isLoading: false },
  members: { data: undefined as unknown, error: null as Error | null, isLoading: false },
  prs: vi.fn(),
  workspaces: vi.fn(),
}));

vi.mock('@/hooks/accounts/useProjectCollaboration', () => ({
  useProjectCollaboration: () => ({ guestsQuery: mocks.guests }),
}));
vi.mock('@/hooks/accounts/useNamespaceCollaboration', () => ({
  useNamespaceCollaboration: () => ({ membersQuery: mocks.members }),
}));
vi.mock('@/infrastructure/pullRequests', () => ({ listProjectPullRequests: mocks.prs }));
vi.mock('@/infrastructure/workspaces', () => ({ listProjectWorkspaces: mocks.workspaces }));

beforeEach(() => {
  mocks.prs.mockResolvedValue({ pull_requests: [], counts: { active: 0, merged: 0 } });
  mocks.workspaces.mockResolvedValue([]);
  mocks.guests.data = undefined;
  mocks.guests.error = null;
  mocks.members.data = undefined;
  mocks.members.error = null;
});

describe('ProjectCommunityTab', () => {
  it('shows real empty states without inventing handoff notes', async () => {
    render(<ProjectCommunityTab projectId="project one" />);

    expect(screen.getByRole('heading', { name: 'Project community' })).toBeInTheDocument();
    expect(await screen.findByText('No recent objects available.')).toBeInTheDocument();
    expect(screen.getByText('No collaborators visible.')).toBeInTheDocument();
    expect(screen.getByText(/Handoff notes are not supported yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open workspaces/i })).toHaveAttribute(
      'href',
      '/project/project%20one?tab=workspaces'
    );
  });

  it('keeps the selected branch when navigating to Workspace or commit history', () => {
    render(<ProjectCommunityTab branch="feature/release" projectId="project one" />);

    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute(
      'href',
      '/project/project%20one?tab=workspaces&branch=feature%2Frelease'
    );
    expect(screen.getByRole('link', { name: 'Commit history' })).toHaveAttribute(
      'href',
      '/project/project%20one/history?branch=feature%2Frelease&view=list'
    );
  });

  it('deduplicates namespace members and project guests while retaining both scopes', async () => {
    const principal = { kind: 'human', principal_id: 'user-1', display_name: 'Jordan' };
    mocks.members.data = { members: [{ principal, status: 'active', role: 'viewer' }] };
    mocks.guests.data = {
      namespace_id: 'team-1',
      guests: [{ principal, status: 'active', role: 'editor' }],
    };
    mocks.prs.mockResolvedValue({
      pull_requests: [
        { id: 'pr-1', number: 7, title: 'Update', updated_at: '2026-09-01T00:00:00Z' },
      ],
    });

    render(<ProjectCommunityTab projectId="project one" />);

    expect(await screen.findByText(/Pull request #7: Update/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open pull request' })).toHaveAttribute(
      'href',
      '/project/project%20one?tab=pull-requests&pr=7'
    );
    expect(screen.getAllByText('Jordan')).toHaveLength(1);
    expect(screen.getByText('Namespace · viewer · Project guest · editor')).toBeInTheDocument();
  });

  it('opens a recent Workspace on its actual branch', async () => {
    mocks.workspaces.mockResolvedValue([
      {
        id: 'workspace_7',
        title: 'Release draft',
        targetBranch: 'feature/release',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ]);
    render(<ProjectCommunityTab projectId="project one" />);

    expect(await screen.findByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      '/project/project%20one?tab=workspaces&branch=feature%2Frelease&workspace=workspace_7'
    );
  });
});
