// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';

vi.mock('next/navigation', () => ({
  usePathname: () => '/t3x-dev/test-project/workspaces',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=workspaces'),
}));

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    workspaces: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe('project foundation previews', () => {
  it('renders a clean main Workspaces workbench for any project id during W1', async () => {
    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(await screen.findByRole('heading', { name: 'T3X Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Main workspace' })).toBeInTheDocument();
    expect(screen.queryByText('PRD audience handoff')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();
    expect(screen.getByText('No source material yet.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the Schemas preview for any project id during A0', () => {
    render(<ProjectSchemasTab projectId="proj_other" />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });

  it('reflects schema bindings from the schema tab in the workspace preview', async () => {
    render(
      <ProjectWorkspacesTab
        projectId="proj_other"
        schemaBindings={{
          byWorkspaceId: {
            'workspace_branch:main': {
              schemaName: 'Docker Compose',
              version: 'v2',
              mode: 'pinned',
            },
          },
        }}
      />
    );

    expect((await screen.findAllByText('Docker Compose v2')).length).toBeGreaterThan(0);
  });
});
