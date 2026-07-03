// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
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

    activateTab(/YSchema/);
    expect(screen.queryByRole('list', { name: 'Workspace candidates' })).not.toBeInTheDocument();

    const detail = screen.getByRole('region', { name: 'Workspace detail' });
    expect(within(detail).getAllByText('PRD audience handoff').length).toBeGreaterThan(0);
    expect(within(detail).getAllByText('PRD Schema v2').length).toBeGreaterThan(0);
    expect(within(detail).getByText('YSchema PRD Check')).toBeInTheDocument();
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
    expect(screen.queryByRole('tab', { name: 'Canvas' })).not.toBeInTheDocument();
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

  it('renders schema review, split yops workspace, and draft output target tabs', () => {
    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    activateTab(/YSchema/);
    expect(screen.getByText('YSchema PRD Check')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Review the candidate proposal, then run deterministic schema checks before YOps proposal.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('Candidate tree').length).toBeGreaterThan(0);
    expect(screen.getByText('Candidate PRD')).toBeInTheDocument();
    expect(screen.getByText('audience: Product and engineering reviewers')).toBeInTheDocument();
    expect(screen.getAllByText('YOps proposal').length).toBeGreaterThan(0);
    expect(screen.getByText('1 operation staged by fixture proposal.')).toBeInTheDocument();
    expect(screen.getByText('Current YOps proposal')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Diff' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Generate YOps proposal' })).toHaveLength(1);

    activateTab(/YOps/);
    expect(screen.getByText('YOps proposal workspace')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'YOps proposal' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validate proposal/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Commit · main/ })).toBeInTheDocument();
    expect(screen.getByText('Materialized 0')).toBeInTheDocument();
    expect(screen.getByText('Pending 1')).toBeInTheDocument();
    expect(screen.getByText('yops:')).toBeInTheDocument();
    expect(screen.getByText('- set:')).toBeInTheDocument();
    expect(screen.getByText('path: prd/summary/audience')).toBeInTheDocument();
    expect(screen.getByText('value: "Product and engineering reviewers"')).toBeInTheDocument();
    const yopsTree = screen.getByRole('region', { name: 'YOps YAML tree' });
    expect(yopsTree).toHaveTextContent('No materialized YAML yet');
    expect(yopsTree).toHaveTextContent('Validate the YOps proposal first');
    expect(yopsTree).not.toHaveTextContent('audience: Product and engineering reviewers');
    expect(screen.getByText('Human')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();

    activateTab(/Leaf config/);
    expect(screen.getByRole('tab', { name: /Leaf config/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('complementary', { name: 'Leaf draft configs' })).toBeInTheDocument();
    expect(screen.getByText('Pre-commit config')).toBeInTheDocument();
    expect(screen.getAllByText('PRD review brief').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting for workspace commit')).toBeInTheDocument();
    expect(
      screen.getByText('Generate a concise PRD review brief from the committed candidate tree.')
    ).toBeInTheDocument();
    expect(screen.getByText('Include summary.audience exactly as committed.')).toBeInTheDocument();
    expect(screen.getByText('PRD audience handoff leaf')).toBeInTheDocument();
  });

  it('extracts yops before applying the backend preview', async () => {
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
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createValidateResponse())
      .mockResolvedValueOnce(createValidateResponse());

    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);
    activateTab(/YOps/);

    expect(screen.getByRole('button', { name: /Apply YOps/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Validate proposal/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/yops/validate');
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
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toHaveTextContent(
      '1 YOps ready'
    );

    fireEvent.click(screen.getByRole('button', { name: /Apply YOps/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/api/v1/yops/validate');
    expect(await screen.findByText('Materialized 1')).toBeInTheDocument();
    expect(screen.getByText('Pending 0')).toBeInTheDocument();
    expect(screen.getByText('Preview materialized')).toBeInTheDocument();
  });

  it('connects extract candidate, send to yops, apply, commit, and leaf config gates', async () => {
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
    const yopsValidateUrl = 'http://localhost:8000/api/v1/yops/validate';
    const commitsUrl = 'http://localhost:8000/api/v1/commits';
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
      if (url === commitsUrl) {
        return jsonResponse({
          success: true,
          data: { commit: { hash: 'sha256:workspace-commit' } },
        });
      }
      throw new Error(`Unhandled fetch ${url}`);
    });

    render(<WorkspaceWorkbench candidates={workspaceCandidates} projectId="proj_1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate candidate proposal' }));
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, extractCandidateUrl)).toBeGreaterThanOrEqual(1)
    );
    const [, extractCandidateInit] = findFetchCall(fetchMock.mock.calls, extractCandidateUrl);
    expect(JSON.parse(String(extractCandidateInit?.body))).toMatchObject({
      sources: [{ id: 'src_chat' }, { id: 'src_doc', materialId: 'mat_prd' }],
      workspace: { id: 'workspace_ready', projectId: 'proj_1' },
    });
    expect(
      await screen.findByText('deterministic scaffold mapped from the current source bundle.')
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /YSchema/ })).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByText('problem: Backend PRD import lacks a confirmed reviewer handoff.')
    ).toBeInTheDocument();
    expect(screen.getByText('audience: Backend product reviewers')).toBeInTheDocument();
    expect(screen.getByText('requirements:')).toBeInTheDocument();
    expect(screen.getByText('backend_prd_handoff:')).toBeInTheDocument();
    expect(screen.getByText('priority: should')).toBeInTheDocument();
    expect(
      screen.getByText(
        'acceptance: YOps receives reviewed candidate fields from backend source evidence.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate YOps proposal' }));
    await waitFor(() =>
      expect(countFetchCalls(fetchMock.mock.calls, yopsDraftUrl)).toBeGreaterThanOrEqual(1)
    );
    findFetchCall(fetchMock.mock.calls, yopsDraftUrl);
    expect(await screen.findByText('Proposal ready')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /YOps/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('value: "Backend product reviewers"')).toBeInTheDocument();
    expect(
      screen.getByText(
        'value: "YOps receives reviewed candidate fields from backend source evidence."'
      )
    ).toBeInTheDocument();
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
    expect(screen.getByRole('region', { name: 'YOps YAML tree' })).toHaveTextContent(
      '5 YOps ready'
    );

    fireEvent.click(screen.getByRole('button', { name: /Apply YOps/ }));
    await screen.findByText('Materialized 5');

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
      expect(countFetchCalls(fetchMock.mock.calls, commitsUrl)).toBeGreaterThanOrEqual(1)
    );
    const [commitUrl, commitInit] = findFetchCall(fetchMock.mock.calls, commitsUrl);
    expect(commitUrl).toBe('http://localhost:8000/api/v1/commits');
    expect(JSON.parse(String(commitInit?.body))).toMatchObject({
      branch: 'feature/prd-audience',
      message: 'Workspace commit: PRD audience handoff',
      parents: ['sha256:base-prd'],
      project_id: 'proj_1',
      provenance: { method: 'workspace_yops' },
    });

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Leaf config/ })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
    expect(screen.getByText('Ready from sha256:workspace-commit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Leaf' })).toBeEnabled();
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
