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
      {
        id: 'src_doc',
        type: 'document',
        title: 'PRD import',
        fileName: 'prd.md',
        materialId: 'mat_prd',
      },
    ],
    schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
    schemaCandidate: {
      summary: 'Source evidence supports the PRD audience handoff fields.',
      fields: [
        {
          id: 'field_prd_summary',
          path: 'summary',
          label: 'Summary',
          type: 'object',
          required: true,
          status: 'covered',
          sourceRefs: 2,
          children: [
            {
              id: 'field_prd_summary_audience',
              path: 'summary.audience',
              label: 'Audience',
              type: 'string',
              required: true,
              status: 'covered',
              value: 'Product and engineering reviewers',
              evidence: 'Audience chat and PRD import both name product and engineering reviewers.',
              sourceRefs: 2,
            },
          ],
        },
      ],
    },
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
          beforeValue: 'Internal reviewers',
          afterValue: 'Product and engineering reviewers',
          reason: 'Source evidence confirms product and engineering reviewers as the PRD audience.',
          sourceRefs: ['src_chat', 'src_doc'],
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
    schemaCandidate: {
      summary: 'Release-note candidate still needs required release metadata.',
      fields: [
        {
          id: 'field_release_version',
          path: 'release.version',
          label: 'Release version',
          type: 'string',
          required: true,
          status: 'missing',
          sourceRefs: 0,
        },
      ],
    },
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
          beforeValue: 'No section placeholder',
          afterValue: 'One draft release-note section',
          reason: 'The release outline suggests a section, but the required shape needs review.',
          sourceRefs: ['src_release_doc'],
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

function activateTab(name: string | RegExp) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
}

describe('WorkspaceWorkbench', () => {
  it('renders current workspace detail without an internal workspace selector', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All 2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Draft 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox', { name: 'Search workspaces' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sort workspaces')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();

    activateTab(/YSchema/);
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(within(detail).getAllByText('PRD audience handoff').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
    expect(within(detail).getByText('YSchema PRD Review')).toBeInTheDocument();
  });

  it('uses the externally selected workspace id for the current workspace', () => {
    render(
      <WorkspaceWorkbench
        candidates={workspaceCandidates}
        projectId="proj_1"
        selectedWorkspaceId="workspace_draft"
      />
    );

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(within(detail).getAllByText('Release cleanup').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('Release Note Schema v1').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('Release outline').length).toBeGreaterThan(0);
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();
  });

  it('shows candidate metadata and workspace tabs without treating chat as the parent surface', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    let detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /YSchema/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /YOps/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Leaf config/ })).toBeInTheDocument();

    activateTab(/YSchema/);
    detail = screen.getByRole('region', { name: 'Workspace detail' });

    expect(within(detail).getByText('Base')).toBeInTheDocument();
    expect(within(detail).getByText('sha256:base-prd')).toBeInTheDocument();
    expect(within(detail).getByText('Branch')).toBeInTheDocument();
    expect(within(detail).getByText('feature/prd-audience')).toBeInTheDocument();
    expect(within(detail).getByText('Schema')).toBeInTheDocument();
    expect(within(detail).getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
    expect(within(detail).getByText('Sources')).toBeInTheDocument();
    expect(within(detail).getByText('1 chat, 1 doc')).toBeInTheDocument();

    activateTab('Source');
    detail = screen.getByRole('region', { name: 'Workspace detail' });

    expect(
      within(detail).getByRole('complementary', { name: 'Source imports and bundle' })
    ).toBeInTheDocument();
    expect(within(detail).getByRole('tab', { name: /Materials/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(within(detail).queryByRole('tab', { name: 'Parsed text' })).not.toBeInTheDocument();
    expect(within(detail).getAllByText('chat').length).toBeGreaterThan(0);
    expect(within(detail).getByText('document')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Import doc' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Upload PDF/doc' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Delete PRD import' })).toBeInTheDocument();
    expect(within(detail).getByRole('region', { name: 'Parsed text preview' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Include preview' })).toBeInTheDocument();

    const chatTab = within(detail).getByRole('tab', { name: 'Chat' });
    fireEvent.mouseDown(chatTab, { button: 0, ctrlKey: false });
    fireEvent.click(chatTab);
    expect(within(detail).getByRole('region', { name: 'Source chat' })).toBeInTheDocument();
    expect(
      within(detail).getByPlaceholderText(
        'Ask the model, paste source text, or describe a requirement change...'
      )
    ).toBeInTheDocument();
  });

  it('renders schema review, split yops workspace, canvas, and draft output target tabs', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    activateTab(/YSchema/);
    expect(screen.getByText('YSchema PRD Review')).toBeInTheDocument();
    expect(
      screen.getByText('Validate candidate structure before YOps extraction.')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Candidate tree').length).toBeGreaterThan(0);
    expect(screen.getByText('Candidate PRD')).toBeInTheDocument();
    expect(screen.getByText('audience: Product and engineering reviewers')).toBeInTheDocument();
    expect(screen.getByText('YOps suggestions')).toBeInTheDocument();
    expect(screen.getByText('1 suggested operation from this candidate.')).toBeInTheDocument();
    expect(screen.getByText('Proposed YOps')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Diff' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Send to YOps' })).toHaveLength(1);

    activateTab(/YOps/);
    expect(screen.getByText('YOps workspace')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'YOps editor' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate ops/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commit · main/ })).toBeInTheDocument();
    expect(screen.getByText('Materialized 0')).toBeInTheDocument();
    expect(screen.getByText('Pending 1')).toBeInTheDocument();
    expect(screen.getByText('yops:')).toBeInTheDocument();
    expect(screen.getByText('- set:')).toBeInTheDocument();
    expect(screen.getByText('path: /audience/primary')).toBeInTheDocument();
    expect(screen.getByText('value: "Product and engineering reviewers"')).toBeInTheDocument();
    const yopsTree = screen.getByRole('region', { name: 'YOps YAML tree' });
    expect(yopsTree).toHaveTextContent('prd:');
    expect(yopsTree).toHaveTextContent('summary:');
    expect(yopsTree).toHaveTextContent('audience: Product and engineering reviewers');
    expect(screen.getByText('Human')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();

    activateTab('Canvas');
    expect(screen.getByText('Source bundle')).toBeInTheDocument();
    expect(screen.getByText('Candidate')).toBeInTheDocument();
    expect(screen.getByText('YOps draft')).toBeInTheDocument();
    expect(screen.getByText('Commit target')).toBeInTheDocument();

    activateTab(/Leaf config/);
    expect(screen.getByRole('tab', { name: /Leaf config/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Draft target')).toBeInTheDocument();
    expect(screen.getByText('PRD Markdown export')).toBeInTheDocument();
    expect(screen.getByText('Not a committed artifact')).toBeInTheDocument();
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
