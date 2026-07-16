// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import { usePinsStore } from '@/store/pinsStore';
import type { WorkspaceCandidate } from '@/types/workspaces';

function countFetchCalls(calls: Parameters<typeof fetch>[], expectedUrl: string) {
  return calls.filter(([url]) => String(url) === expectedUrl).length;
}

function findFetchCall(calls: Parameters<typeof fetch>[], expectedUrl: string, occurrence = 0) {
  const matches = calls.filter(([url]) => String(url) === expectedUrl);
  expect(matches.length).toBeGreaterThan(occurrence);
  return matches[occurrence];
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
      {
        id: 'src_chat',
        type: 'chat',
        title: 'Audience chat',
        conversationId: 'conv_1',
        previewTurns: [
          {
            id: 'msg-local-draft',
            role: 'user',
            author: 'You',
            content: 'Draft audience note that is still saving.',
            pinnable: false,
          },
          {
            id: 'turn_persisted_1',
            role: 'assistant',
            author: 'Assistant',
            content: 'Persisted turn ready to include as source evidence.',
            pinnable: true,
          },
        ],
      },
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
          path: 'prd/summary/audience',
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
        title: 'PRD review brief',
        type: 'document',
        format: 'markdown',
        status: 'draft_target',
        leafType: 'document',
        instruction: 'Generate a concise PRD review brief from the committed candidate tree.',
        constraints: ['Include summary.audience exactly as committed.'],
        sourceScope: 'Committed PRD candidate plus included source evidence.',
        previewTitle: 'PRD audience handoff leaf',
        previewBody:
          'A markdown brief for reviewers after YOps materializes the PRD audience candidate.',
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
          path: 'metadata.version',
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
          path: 'release_note/sections/-',
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
        leafType: 'document',
        instruction: 'Generate a release-note preview after commit.',
        constraints: ['Do not invent a release version.'],
        sourceScope: 'Committed release-note candidate.',
        previewTitle: 'Release notes leaf',
        previewBody: 'A markdown release-note draft generated from the committed release tree.',
      },
    ],
  },
];

afterEach(() => {
  window.localStorage.removeItem('t3x:workspace-source-chat:proj_1:workspace_ready');
  usePinsStore.setState({ pins: [], initialized: false, currentProjectId: null });
  vi.restoreAllMocks();
});

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

    activateTab(/Validation/);
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(within(detail).getAllByText('PRD audience handoff').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
    expect(within(detail).getByRole('region', { name: 'Validation gates' })).toBeInTheDocument();
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

  it('keeps the pre-commit review dock behind Validation', () => {
    render(
      <WorkspaceWorkbench
        candidates={workspaceCandidates}
        projectId="proj_1"
        selectedWorkspaceId="workspace_draft"
      />
    );

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(screen.queryByRole('region', { name: 'Change Review Dock' })).not.toBeInTheDocument();

    activateTab(/Preview/);
    expect(within(detail).getByRole('region', { name: 'Preview unavailable' })).toBeInTheDocument();
    expect(
      within(detail).getByText('Complete Validation before reviewing the preview')
    ).toBeInTheDocument();
    expect(
      within(detail).queryByRole('region', { name: 'Change Review Dock' })
    ).not.toBeInTheDocument();
  });

  it('uses Source, Ops, Validation, Preview, and Commit as the workspace workflow tabs', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Ops/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Validation/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Preview/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Commit/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /YSchema/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /YOps/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Leaf config/ })).not.toBeInTheDocument();
  });

  it('lets the workflow status rail navigate between workspace steps', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to Commit' }));
    expect(screen.getByRole('tab', { name: /Commit/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Commit readiness' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Validation' }));
    expect(screen.getByRole('tab', { name: /Validation/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('region', { name: 'Validation gates' })).toBeInTheDocument();
  });

  it('shows candidate metadata and workspace tabs without treating chat as the parent surface', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    let detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Ops/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Validation/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Preview/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Commit/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Canvas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Leaf config/ })).not.toBeInTheDocument();

    activateTab(/Validation/);
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
    expect(within(detail).getByRole('button', { name: 'Add manual note source' })).toBeDisabled();
    expect(within(detail).getByRole('button', { name: 'Paste text' })).toBeEnabled();
    expect(within(detail).getByRole('button', { name: 'Paste text' })).toHaveAttribute(
      'title',
      'Paste text as a source material.'
    );
    expect(within(detail).getByRole('button', { name: 'Add URL' })).toBeDisabled();
    expect(within(detail).getByRole('button', { name: 'Add URL' })).toHaveAttribute(
      'title',
      'URL sources need a persisted workspace source endpoint before enabling.'
    );
    expect(within(detail).getByRole('button', { name: 'Delete PRD import' })).toBeInTheDocument();
    expect(within(detail).getByRole('region', { name: 'Parsed text preview' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Re-parse' })).toBeDisabled();
    expect(within(detail).getByRole('button', { name: 'Re-parse' })).toHaveAttribute(
      'title',
      'Re-parse needs a persisted material parse job before enabling.'
    );
    const sourceList = within(detail).getByRole('list', { name: 'Source list' });
    fireEvent.click(within(sourceList).getByRole('button', { name: /^PRD import/ }));
    const includeButtons = within(detail).getAllByRole('button', { name: 'Include' });
    const excludeButtons = within(detail).getAllByRole('button', { name: 'Exclude' });
    const splitButtons = within(detail).getAllByRole('button', { name: 'Split' });
    expect(includeButtons.length).toBeGreaterThan(0);
    expect(excludeButtons.length).toBeGreaterThan(0);
    expect(splitButtons.length).toBeGreaterThan(0);
    includeButtons.forEach((button) => expect(button).toBeDisabled());
    excludeButtons.forEach((button) => expect(button).toBeDisabled());
    splitButtons.forEach((button) => expect(button).toBeDisabled());
    includeButtons.forEach((button) =>
      expect(button).toHaveAttribute(
        'title',
        'Block-level source editing needs persisted source segment operations before enabling.'
      )
    );
    excludeButtons.forEach((button) =>
      expect(button).toHaveAttribute(
        'title',
        'Block-level source editing needs persisted source segment operations before enabling.'
      )
    );
    splitButtons.forEach((button) =>
      expect(button).toHaveAttribute(
        'title',
        'Block-level source editing needs persisted source segment operations before enabling.'
      )
    );
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
    expect(within(detail).getByRole('button', { name: 'Saving turn' })).toBeDisabled();
    expect(within(detail).getByRole('button', { name: 'Saving turn' })).toHaveAttribute(
      'title',
      'This chat turn must finish saving before it can become source evidence.'
    );
    expect(within(detail).getByRole('button', { name: 'Include turn' })).toBeEnabled();
  });

  it('renders Ops, Validation, Preview, and Commit workflow panels', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    activateTab(/Ops/);
    expect(screen.getByRole('heading', { name: 'Ops' })).toBeInTheDocument();
    expect(screen.getAllByText('YOps proposal').length).toBeGreaterThan(0);
    expect(screen.getByRole('complementary', { name: 'Ops cards' })).toBeInTheDocument();
    expect(screen.getByText('Set primary audience from source evidence.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Diff' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Generate YOps proposal' })).toHaveLength(1);
    expect(screen.getByText('yops:')).toBeInTheDocument();
    expect(screen.getByText('- set:')).toBeInTheDocument();
    expect(screen.getByText('path: prd/summary/audience')).toBeInTheDocument();
    expect(screen.getByText('value: "Product and engineering reviewers"')).toBeInTheDocument();

    activateTab(/Validation/);
    expect(screen.getByRole('region', { name: 'Validation gates' })).toBeInTheDocument();
    expect(screen.getByText('Schema gate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toHaveAttribute(
      'title',
      'Validate the proposed YOps before applying it.'
    );
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toHaveAttribute(
      'title',
      'Extract YOps before applying the YAML preview.'
    );

    activateTab(/Preview/);
    expect(screen.getByRole('region', { name: 'Preview unavailable' })).toBeInTheDocument();
    expect(
      screen.getByText('Complete Validation before reviewing the preview')
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'YOps YAML tree' })).not.toBeInTheDocument();

    activateTab(/Commit/);
    expect(screen.getByRole('region', { name: 'Commit readiness' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Commit target branch' })).toHaveValue(
      'feature/prd-audience'
    );
    expect(
      screen.getByRole('button', { name: /Commit · feature\/prd-audience/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commit · feature\/prd-audience/ })).toHaveAttribute(
      'title',
      'Apply YOps before committing the workspace result.'
    );
    expect(screen.getByText('Materialized 0')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Leaf config/ })).not.toBeInTheDocument();
  });

  it('imports pasted text as a source material', async () => {
    usePinsStore.setState({ pins: [], initialized: true, currentProjectId: 'proj_1' });
    const onSourceMaterialUploaded = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          id: 'mat_pasted_audience',
          project_id: 'proj_1',
          source_type: 'document',
          title: 'audience-note.txt',
          filename: 'audience-note.txt',
          mime_type: 'text/plain',
          content_hash: 'hash_pasted_audience',
          content_excerpt: 'Audience: Product reviewers and engineering owners.',
          token_estimate: 8,
          metadata: {},
          created_at: '2026-07-15T00:00:00.000Z',
          archived_at: null,
          created_by: null,
        },
      })
    );

    render(
      <WorkspaceWorkbench
        candidates={workspaceCandidates}
        projectId="proj_1"
        onSourceMaterialUploaded={onSourceMaterialUploaded}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Paste text' }));
    fireEvent.change(screen.getByPlaceholderText('Audience note'), {
      target: { value: 'Audience note' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        'Audience: Product managers, engineering reviewers, and implementation owners.'
      ),
      {
        target: { value: 'Audience: Product reviewers and engineering owners.' },
      }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import text' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/projects/proj_1/materials/document',
        expect.objectContaining({
          body: expect.any(FormData),
          method: 'POST',
        })
      );
    });
    await waitFor(() => expect(onSourceMaterialUploaded).toHaveBeenCalled());
  });

  it('extracts yops before applying the backend preview', async () => {
    const yopsValidateUrl = 'http://localhost:8000/api/v1/yops/validate';
    const createValidateResponse = () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            ok: true,
            applied: 1,
            preview: {
              trees: [
                {
                  key: 'prd',
                  slots: { title: 'PRD audience handoff' },
                  children: [
                    {
                      key: 'summary',
                      slots: { audience: 'Product and engineering reviewers' },
                      children: [],
                    },
                  ],
                },
              ],
              relations: [],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    let resolveApplyResponse: (response: Response) => void = () => undefined;
    const applyResponse = new Promise<Response>((resolve) => {
      resolveApplyResponse = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createValidateResponse())
      .mockImplementationOnce(() => applyResponse);

    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);
    activateTab(/Validation/);

    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Validate proposal/ }));

    await waitFor(() => expect(countFetchCalls(fetchMock.mock.calls, yopsValidateUrl)).toBe(1));
    const [url, init] = findFetchCall(fetchMock.mock.calls, yopsValidateUrl);
    expect(url).toBe(yopsValidateUrl);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      yops: [
        {
          set: {
            path: 'prd/summary/audience',
            value: 'Product and engineering reviewers',
          },
        },
      ],
    });

    expect(await screen.findByText('Proposal validated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeEnabled();
    activateTab(/Preview/);
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toHaveTextContent(
      '1 YOps ready'
    );
    activateTab(/Validation/);

    fireEvent.click(screen.getByRole('button', { name: /Apply YOps/ }));

    await waitFor(() => expect(countFetchCalls(fetchMock.mock.calls, yopsValidateUrl)).toBe(2));
    await act(async () => {
      resolveApplyResponse(createValidateResponse());
      await applyResponse;
    });
    expect(findFetchCall(fetchMock.mock.calls, yopsValidateUrl, 1)[0]).toBe(yopsValidateUrl);
    expect(screen.getByRole('tab', { name: /Preview/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Materialized 1')).toBeInTheDocument();
    expect(screen.getByText('Preview materialized')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Change Review Dock' })).toHaveTextContent(
      'Materialized preview'
    );
    expect(screen.getByRole('region', { name: 'Change Review Dock' })).toHaveTextContent(
      'Ready to commit'
    );
    expect(screen.getByRole('region', { name: 'Change Review Dock' })).toHaveTextContent(
      'YOps valid'
    );
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Change Review Dock' })).getByRole('tab', {
        name: 'Diff',
      })
    );
    const diffDetail = within(screen.getByRole('region', { name: 'Change Review Dock' })).getByRole(
      'region',
      { name: 'Node diff detail' }
    );
    expect(diffDetail).toHaveTextContent('Internal reviewers');
    expect(diffDetail).toHaveTextContent('Product and engineering reviewers');
    expect(screen.queryByRole('region', { name: 'YOps YAML tree' })).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Change Review Dock' })).getByRole('tab', {
        name: 'Overview',
      })
    );
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toHaveTextContent(
      'audience: Product and engineering reviewers'
    );
  });

  it('allows YOps validation and preview when schema review still has blocking gaps', async () => {
    const yopsValidateUrl = 'http://localhost:8000/api/v1/yops/validate';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({
        success: true,
        data: {
          ok: true,
          applied: 1,
          preview: {
            trees: [
              {
                key: 'release_note',
                slots: { title: 'Release cleanup' },
                children: [
                  {
                    key: 'sections',
                    slots: { sections: ['One draft release-note section'] },
                    children: [],
                  },
                ],
              },
            ],
            relations: [],
          },
        },
      })
    );

    render(
      <WorkspaceWorkbench
        candidates={workspaceCandidates}
        projectId="proj_1"
        selectedWorkspaceId="workspace_draft"
      />
    );
    activateTab(/Validation/);

    expect(screen.getByText('Confirm release-note required fields.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Validate proposal/ }));

    await waitFor(() => expect(countFetchCalls(fetchMock.mock.calls, yopsValidateUrl)).toBe(1));
    expect(await screen.findByText('Proposal validated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Apply YOps/ }));

    await waitFor(() => expect(countFetchCalls(fetchMock.mock.calls, yopsValidateUrl)).toBe(2));
    expect(await screen.findByText('Materialized 1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Preview/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toHaveTextContent(
      'One draft release-note section'
    );

    activateTab(/Commit/);
    expect(screen.getByRole('button', { name: /Commit · release\/notes/ })).toBeDisabled();
    expect(screen.getByText('Resolve these blockers before committing.')).toBeInTheDocument();
    expect(
      screen.getByText('Schema review gap: Confirm release-note required fields.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Commit · release\/notes/ })).toHaveAttribute(
      'title',
      'Schema review gap: Confirm release-note required fields.'
    );
  });

  it('sends included source chat turns to candidate extraction', async () => {
    const chatOnlyCandidate: WorkspaceCandidate = {
      ...workspaceCandidates[0],
      sourceBundle: [],
    };
    const extractCandidateUrl =
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready/extract-candidate';
    const pinsUrl = 'http://localhost:8000/api/v1/projects/proj_1/pins';
    const turnsUrl = 'http://localhost:8000/api/v1/turns?';
    window.localStorage.setItem('t3x:workspace-source-chat:proj_1:workspace_ready', 'conv_1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith(turnsUrl)) {
        return jsonResponse({
          success: true,
          data: {
            turns: [
              {
                turn_hash: 'turn_persisted_1',
                project_id: 'proj_1',
                conversation_id: 'conv_1',
                role: 'assistant',
                content: 'Persisted turn ready to include as source evidence.',
                created_at: '2026-07-03T00:00:00.000Z',
              },
            ],
            limit: 100,
            offset: 0,
          },
        });
      }
      if (url === pinsUrl && init?.method !== 'POST') {
        return jsonResponse({
          success: true,
          data: [],
        });
      }
      if (url === pinsUrl && init?.method === 'POST') {
        return jsonResponse({
          success: true,
          data: {
            id: 'pin_turn_1',
            project_id: 'proj_1',
            type: 'conversation_turn',
            ref_id: 'turn_persisted_1',
            selected_assertion_ids: null,
            pinned_at: '2026-07-03T00:00:00.000Z',
            pinned_by: null,
          },
        });
      }
      if (url === extractCandidateUrl) {
        return jsonResponse({
          success: true,
          data: {
            candidate_id: 'candidate_chat',
            workspace: chatOnlyCandidate,
          },
        });
      }
      return jsonResponse({ success: true, data: {} });
    });

    render(<WorkspaceWorkbench candidates={[chatOnlyCandidate]} projectId="proj_1" />);

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    const chatTab = within(detail).getByRole('tab', { name: 'Chat' });
    fireEvent.mouseDown(chatTab, { button: 0, ctrlKey: false });
    fireEvent.click(chatTab);
    expect(
      await within(detail).findByText('Persisted turn ready to include as source evidence.')
    ).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole('button', { name: 'Include turn' }));

    await screen.findByText('1 selected source turns');
    await screen.findByText('1 source');
    fireEvent.click(screen.getByRole('button', { name: 'Generate candidate proposal' }));

    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, extractCandidateUrl)).toBeGreaterThanOrEqual(1)
    );
    const [, extractCandidateInit] = findFetchCall(fetchMock.mock.calls, extractCandidateUrl);
    expect(JSON.parse(String(extractCandidateInit?.body))).toMatchObject({
      sources: [
        {
          id: 'source_chat:conv_1',
          type: 'chat',
          conversationId: 'conv_1',
          previewTurns: [
            {
              id: 'turn_persisted_1',
              content: 'Persisted turn ready to include as source evidence.',
            },
          ],
        },
      ],
      workspace: {
        id: 'workspace_ready',
        sourceBundle: [
          {
            id: 'source_chat:conv_1',
            type: 'chat',
            conversationId: 'conv_1',
            previewTurns: [
              {
                id: 'turn_persisted_1',
                content: 'Persisted turn ready to include as source evidence.',
              },
            ],
          },
        ],
      },
    });
  });

  it('shows an honest empty state when no YOps operations are available', () => {
    const emptyYOpsCandidate: WorkspaceCandidate = {
      ...workspaceCandidates[0],
      sourceBundle: [],
      schemaReview: {
        gaps: ['No source material.'],
        summary: 'Add source material before YOps handoff.',
        verdict: 'needs_review',
      },
      yopsDraft: {
        id: 'draft_empty',
        operations: [],
        proposalMode: 'deterministic_scaffold',
      },
    };

    render(<WorkspaceWorkbench candidates={[emptyYOpsCandidate]} projectId="proj_1" />);
    activateTab(/Ops/);

    expect(screen.getByText('0 ops')).toBeInTheDocument();
    expect(screen.getAllByText('No proposed YOps operations yet.').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Add source evidence and generate a YOps proposal/).length).toBe(1);
    expect(screen.queryByText('path: node/slot')).not.toBeInTheDocument();
    expect(screen.queryByText('value: "new value"')).not.toBeInTheDocument();
    activateTab(/Validation/);
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toHaveAttribute(
      'title',
      'No proposed YOps operations are available yet.'
    );
  });

  it('does not mark an empty generated YOps draft as proposal ready', async () => {
    const emptyYOpsCandidate: WorkspaceCandidate = {
      ...workspaceCandidates[0],
      sourceBundle: [],
      schemaReview: {
        gaps: ['No source material.'],
        summary: 'Add source material before YOps handoff.',
        verdict: 'needs_review',
      },
      yopsDraft: {
        id: 'draft_empty',
        operations: [],
        proposalMode: 'deterministic_scaffold',
      },
    };
    const yopsDraftUrl =
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready/yops-draft';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          candidate_id: 'candidate_empty',
          yops_draft_id: 'draft_empty',
          workspace: emptyYOpsCandidate,
        },
      })
    );

    render(<WorkspaceWorkbench candidates={[emptyYOpsCandidate]} projectId="proj_1" />);
    activateTab(/Ops/);

    fireEvent.click(screen.getByRole('button', { name: 'Generate YOps proposal' }));
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, yopsDraftUrl)).toBeGreaterThanOrEqual(1)
    );

    expect(screen.getByRole('tab', { name: /Ops/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Proposal ready')).not.toBeInTheDocument();
    expect(screen.getAllByText(/No YOps operations were generated/).length).toBeGreaterThan(0);
    activateTab(/Validation/);
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toBeDisabled();
  });

  it('reopens committed workspace state after regenerating a YOps proposal', async () => {
    const committedCandidate: WorkspaceCandidate = {
      ...workspaceCandidates[0],
      status: 'committed',
      lastCommitHash: 'sha256:old-workspace-commit',
    };
    const { lastCommitHash: _lastCommitHash, ...reopenedCandidateBase } = committedCandidate;
    const reopenedCandidate: WorkspaceCandidate = {
      ...reopenedCandidateBase,
      baseCommitHash: 'sha256:old-workspace-commit',
      status: 'schema_review',
      yopsDraft: {
        ...committedCandidate.yopsDraft,
        id: 'draft:reopened',
      },
    };
    const yopsDraftUrl =
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready/yops-draft';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({
        success: true,
        data: {
          candidate_id: 'candidate_reopened',
          yops_draft_id: 'draft:reopened',
          workspace: reopenedCandidate,
        },
      })
    );

    render(<WorkspaceWorkbench candidates={[committedCandidate]} projectId="proj_1" />);
    activateTab(/Ops/);

    expect(screen.getByText('Committed to state')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate YOps proposal' }));
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, yopsDraftUrl)).toBeGreaterThanOrEqual(1)
    );

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Validation/ })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
    expect(screen.queryByText('Committed to state')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toBeEnabled();
  });

  it('connects extract candidate, send to ops, validate, preview, and commit gates', async () => {
    const extractedWorkspace: WorkspaceCandidate = {
      ...workspaceCandidates[0],
      schemaCandidate: {
        proposalMode: 'deterministic_scaffold',
        summary: 'Deterministic scaffold mapped 10 schema fields from stored source material.',
        fields: [
          {
            id: 'field_summary',
            path: 'summary',
            label: 'Summary',
            type: 'object',
            required: true,
            status: 'covered',
            sourceRefs: 2,
            children: [
              {
                id: 'field_summary_problem',
                path: 'summary.problem',
                label: 'Problem',
                type: 'string',
                required: true,
                status: 'covered',
                value: 'Backend PRD import lacks a confirmed reviewer handoff.',
                evidence: 'PRD import: Backend PRD import lacks a confirmed reviewer handoff.',
                sourceRefs: 2,
              },
              {
                id: 'field_summary_audience',
                path: 'summary.audience',
                label: 'Audience',
                type: 'string',
                required: true,
                status: 'covered',
                value: 'Backend product reviewers',
                evidence: 'PRD import: audience is backend product reviewers.',
                sourceRefs: 2,
              },
              {
                id: 'field_summary_outcome',
                path: 'summary.outcome',
                label: 'Outcome',
                type: 'string',
                required: true,
                status: 'covered',
                value: 'Send reviewed PRD candidates to YOps with deterministic operations.',
                evidence:
                  'PRD import: Send reviewed PRD candidates to YOps with deterministic operations.',
                sourceRefs: 2,
              },
            ],
          },
          {
            id: 'field_requirements',
            path: 'requirements',
            label: 'Requirements',
            type: 'object',
            required: true,
            status: 'needs_confirmation',
            sourceRefs: 2,
            children: [
              {
                id: 'field_requirements_backend_prd_handoff',
                path: 'requirements.backend_prd_handoff',
                label: 'Backend Prd Handoff',
                type: 'object',
                required: true,
                status: 'needs_confirmation',
                sourceRefs: 2,
                children: [
                  {
                    id: 'field_requirements_backend_prd_handoff_title',
                    path: 'requirements.backend_prd_handoff.title',
                    label: 'Title',
                    type: 'string',
                    required: true,
                    status: 'covered',
                    value: 'Backend PRD handoff',
                    evidence: 'PRD import: Backend PRD handoff.',
                    sourceRefs: 2,
                  },
                  {
                    id: 'field_requirements_backend_prd_handoff_priority',
                    path: 'requirements.backend_prd_handoff.priority',
                    label: 'Priority',
                    type: 'enum',
                    required: true,
                    status: 'needs_confirmation',
                    value: 'should',
                    sourceRefs: 0,
                  },
                  {
                    id: 'field_requirements_backend_prd_handoff_acceptance',
                    path: 'requirements.backend_prd_handoff.acceptance',
                    label: 'Acceptance',
                    type: 'array',
                    required: true,
                    status: 'covered',
                    value: 'YOps receives reviewed candidate fields from backend source evidence.',
                    evidence:
                      'PRD import: YOps receives reviewed candidate fields from backend source evidence.',
                    sourceRefs: 2,
                  },
                ],
              },
            ],
          },
          {
            id: 'field_milestones',
            path: 'milestones',
            label: 'Milestones',
            type: 'object',
            required: false,
            status: 'needs_confirmation',
            sourceRefs: 0,
            children: [
              {
                id: 'field_milestones_candidate_milestone',
                path: 'milestones.candidate_milestone',
                label: 'Candidate Milestone',
                type: 'object',
                required: false,
                status: 'needs_confirmation',
                sourceRefs: 0,
                children: [
                  {
                    id: 'field_milestones_candidate_milestone_title',
                    path: 'milestones.candidate_milestone.title',
                    label: 'Title',
                    type: 'string',
                    required: false,
                    status: 'needs_confirmation',
                    sourceRefs: 0,
                  },
                  {
                    id: 'field_milestones_candidate_milestone_sequence',
                    path: 'milestones.candidate_milestone.sequence',
                    label: 'Sequence',
                    type: 'integer',
                    required: false,
                    status: 'needs_confirmation',
                    sourceRefs: 0,
                  },
                ],
              },
            ],
          },
        ],
      },
      schemaReview: {
        verdict: 'ready',
        summary: 'Candidate proposal mapped from source material.',
        gaps: [],
      },
    };
    const yopsWorkspace: WorkspaceCandidate = {
      ...extractedWorkspace,
      yopsDraft: {
        proposalMode: 'deterministic_scaffold',
        id: 'draft:candidate:backend',
        operations: [
          {
            id: 'op_backend_1',
            op: 'set',
            path: 'prd/summary/problem',
            summary: 'Set problem from reviewed candidate proposal.',
            beforeValue: '',
            afterValue: 'Backend PRD import lacks a confirmed reviewer handoff.',
            reason:
              'Deterministic scaffold proposal covered summary.problem from included source material.',
            sourceRefs: ['src_doc'],
          },
          {
            id: 'op_backend_2',
            op: 'set',
            path: 'prd/summary/audience',
            summary: 'Set audience from reviewed candidate proposal.',
            beforeValue: '',
            afterValue: 'Backend product reviewers',
            reason:
              'Deterministic scaffold proposal covered summary.audience from included source material.',
            sourceRefs: ['src_doc'],
          },
          {
            id: 'op_backend_3',
            op: 'set',
            path: 'prd/summary/outcome',
            summary: 'Set outcome from reviewed candidate proposal.',
            beforeValue: '',
            afterValue: 'Send reviewed PRD candidates to YOps with deterministic operations.',
            reason:
              'Deterministic scaffold proposal covered summary.outcome from included source material.',
            sourceRefs: ['src_doc'],
          },
          {
            id: 'op_backend_4',
            op: 'set',
            path: 'prd/requirements/backend_prd_handoff/title',
            summary: 'Set requirement title from reviewed candidate proposal.',
            beforeValue: '',
            afterValue: 'Backend PRD handoff',
            reason:
              'Deterministic scaffold proposal covered requirements.backend_prd_handoff.title from included source material.',
            sourceRefs: ['src_doc'],
          },
          {
            id: 'op_backend_5',
            op: 'add',
            path: 'prd/requirements/backend_prd_handoff/acceptance/-',
            summary: 'Append requirement acceptance from reviewed candidate proposal.',
            beforeValue: 'No value recorded',
            afterValue: 'YOps receives reviewed candidate fields from backend source evidence.',
            reason:
              'Deterministic scaffold proposal covered requirements.backend_prd_handoff.acceptance from included source material.',
            sourceRefs: ['src_doc'],
          },
        ],
      },
    };
    const extractCandidateUrl =
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready/extract-candidate';
    const yopsDraftUrl =
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready/yops-draft';
    const saveWorkspaceUrl =
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready';
    const yopsValidateUrl = 'http://localhost:8000/api/v1/yops/validate';
    const workspaceCommitUrl =
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready/commit';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === extractCandidateUrl) {
        return jsonResponse({
          success: true,
          data: {
            candidate_id: 'candidate:backend',
            workspace: extractedWorkspace,
          },
        });
      }
      if (url === yopsDraftUrl) {
        return jsonResponse({
          success: true,
          data: {
            candidate_id: 'candidate:backend',
            workspace: yopsWorkspace,
            yops_draft_id: 'draft:candidate:backend',
          },
        });
      }
      if (url === saveWorkspaceUrl) {
        return jsonResponse({
          success: true,
          data: {
            candidate_id: 'candidate:backend',
            workspace: yopsWorkspace,
            yops_draft_id: 'draft:candidate:backend',
          },
        });
      }
      if (url === yopsValidateUrl) {
        return jsonResponse({
          success: true,
          data: {
            ok: true,
            applied: 5,
            preview: {
              trees: [
                {
                  key: 'prd',
                  slots: { title: 'PRD audience handoff' },
                  children: [
                    {
                      key: 'summary',
                      slots: {
                        audience: 'Backend product reviewers',
                        outcome:
                          'Send reviewed PRD candidates to YOps with deterministic operations.',
                        problem: 'Backend PRD import lacks a confirmed reviewer handoff.',
                      },
                      children: [],
                    },
                    {
                      key: 'requirements',
                      slots: {},
                      children: [
                        {
                          key: 'backend_prd_handoff',
                          slots: {
                            acceptance: [
                              'YOps receives reviewed candidate fields from backend source evidence.',
                            ],
                            title: 'Backend PRD handoff',
                          },
                          children: [],
                        },
                      ],
                    },
                    {
                      key: 'milestones',
                      slots: {},
                      children: [],
                    },
                  ],
                },
              ],
              relations: [],
            },
          },
        });
      }
      if (url === workspaceCommitUrl) {
        return jsonResponse({
          success: true,
          data: {
            candidate_id: 'candidate:backend',
            commit: { hash: 'sha256:workspace-commit' },
            workspace: {
              ...yopsWorkspace,
              lastCommitHash: 'sha256:workspace-commit',
              status: 'committed',
            },
            yops_draft_id: 'draft:candidate:backend',
          },
        });
      }
      throw new Error(`Unhandled fetch ${url}`);
    });

    usePinsStore.setState({
      pins: [
        {
          id: 'pin_mat_prd',
          project_id: 'proj_1',
          type: 'import',
          ref_id: 'mat_prd',
          pinned_at: '2026-07-03T00:00:00.000Z',
        },
      ],
    });

    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate candidate proposal' }));
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, extractCandidateUrl)).toBeGreaterThanOrEqual(1)
    );
    const [, extractCandidateInit] = findFetchCall(fetchMock.mock.calls, extractCandidateUrl);
    expect(JSON.parse(String(extractCandidateInit?.body))).toMatchObject({
      sources: [{ id: 'src_doc', materialId: 'mat_prd' }],
      workspace: {
        id: 'workspace_ready',
        projectId: 'proj_1',
        sourceBundle: [{ id: 'src_doc', materialId: 'mat_prd' }],
      },
    });
    expect(screen.getByRole('tab', { name: /Ops/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'YOps proposal' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate YOps proposal' }));
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, yopsDraftUrl)).toBeGreaterThanOrEqual(1)
    );
    findFetchCall(fetchMock.mock.calls, yopsDraftUrl);
    expect(await screen.findByText('Proposal ready')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Validation/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('region', { name: 'Validation gates' })).toBeInTheDocument();
    activateTab(/Ops/);
    expect(screen.getByText('value: "Backend product reviewers"')).toBeInTheDocument();
    expect(
      screen.getByText(
        'value: "YOps receives reviewed candidate fields from backend source evidence."'
      )
    ).toBeInTheDocument();

    activateTab(/Validation/);
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Validate proposal/ }));
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, yopsValidateUrl)).toBeGreaterThanOrEqual(1)
    );
    const [, generateInit] = findFetchCall(fetchMock.mock.calls, yopsValidateUrl);
    expect(JSON.parse(String(generateInit?.body))).toMatchObject({
      yops: [
        {
          set: {
            path: 'prd/summary/problem',
            value: 'Backend PRD import lacks a confirmed reviewer handoff.',
          },
        },
        {
          set: {
            path: 'prd/summary/audience',
            value: 'Backend product reviewers',
          },
        },
        {
          set: {
            path: 'prd/summary/outcome',
            value: 'Send reviewed PRD candidates to YOps with deterministic operations.',
          },
        },
        {
          set: {
            path: 'prd/requirements/backend_prd_handoff/title',
            value: 'Backend PRD handoff',
          },
        },
        {
          append: {
            path: 'prd/requirements/backend_prd_handoff/acceptance',
            value: 'YOps receives reviewed candidate fields from backend source evidence.',
          },
        },
      ],
    });
    expect(await screen.findByText('Proposal validated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Apply YOps/ }));
    await screen.findByText('Materialized 5');

    expect(screen.getByRole('tab', { name: /Preview/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toHaveTextContent(
      'Backend product reviewers'
    );

    activateTab(/Commit/);
    expect(screen.getByRole('button', { name: /Commit · feature\/prd-audience/ })).toBeEnabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Commit target branch' }), {
      target: { value: 'main' },
    });
    expect(screen.getByRole('button', { name: /Commit · main/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Commit · main/ }));

    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, yopsValidateUrl)).toBeGreaterThanOrEqual(2)
    );
    const [, applyInit] = findFetchCall(fetchMock.mock.calls, yopsValidateUrl, 1);
    expect(JSON.parse(String(applyInit?.body))).toMatchObject({
      yops: [
        {
          set: {
            path: 'prd/summary/problem',
            value: 'Backend PRD import lacks a confirmed reviewer handoff.',
          },
        },
        {
          set: {
            path: 'prd/summary/audience',
            value: 'Backend product reviewers',
          },
        },
        {
          set: {
            path: 'prd/summary/outcome',
            value: 'Send reviewed PRD candidates to YOps with deterministic operations.',
          },
        },
        {
          set: {
            path: 'prd/requirements/backend_prd_handoff/title',
            value: 'Backend PRD handoff',
          },
        },
        {
          append: {
            path: 'prd/requirements/backend_prd_handoff/acceptance',
            value: 'YOps receives reviewed candidate fields from backend source evidence.',
          },
        },
      ],
    });
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, saveWorkspaceUrl)).toBeGreaterThanOrEqual(1)
    );
    const [, saveInit] = findFetchCall(fetchMock.mock.calls, saveWorkspaceUrl);
    expect(saveInit?.method).toBe('PATCH');
    expect(JSON.parse(String(saveInit?.body))).toMatchObject({
      workspace: {
        id: 'workspace_ready',
        projectId: 'proj_1',
        targetBranch: 'main',
        yopsDraft: { id: 'draft:candidate:backend' },
      },
    });
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, workspaceCommitUrl)).toBeGreaterThanOrEqual(1)
    );
    const [commitUrl, commitInit] = findFetchCall(fetchMock.mock.calls, workspaceCommitUrl);
    expect(commitUrl).toBe(
      'http://localhost:8000/api/v1/projects/proj_1/workspaces/workspace_ready/commit'
    );
    expect(JSON.parse(String(commitInit?.body))).toMatchObject({
      content: {
        relations: [],
        trees: [
          {
            children: expect.any(Array),
            key: 'prd',
            slots: { title: 'PRD audience handoff' },
          },
        ],
      },
      message: 'Workspace commit: PRD audience handoff',
    });

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Commit/ })).toHaveAttribute('aria-selected', 'true')
    );
    expect(screen.getAllByText('sha256:workspace-commit').length).toBeGreaterThan(0);
    expect(screen.queryByRole('tab', { name: /Leaf config/ })).not.toBeInTheDocument();
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
