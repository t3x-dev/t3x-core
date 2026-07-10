// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { useCanvasStore } from '@/store/canvasStore';
import { useChatStore } from '@/store/chatStore';
import { useCommitStore } from '@/store/commitStore';
import type { ApiCommit } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

const hookMocks = vi.hoisted(() => ({
  loadCommits: vi.fn(),
  loadLeaves: vi.fn(),
  loadOperations: vi.fn(),
  projectWorkspaces: [] as WorkspaceCandidate[],
  refreshBranches: vi.fn(),
  refreshWorkspaces: vi.fn(),
}));

vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branches: ['main', 'feature/prd-audience'],
    loading: false,
    refresh: hookMocks.refreshBranches,
  }),
}));

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    error: null,
    loading: false,
    refresh: hookMocks.refreshWorkspaces,
    workspaces: hookMocks.projectWorkspaces,
  }),
}));

vi.mock('@/hooks/commits/useCommitsList', () => ({
  useCommitsList: () => ({ loadCommits: hookMocks.loadCommits }),
}));

vi.mock('@/hooks/commits/useLeavesByCommit', () => ({
  useLeavesByCommit: () => ({ loadLeaves: hookMocks.loadLeaves }),
}));

vi.mock('@/hooks/commits/useCommitOperations', () => ({
  useCommitOperations: () => ({ loadOperations: hookMocks.loadOperations }),
}));

const PRD_COMMIT: ApiCommit = {
  author: { type: 'agent', name: 'T3X' },
  branch: 'feature/prd-audience',
  committed_at: '2026-07-09T08:00:00.000Z',
  content: {
    trees: [
      {
        key: 'prd',
        slots: { title: 'PRD audience handoff' },
        children: [
          {
            key: 'summary',
            slots: {
              problem: 'You: i need food and drink',
              audience: '',
              outcome: '办公室上班族',
            },
            children: [],
          },
          {
            key: 'requirements',
            slots: {},
            children: [
              {
                key: '0',
                slots: {
                  title: '找到食物和饮品',
                  priority: 'P1',
                  acceptance: '用户能快速找到并满意',
                },
                children: [],
              },
            ],
          },
          {
            key: 'metadata',
            slots: { version: '1.0.0', source: 'source_chat:conv_d4d239f3' },
            children: [],
          },
        ],
      },
    ],
    relations: [],
  },
  hash: 'sha256:cb5813f30e0e6a525000000000000000000000000000000000000000000000000',
  message: 'PRD audience handoff committed',
  parents: ['sha256:base-prd'],
  project_id: 'proj_test',
  provenance: { method: 'workspace' },
  schema: 't3x/commit',
  sources: [{ type: 'conversation', id: 'conv_d4d239f3' }],
  yops_log_ids: ['op_1', 'op_2', 'op_3'],
};

const VALIDATION: YSchemaValidationSummary = {
  checkedAt: '2026-07-09T08:01:00.000Z',
  commitHash: PRD_COMMIT.hash,
  errorCount: 0,
  fixCount: 0,
  gapCount: 1,
  gaps: [
    {
      code: 'REQUIRED_SLOT_MISSING',
      label: 'Missing required field',
      message: 'audience is required.',
      path: 'prd.summary.audience',
    },
  ],
  ready: false,
  runId: 'ysvr_1',
  schemaName: 't3x/prd',
  status: 'failed',
  valid: true,
};

function setupHookMocks() {
  hookMocks.loadCommits.mockResolvedValue([PRD_COMMIT]);
  hookMocks.loadLeaves.mockResolvedValue([
    {
      id: 'leaf_1',
      commit_hash: PRD_COMMIT.hash,
      title: 'PRD review brief',
      type: 'deploy_agent',
    },
  ]);
  hookMocks.loadOperations.mockResolvedValue({
    commit_hash: PRD_COMMIT.hash,
    operations: [
      {
        created_at: '2026-07-09T08:00:00.000Z',
        id: 'op_1',
        model: null,
        source: 'source_chat',
        turn_hash: 'turn_1',
        yops: [
          { set: { path: 'prd.summary.problem', value: 'You: i need food and drink' } },
          { set: { path: 'prd.summary.outcome', value: '办公室上班族' } },
          {
            populate: {
              path: 'prd.requirements.0',
              values: {
                title: '找到食物和饮品',
                priority: 'P1',
                acceptance: '用户能快速找到并满意',
              },
            },
          },
        ],
      },
    ],
  });
}

function renderStateTab(validation: YSchemaValidationSummary | null = VALIDATION) {
  return render(
    <ProjectStateTab projectId="proj_test" projectName="Test Project" validation={validation}>
      <div data-testid="legacy-canvas-child" />
    </ProjectStateTab>
  );
}

describe('ProjectStateTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHookMocks();
    hookMocks.projectWorkspaces = [];
    useChatStore.setState({ activeBranch: 'feature/prd-audience' });
    useCommitStore.setState({ commitBranch: 'feature/prd-audience' });
    useCanvasStore.setState({ edges: [], nodes: [] } as never);
  });

  it('loads the branch HEAD and renders YAML-shaped Points as the default view', async () => {
    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Points/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Path / Key')).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(screen.getByText('problem')).toBeInTheDocument();
    expect(screen.getByText('audience')).toBeInTheDocument();
    expect(screen.getAllByText('01 SET')[0]).toBeInTheDocument();
    expect(screen.getAllByText('missing')[0]).toBeInTheDocument();
    expect(screen.getByText('YAML-shaped node browser')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-canvas-child')).not.toBeInTheDocument();

    expect(hookMocks.loadCommits).toHaveBeenCalledWith('proj_test', 'feature/prd-audience', 100);
    expect(hookMocks.loadLeaves).toHaveBeenCalledWith(PRD_COMMIT.hash);
    expect(hookMocks.loadOperations).toHaveBeenCalledWith(PRD_COMMIT.hash);
  });

  it('switches to the schema-selected Render view', async () => {
    renderStateTab();

    await screen.findByText('Path / Key');
    fireEvent.click(screen.getByRole('tab', { name: /Render/ }));

    expect(screen.getByRole('heading', { name: 'PRD audience handoff' })).toBeInTheDocument();
    expect(screen.getByText('1. Problem')).toBeInTheDocument();
    expect(screen.getByText('This field is required by the schema.')).toBeInTheDocument();
    expect(screen.getByText('找到食物和饮品')).toBeInTheDocument();
  });

  it('switches to canonical YAML Code without exposing internal trees', async () => {
    renderStateTab();

    await screen.findByText('Path / Key');
    fireEvent.click(screen.getByRole('tab', { name: /Code/ }));

    const codeView = screen.getByRole('region', { name: 'YAML code view' });
    expect(within(codeView).getByText('prd:')).toBeInTheDocument();
    expect(codeView).toHaveTextContent('summary:');
    expect(codeView).toHaveTextContent('problem: "You: i need food and drink"');
    expect(codeView).not.toHaveTextContent('trees:');
    expect(codeView).not.toHaveTextContent('slots:');
  });

  it('uses committed workspace draft operations when the commit has no stored YOps log', async () => {
    hookMocks.loadCommits.mockResolvedValue([{ ...PRD_COMMIT, parents: [], yops_log_ids: [] }]);
    hookMocks.loadOperations.mockResolvedValue({ commit_hash: PRD_COMMIT.hash, operations: [] });
    hookMocks.projectWorkspaces = [
      {
        baseCommitHash: null,
        id: 'workspace_prd_handoff',
        lastCommitHash: PRD_COMMIT.hash,
        outputTargets: [],
        projectId: 'proj_test',
        schemaBindings: [],
        schemaCandidate: { fields: [], summary: '' },
        schemaReview: { gaps: ['summary.audience'], summary: '', verdict: 'needs_review' },
        sourceBundle: [],
        status: 'committed',
        summary: 'Reviewed PRD workspace',
        targetBranch: 'feature/prd-audience',
        title: 'PRD audience handoff',
        updatedAt: '2026-07-09T08:01:00.000Z',
        yopsDraft: {
          id: 'draft:workspace_prd_handoff',
          operations: [
            {
              afterValue: 'You: i need food and drink',
              id: 'op_backend_1',
              op: 'set',
              path: 'prd/summary/problem',
              summary: 'Set summary.problem',
            },
            {
              afterValue: '办公室上班族',
              id: 'op_backend_2',
              op: 'set',
              path: 'prd/summary/outcome',
              summary: 'Set summary.outcome',
            },
            {
              afterValue: '找到食物和饮品',
              id: 'op_backend_3',
              op: 'set',
              path: 'prd/requirements/0/title',
              summary: 'Set requirements.0.title',
            },
          ],
        },
      },
    ];

    renderStateTab(null);

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.getAllByText('01 SET')[0]).toBeInTheDocument();
    expect(screen.getAllByText('02 SET')[0]).toBeInTheDocument();
    expect(screen.getAllByText('03 SET')[0]).toBeInTheDocument();
    expect(screen.getAllByText('missing')[0]).toBeInTheDocument();
    expect(screen.queryByText('INITIAL CREATE')).not.toBeInTheDocument();
  });

  it('keeps rendering committed state when operations are unavailable', async () => {
    hookMocks.loadOperations.mockRejectedValueOnce(new Error('operations unavailable'));

    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.getByText('YOps log unavailable.')).toBeInTheDocument();
    expect(screen.getByText('problem')).toBeInTheDocument();
  });

  it('falls back from an empty main branch to the latest committed branch', async () => {
    useChatStore.setState({ activeBranch: 'main' });
    useCommitStore.setState({ commitBranch: 'main' });
    hookMocks.loadCommits.mockReset();
    hookMocks.loadCommits.mockResolvedValueOnce([]).mockResolvedValue([PRD_COMMIT]);

    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch focus')).toHaveValue('feature/prd-audience');
    expect(useChatStore.getState().activeBranch).toBe('feature/prd-audience');
    expect(hookMocks.loadCommits).toHaveBeenCalledWith('proj_test', 'main', 100);
    expect(hookMocks.loadCommits).toHaveBeenCalledWith('proj_test', undefined, 100);
  });

  it('switches branch focus through the repo toolbar', async () => {
    renderStateTab();

    await screen.findByText('Path / Key');
    fireEvent.change(screen.getByLabelText('Branch focus'), { target: { value: 'main' } });

    await waitFor(() => {
      expect(useChatStore.getState().activeBranch).toBe('main');
    });
    expect(useCommitStore.getState().commitBranch).toBe('main');
    expect(hookMocks.loadCommits).toHaveBeenLastCalledWith('proj_test', 'main', 100);
  });
});
