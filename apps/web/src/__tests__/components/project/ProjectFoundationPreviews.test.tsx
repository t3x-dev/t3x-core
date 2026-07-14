// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSchemasTab } from '@/components/project/ProjectSchemasTab';
import { ProjectWorkspacesTab } from '@/components/project/ProjectWorkspacesTab';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=workspaces'),
}));

describe('project foundation previews', () => {
  it('renders the fixture-backed Workspaces workbench for any project id during W1', () => {
    render(<ProjectWorkspacesTab projectId="proj_other" />);

    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PRD audience handoff' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();
    expect(screen.getByText('No source material yet.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the Schemas preview for any project id during A0', () => {
    render(<ProjectSchemasTab projectId="proj_other" />);

    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /v2 Current/i })).toBeChecked();
  });

  it('reflects schema bindings from the schema tab in the workspace preview', () => {
    render(
      <ProjectWorkspacesTab
        projectId="proj_other"
        schemaBindings={{
          byWorkspaceId: {
            workspace_prd_handoff: {
              schemaName: 'Docker Compose',
              version: 'v2',
              mode: 'pinned',
            },
          },
        }}
      />
    );

    expect(screen.getAllByText('Docker Compose v2').length).toBeGreaterThan(0);
  });
});
