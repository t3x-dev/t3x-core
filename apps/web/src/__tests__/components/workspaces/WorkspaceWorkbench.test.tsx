// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import type { WorkspaceCandidate } from '@/types/workspaces';

const workspaceCandidates: WorkspaceCandidate[] = [
  {
    id: 'workspace_ready',
    projectId: 'proj_1',
    title: 'PRD audience handoff',
    summary: 'Ready source bundle for deterministic YOps apply.',
    status: 'ready_for_yops',
    updatedAt: '2026-06-29T09:30:00.000Z',
    sourceBundle: [
      { id: 'src_chat', type: 'chat', title: 'Audience chat', conversationId: 'conv_1' },
      { id: 'src_doc', type: 'document', title: 'PRD import', fileName: 'prd.md' },
    ],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
  },
  {
    id: 'workspace_draft',
    projectId: 'proj_1',
    title: 'Release cleanup',
    summary: 'Draft release note source collection.',
    status: 'draft',
    updatedAt: '2026-06-28T14:10:00.000Z',
    sourceBundle: [
      {
        id: 'src_release_doc',
        type: 'document',
        title: 'Release outline',
        fileName: 'release.md',
      },
    ],
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'project_default' }],
  },
];

describe('WorkspaceWorkbench', () => {
  it('renders a selectable workspace list with source and schema detail', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All 2' })).toHaveAttribute('aria-pressed', 'true');

    const list = screen.getByRole('list', { name: 'Workspace candidates' });
    expect(within(list).getByRole('button', { name: /PRD audience handoff/ })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /Release cleanup/ })).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: /Release cleanup/ }));

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(within(detail).getByText('Release cleanup')).toBeInTheDocument();
    expect(within(detail).getByText('1 doc')).toBeInTheDocument();
    expect(within(detail).getByText('Release Note Schema v1')).toBeInTheDocument();
    expect(within(detail).getByText('Release outline')).toBeInTheDocument();
  });

  it('filters visible candidates by status and search query', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Draft 1' }));

    const list = screen.getByRole('list', { name: 'Workspace candidates' });
    expect(
      within(list).queryByRole('button', { name: /PRD audience handoff/ })
    ).not.toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /Release cleanup/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search workspaces' }), {
      target: { value: 'schema packet' },
    });

    expect(screen.getByText('No workspaces match the current filters.')).toBeInTheDocument();
  });

  it('renders loading, error, and no-candidate states explicitly', () => {
    const { rerender } = render(
      <WorkspaceWorkbench candidates={[]} projectId="proj_1" viewState="loading" />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading workspaces');

    rerender(
      <WorkspaceWorkbench
        candidates={[]}
        errorMessage="Workspace preview failed"
        projectId="proj_1"
        viewState="error"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace preview failed');

    rerender(<WorkspaceWorkbench candidates={[]} projectId="proj_1" />);
    expect(screen.getByText('No workspaces yet.')).toBeInTheDocument();
  });
});
