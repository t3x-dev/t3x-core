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
    baseCommitHash: 'sha256:base-prd',
    targetBranch: 'feature/prd-audience',
    sourceBundle: [
      { id: 'src_chat', type: 'chat', title: 'Audience chat', conversationId: 'conv_1' },
      { id: 'src_doc', type: 'document', title: 'PRD import', fileName: 'prd.md' },
    ],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
    schemaReview: {
      verdict: 'ready',
      summary: 'Ready for YOps apply after schema alignment.',
      gaps: [],
    },
    yopsDraft: {
      id: 'draft_prd',
      operations: [
        {
          id: 'op_1',
          op: 'set',
          path: '/audience/primary',
          summary: 'Set primary audience from source evidence.',
        },
      ],
    },
    outputTargets: [
      {
        id: 'target_prd_markdown',
        title: 'PRD Markdown export',
        type: 'document',
        format: 'markdown',
        status: 'draft_target',
      },
    ],
  },
  {
    id: 'workspace_draft',
    projectId: 'proj_1',
    title: 'Release cleanup',
    summary: 'Draft release note source collection.',
    status: 'draft',
    updatedAt: '2026-06-28T14:10:00.000Z',
    baseCommitHash: null,
    targetBranch: 'release/notes',
    sourceBundle: [
      {
        id: 'src_release_doc',
        type: 'document',
        title: 'Release outline',
        fileName: 'release.md',
      },
    ],
    schemaBindings: [{ schemaName: 'Release Note Schema', version: 'v1', mode: 'project_default' }],
    schemaReview: {
      verdict: 'needs_review',
      summary: 'Needs schema confirmation before YOps apply.',
      gaps: ['Confirm release-note required fields.'],
    },
    yopsDraft: {
      id: 'draft_release',
      operations: [
        {
          id: 'op_release_1',
          op: 'add',
          path: '/sections/-',
          summary: 'Add release-note section placeholder.',
        },
      ],
    },
    outputTargets: [
      {
        id: 'target_release_notes',
        title: 'Release notes preview',
        type: 'document',
        format: 'markdown',
        status: 'draft_target',
      },
    ],
  },
];

function activateTab(name: string) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

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

  it('shows candidate metadata and workspace tabs without treating chat as the parent surface', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(within(detail).getByText('Base commit')).toBeInTheDocument();
    expect(within(detail).getByText('sha256:base-prd')).toBeInTheDocument();
    expect(within(detail).getByText('Target branch')).toBeInTheDocument();
    expect(within(detail).getByText('feature/prd-audience')).toBeInTheDocument();
    expect(within(detail).getByText('Schema version')).toBeInTheDocument();
    expect(within(detail).getByText('PRD Schema v2')).toBeInTheDocument();
    expect(within(detail).getByText('Source count')).toBeInTheDocument();
    expect(within(detail).getByText('2 sources')).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Schema Review' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'YOps Draft' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Output Targets' })).toBeInTheDocument();
    expect(within(detail).getByText('chat')).toBeInTheDocument();
    expect(within(detail).getByText('document')).toBeInTheDocument();
  });

  it('renders schema review, read-only yops draft, canvas, and draft output target tabs', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    activateTab('Schema Review');
    expect(screen.getByText('Ready for YOps apply after schema alignment.')).toBeInTheDocument();

    activateTab('YOps Draft');
    expect(screen.getByText('Read-only YOps draft')).toBeInTheDocument();
    expect(screen.getByText('set')).toBeInTheDocument();
    expect(screen.getByText('/audience/primary')).toBeInTheDocument();

    activateTab('Canvas');
    expect(screen.getByText('Source bundle')).toBeInTheDocument();
    expect(screen.getByText('Candidate')).toBeInTheDocument();
    expect(screen.getByText('YOps draft')).toBeInTheDocument();
    expect(screen.getByText('Commit target')).toBeInTheDocument();

    activateTab('Output Targets');
    expect(screen.getByRole('tab', { name: 'Output Targets' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Draft target')).toBeInTheDocument();
    expect(screen.getByText('PRD Markdown export')).toBeInTheDocument();
    expect(screen.getByText('Not a committed artifact')).toBeInTheDocument();
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
