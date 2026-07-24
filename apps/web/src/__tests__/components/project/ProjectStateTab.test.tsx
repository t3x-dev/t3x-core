// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { useCanvasStore } from '@/store/canvasStore';
import type { ApiCommit } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

const hookMocks = vi.hoisted(() => ({
  branchHeads: {} as Record<string, string | null>,
  branchesLoading: false,
  createBranch: vi.fn(),
  loadCanvas: vi.fn(),
  loadCommit: vi.fn(),
  loadCommits: vi.fn(),
  loadOperations: vi.fn(),
  projectWorkspaces: [] as WorkspaceCandidate[],
  refreshBranches: vi.fn(),
  refreshWorkspaces: vi.fn(),
  saveWorkspaceDraft: vi.fn(),
}));

vi.mock('@/components/canvas', () => ({
  CanvasWorkspace: ({
    embedded,
    focusedBranch,
    focusedCommitHash,
    projectName,
  }: {
    embedded?: boolean;
    focusedBranch?: string;
    focusedCommitHash?: string;
    projectName: string;
  }) => (
    <div
      data-embedded={String(embedded)}
      data-focused-branch={focusedBranch}
      data-focused-commit={focusedCommitHash}
      data-testid="state-canvas-workspace"
    >
      {projectName}
    </div>
  ),
}));

const navigationMocks = vi.hoisted(() => ({
  pathname: '/t3x-dev/test-project',
  router: { push: vi.fn(), replace: vi.fn() },
  search: '',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => navigationMocks.router,
  useSearchParams: () => new URLSearchParams(navigationMocks.search),
}));

vi.mock('@/hooks/shared/useBranches', () => ({
  useBranches: () => ({
    branchHeads: hookMocks.branchHeads,
    branches: ['main', 'feature/prd-audience'],
    create: hookMocks.createBranch,
    loading: hookMocks.branchesLoading,
    refresh: hookMocks.refreshBranches,
  }),
}));

vi.mock('@/hooks/commits/useCommitByHash', () => ({
  useCommitByHash: () => ({ loadCommit: hookMocks.loadCommit }),
}));

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    error: null,
    initialized: true,
    loading: false,
    refresh: hookMocks.refreshWorkspaces,
    saveDraft: (workspace: WorkspaceCandidate) =>
      hookMocks
        .saveWorkspaceDraft('proj_test', workspace.id, workspace)
        .then((saved: { workspace: WorkspaceCandidate }) => saved.workspace),
    workspaces: hookMocks.projectWorkspaces,
  }),
}));

vi.mock('@/hooks/commits/useCommitsList', () => ({
  useCommitsList: () => ({ loadCommits: hookMocks.loadCommits }),
}));

vi.mock('@/hooks/commits/useCommitByHash', () => ({
  useCommitByHash: () => ({ loadCommit: hookMocks.loadCommit }),
}));

vi.mock('@/hooks/commits/useCommitOperations', () => ({
  useCommitOperations: () => ({ loadOperations: hookMocks.loadOperations }),
}));

vi.mock('@/hooks/canvas/useCanvasNodeActions', () => ({
  useCanvasNodeActions: () => ({ load: hookMocks.loadCanvas }),
}));

const PRD_COMMIT: ApiCommit = {
  author: { type: 'agent', name: 'T3X' },
  branch: 'main',
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

const PARENT_COMMIT: ApiCommit = {
  ...PRD_COMMIT,
  committed_at: '2026-07-08T08:00:00.000Z',
  content: {
    ...PRD_COMMIT.content,
    trees: [
      {
        key: 'prd',
        slots: { title: 'PRD audience handoff' },
        children: [
          {
            key: 'summary',
            slots: {
              problem: 'Users need food and drink',
              audience: '',
              outcome: 'Find a meal',
            },
            children: [],
          },
          ...PRD_COMMIT.content.trees[0]!.children.slice(1),
        ],
      },
    ],
  },
  hash: PRD_COMMIT.parents[0]!,
  message: 'Parent PRD state',
  parents: [],
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
  hookMocks.branchHeads = {};
  hookMocks.branchesLoading = false;
  hookMocks.loadCommit.mockResolvedValue(PRD_COMMIT);
  hookMocks.createBranch.mockImplementation(async (name: string, parentBranch: string) => ({
    branch_id: `branch:${name}`,
    created_at: '2026-07-24T12:00:00.000Z',
    head_commit_hash: PRD_COMMIT.hash,
    is_current: false,
    name,
    parent_branch: parentBranch,
    updated_at: '2026-07-24T12:00:00.000Z',
  }));
  hookMocks.loadCommit.mockResolvedValue(PARENT_COMMIT);
  hookMocks.loadCommits.mockResolvedValue([PRD_COMMIT]);
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
  hookMocks.saveWorkspaceDraft.mockImplementation(
    async (_projectId: string, _workspaceId: string, workspace: WorkspaceCandidate) => ({
      candidate_id: `candidate:${workspace.id}`,
      workspace,
    })
  );
}

function renderStateTab(validation: YSchemaValidationSummary | null = VALIDATION) {
  return render(
    <ProjectStateTab projectId="proj_test" projectName="Test Project" validation={validation} />
  );
}

function committedWorkspaceForHead(
  overrides: Partial<WorkspaceCandidate> = {}
): WorkspaceCandidate {
  return {
    baseCommitHash: PRD_COMMIT.parents[0] ?? null,
    id: 'workspace_prd_handoff',
    lastCommitHash: PRD_COMMIT.hash,
    outputTargets: [],
    projectId: 'proj_test',
    schemaBindings: [],
    schemaCandidate: { fields: [], summary: '' },
    schemaReview: { gaps: [], summary: '', verdict: 'ready' },
    sourceBundle: [
      {
        conversationId: 'conv_d4d239f3',
        id: 'src_chat',
        title: 'Audience chat',
        type: 'chat',
      },
    ],
    status: 'committed',
    summary: 'Reviewed PRD workspace',
    targetBranch: 'main',
    title: 'PRD audience handoff',
    updatedAt: '2026-07-09T08:01:00.000Z',
    yopsDraft: { id: 'draft:workspace_prd_handoff', operations: [] },
    ...overrides,
  };
}

describe('ProjectStateTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationMocks.pathname = '/t3x-dev/test-project';
    navigationMocks.search = '';
    navigationMocks.router.replace.mockImplementation((href: string) => {
      const url = new URL(href, 'https://t3x.local');
      navigationMocks.pathname = url.pathname;
      navigationMocks.search = url.search;
    });
    setupHookMocks();
    hookMocks.projectWorkspaces = [];
    useCanvasStore.setState({
      edges: [],
      loadError: null,
      loading: false,
      nodes: [],
      projectId: 'proj_test',
    } as never);
  });

  it('loads the branch HEAD and renders the structured state tree by default', async () => {
    hookMocks.branchHeads = { main: PRD_COMMIT.hash };
    hookMocks.loadCommit.mockImplementation(async (hash: string) =>
      hash === PRD_COMMIT.hash ? PRD_COMMIT : PARENT_COMMIT
    );
    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Snapshot/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Structure/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Path / Key')).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(screen.getByText('problem')).toBeInTheDocument();
    expect(screen.getByText('audience')).toBeInTheDocument();
    expect(screen.getAllByText('01 SET')[0]).toBeInTheDocument();
    expect(screen.getAllByText('missing')[0]).toBeInTheDocument();
    expect(screen.getByText('YAML-shaped state tree')).toBeInTheDocument();
    expect(hookMocks.loadCommits).toHaveBeenCalledWith('proj_test', 'main', 100);
    expect(hookMocks.loadOperations).toHaveBeenCalledWith(PRD_COMMIT.hash);
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=main&returnTo=%2Ft3x-dev%2Ftest-project'
    );
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      `/t3x-dev/test-project/workspaces?branch=main&commit=${encodeURIComponent(PRD_COMMIT.hash)}&conversation=conv_d4d239f3&sourceView=chat`
    );
    expect(screen.getByRole('link', { name: 'Open commit' })).toHaveAttribute(
      'href',
      `/project/proj_test/commit/${encodeURIComponent(PRD_COMMIT.hash)}?returnTo=%2Ft3x-dev%2Ftest-project`
    );
    expect(screen.queryByRole('link', { name: 'Parent diff' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View 2 changes' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('button', { name: 'Change review dock' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Canvas/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy path' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open graph' })).not.toBeInTheDocument();
  });

  it('reloads the State snapshot and supporting repository data on refresh', async () => {
    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(hookMocks.loadCommits).toHaveBeenCalledTimes(2));
    expect(hookMocks.loadOperations).toHaveBeenCalledTimes(2);
    expect(hookMocks.refreshBranches).toHaveBeenCalledTimes(1);
    expect(hookMocks.refreshWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('shows the parent-to-HEAD diff inline and restores the state view when closed', async () => {
    renderStateTab();

    const showChanges = await screen.findByRole('button', { name: 'View 2 changes' });
    fireEvent.click(showChanges);

    const diff = screen.getByRole('region', { name: 'T3X Diff' });
    expect(within(diff).getByText('Commit · Parent → HEAD')).toBeInTheDocument();
    fireEvent.click(within(diff).getByRole('button', { name: 'outcome' }));
    expect(within(diff).getByText('Updated desired outcome')).toBeInTheDocument();
    expect(within(diff).getByText('Find a meal')).toBeInTheDocument();
    expect(within(diff).getByText('办公室上班族')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Structure/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'View model' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide changes' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide changes' }));

    expect(screen.queryByRole('region', { name: 'T3X Diff' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Structure/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'View model' })).toBeInTheDocument();
  });

  it('switches to the schema-selected Render view', async () => {
    renderStateTab();

    await screen.findByText('Path / Key');
    fireEvent.click(screen.getByRole('tab', { name: /Render/ }));

    expect(screen.getByRole('heading', { name: 'PRD audience handoff' })).toBeInTheDocument();
    expect(screen.getByText('Executive summary')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Problem, audience, and intended outcome' })
    ).toBeInTheDocument();
    expect(screen.getByText('This field is required by the schema.')).toBeInTheDocument();
    expect(screen.getByText('找到食物和饮品')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Evidence 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Changes 3/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Changes 3/ }));
    expect(screen.getByText('Materialized changes')).toBeInTheDocument();
    expect(screen.getByText('prd/summary/problem')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'raw' }));
    expect(screen.getByRole('region', { name: 'Raw materialized YAML' })).toHaveTextContent('prd:');
  });

  it('creates an empty workspace for a new branch and opens it from committed State', async () => {
    hookMocks.branchHeads = { main: PRD_COMMIT.hash };
    hookMocks.loadCommit.mockImplementation(async (hash: string) =>
      hash === PRD_COMMIT.hash ? PRD_COMMIT : PARENT_COMMIT
    );
    hookMocks.projectWorkspaces = [
      committedWorkspaceForHead({
        schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
      }),
    ];
    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    fireEvent.click(screen.getByRole('button', { name: 'New branch' }));
    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feature/checkout-retry' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create branch' }));

    await waitFor(() => {
      expect(hookMocks.createBranch).toHaveBeenCalledWith('feature/checkout-retry', 'main');
    });
    expect(hookMocks.saveWorkspaceDraft).toHaveBeenCalledWith(
      'proj_test',
      'workspace_branch:feature%2Fcheckout-retry',
      expect.objectContaining({
        baseCommitHash: PRD_COMMIT.hash,
        id: 'workspace_branch:feature%2Fcheckout-retry',
        projectId: 'proj_test',
        schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
        sourceBundle: [],
        status: 'draft',
        targetBranch: 'feature/checkout-retry',
        yopsDraft: expect.objectContaining({ operations: [] }),
      })
    );
    expect(navigationMocks.router.push).toHaveBeenCalledWith(
      `/t3x-dev/test-project/workspaces?branch=feature%2Fcheckout-retry&commit=${encodeURIComponent(PRD_COMMIT.hash)}&workspace=workspace_branch%3Afeature%252Fcheckout-retry&sourceView=chat`
    );
  });

  it('creates and opens an empty workspace when the parent branch has no commit', async () => {
    hookMocks.branchHeads = { main: null };
    hookMocks.loadCommits.mockResolvedValue([]);
    hookMocks.createBranch.mockImplementation(async (name: string, parentBranch: string) => ({
      branch_id: `branch:${name}`,
      created_at: '2026-07-24T12:00:00.000Z',
      head_commit_hash: null,
      is_current: false,
      name,
      parent_branch: parentBranch,
      updated_at: '2026-07-24T12:00:00.000Z',
    }));

    renderStateTab();

    await screen.findByText('No commit on this branch');
    fireEvent.click(screen.getByRole('button', { name: 'New branch' }));
    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feature/empty-start' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create branch' }));

    await waitFor(() => {
      expect(hookMocks.saveWorkspaceDraft).toHaveBeenCalledWith(
        'proj_test',
        'workspace_branch:feature%2Fempty-start',
        expect.objectContaining({
          baseCommitHash: null,
          sourceBundle: [],
          status: 'draft',
          targetBranch: 'feature/empty-start',
        })
      );
    });
    expect(navigationMocks.router.push).toHaveBeenCalledWith(
      '/t3x-dev/test-project/workspaces?branch=feature%2Fempty-start&workspace=workspace_branch%3Afeature%252Fempty-start&sourceView=chat'
    );
    expect(navigationMocks.router.replace).not.toHaveBeenCalledWith(
      '/t3x-dev/test-project?branch=feature%2Fempty-start',
      { scroll: false }
    );
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
    expect(within(codeView).queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
    expect(within(codeView).queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('opens Canvas as a separate State mode without leaving the repository route', async () => {
    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    fireEvent.click(screen.getByRole('tab', { name: /Canvas/ }));

    expect(navigationMocks.router.replace).toHaveBeenCalledWith(
      '/t3x-dev/test-project?view=canvas',
      { scroll: false }
    );
    expect(screen.queryByRole('region', { name: 'State overview' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Multi-commit state canvas' })).toBeInTheDocument();
    expect(screen.getByTestId('state-canvas-workspace')).toHaveAttribute(
      'data-focused-branch',
      'main'
    );
    expect(screen.getByTestId('state-canvas-workspace')).toHaveAttribute(
      'data-focused-commit',
      PRD_COMMIT.hash
    );
    expect(screen.queryByRole('tab', { name: /Structure/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Snapshot/ }));

    expect(navigationMocks.router.replace).toHaveBeenLastCalledWith('/t3x-dev/test-project', {
      scroll: false,
    });
    expect(screen.getByRole('tab', { name: /Structure/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('clarifies that an empty focused branch does not own commits shown on the all-branch canvas', async () => {
    hookMocks.loadCommits.mockResolvedValue([]);
    renderStateTab();

    await screen.findByText('No commit on this branch');
    fireEvent.click(screen.getByRole('tab', { name: /Canvas/ }));

    expect(screen.getByRole('status')).toHaveTextContent('main has no HEAD commit.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Canvas shows the evolution of all branches'
    );
    expect(screen.getByRole('status')).toHaveTextContent('cannot serve as the main PR base');
  });

  it('passes a deep-linked commit to Canvas for selection and centering', async () => {
    navigationMocks.search = `view=canvas&branch=main&commit=${encodeURIComponent(PRD_COMMIT.hash)}`;

    renderStateTab();

    const canvas = await screen.findByTestId('state-canvas-workspace');
    expect(canvas).toHaveAttribute('data-focused-branch', 'main');
    expect(canvas).toHaveAttribute('data-focused-commit', PRD_COMMIT.hash);
  });

  it('hands the exact branch, HEAD, workspace, and validated conversation to Workspaces', async () => {
    hookMocks.branchHeads = { main: PRD_COMMIT.hash };
    hookMocks.loadCommit.mockImplementation(async (hash: string) =>
      hash === PRD_COMMIT.hash ? PRD_COMMIT : PARENT_COMMIT
    );
    hookMocks.projectWorkspaces = [committedWorkspaceForHead()];

    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      `/t3x-dev/test-project/workspaces?branch=main&commit=${encodeURIComponent(PRD_COMMIT.hash)}&workspace=workspace_prd_handoff&conversation=conv_d4d239f3&sourceView=chat`
    );
  });

  it('does not guess a workspace when multiple committed workspaces share the HEAD', async () => {
    hookMocks.branchHeads = { main: PRD_COMMIT.hash };
    hookMocks.loadCommit.mockImplementation(async (hash: string) =>
      hash === PRD_COMMIT.hash ? PRD_COMMIT : PARENT_COMMIT
    );
    hookMocks.projectWorkspaces = [
      committedWorkspaceForHead(),
      committedWorkspaceForHead({ id: 'workspace_prd_handoff_duplicate' }),
    ];

    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      `/t3x-dev/test-project/workspaces?branch=main&commit=${encodeURIComponent(PRD_COMMIT.hash)}&conversation=conv_d4d239f3&sourceView=chat`
    );
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
    expect(screen.getByText('Not validated at HEAD')).toBeInTheDocument();
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    expect(screen.queryByText('INITIAL CREATE')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parent diff' })).not.toBeInTheDocument();
  });

  it('runs validation against the visible HEAD and ignores a stale validation result', async () => {
    const onRunValidation = vi.fn();
    render(
      <ProjectStateTab
        onRunValidation={onRunValidation}
        projectId="proj_test"
        projectName="Test Project"
        validation={{ ...VALIDATION, commitHash: 'sha256:stale-commit' }}
      />
    );

    await screen.findByText('PRD audience handoff committed');
    expect(screen.getByText('Not validated at HEAD')).toBeInTheDocument();
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run validation' }));
    expect(onRunValidation).toHaveBeenCalledWith(PRD_COMMIT.hash);
  });

  it('does not reuse stale workspace gaps after the visible HEAD validates cleanly', async () => {
    hookMocks.projectWorkspaces = [
      {
        lastCommitHash: PRD_COMMIT.hash,
        schemaReview: { gaps: ['prd.summary.audience'] },
        status: 'committed',
        yopsDraft: { operations: [] },
      } as unknown as WorkspaceCandidate,
    ];

    renderStateTab({
      ...VALIDATION,
      gapCount: 0,
      gaps: [],
      ready: true,
      status: 'verified',
    });

    await screen.findByText('PRD audience handoff committed');
    expect(screen.getByText('Up to date')).toBeInTheDocument();
    expect(screen.queryByText('missing')).not.toBeInTheDocument();
  });

  it('keeps rendering committed state when operations are unavailable', async () => {
    hookMocks.loadOperations.mockRejectedValueOnce(new Error('operations unavailable'));

    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.getByText('YOps log unavailable.')).toBeInTheDocument();
    expect(screen.getByText('problem')).toBeInTheDocument();
  });

  it('selects the visible DAG tip instead of trusting commit timestamp order', async () => {
    const parent = {
      ...PRD_COMMIT,
      committed_at: '2099-01-01T00:00:00.000Z',
      hash: 'sha256:parent',
      message: 'Timestamp-newer parent',
      parents: [],
    };
    const tip = {
      ...PRD_COMMIT,
      committed_at: '2026-01-01T00:00:00.000Z',
      hash: 'sha256:tip',
      message: 'Actual branch tip',
      parents: [parent.hash],
    };
    hookMocks.loadCommits.mockResolvedValue([parent, tip]);

    renderStateTab(null);

    expect(await screen.findByText('Actual branch tip')).toBeInTheDocument();
    expect(screen.queryByText('Timestamp-newer parent')).not.toBeInTheDocument();
    expect(hookMocks.loadOperations).toHaveBeenCalledWith(tip.hash);
  });

  it('rejects commit rows that do not belong to the selected project', async () => {
    hookMocks.loadCommits.mockResolvedValue([{ ...PRD_COMMIT, project_id: 'proj_other' }]);

    renderStateTab();

    expect(
      await screen.findByText('Commit response does not match the selected project.')
    ).toBeInTheDocument();
    expect(screen.queryByText('PRD audience handoff committed')).not.toBeInTheDocument();
  });

  it('ignores stale Canvas data from another project', async () => {
    hookMocks.loadCommits.mockResolvedValue([]);
    useCanvasStore.setState({
      edges: [{ id: 'stale-edge', source: 'stale-parent', target: 'stale-commit' }],
      nodes: [
        {
          data: {
            branchName: 'stale-canvas-branch',
            branchType: 'branch',
            commitHash: 'sha256:stale-canvas-commit',
            commitStatus: 'committed',
            kind: 'unit',
            timestamp: '2026-07-01T00:00:00.000Z',
          },
          id: 'stale-commit',
          position: { x: 0, y: 0 },
          type: 'unit',
        },
      ],
      projectId: 'another-project',
    } as never);

    renderStateTab();

    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(screen.getAllByText('0 commits').length).toBeGreaterThan(0);
    expect(screen.queryByText('stale-canvas-branch')).not.toBeInTheDocument();
    expect(screen.queryByText(/stale-canvas-commit/)).not.toBeInTheDocument();

    const metadata = screen.getByRole('heading', { name: 'State metadata' }).closest('section');
    expect(metadata).not.toBeNull();
    const edgesLabel = within(metadata as HTMLElement).getByText('Edges');
    expect(edgesLabel.nextElementSibling).toHaveTextContent('0');
  });

  it('keeps an empty main branch selected instead of redirecting to another branch', async () => {
    hookMocks.loadCommits.mockResolvedValue([]);

    renderStateTab();

    expect(await screen.findByText('No commit on this branch')).toBeInTheDocument();
    expect(navigationMocks.router.replace).not.toHaveBeenCalled();
    expect(hookMocks.loadCommits).toHaveBeenCalledWith('proj_test', 'main', 100);
  });

  it('loads State from the registered branch pointer even when the commit was created elsewhere', async () => {
    const inheritedHead = { ...PRD_COMMIT, branch: 'feature/prd-audience' };
    hookMocks.branchHeads = { main: inheritedHead.hash };
    hookMocks.loadCommits.mockResolvedValue([]);
    hookMocks.loadCommit.mockResolvedValue(inheritedHead);

    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(hookMocks.loadCommit).toHaveBeenCalledWith(inheritedHead.hash);
    expect(navigationMocks.router.replace).not.toHaveBeenCalled();
  });

  it('switches its local read-only branch focus', async () => {
    const view = renderStateTab();

    await screen.findByText('Path / Key');
    hookMocks.loadCommits.mockResolvedValueOnce([
      { ...PRD_COMMIT, branch: 'feature/prd-audience' },
    ]);
    fireEvent.change(screen.getByLabelText('Branch focus'), {
      target: { value: 'feature/prd-audience' },
    });

    expect(navigationMocks.router.replace).toHaveBeenCalledWith(
      '/t3x-dev/test-project?branch=feature%2Fprd-audience',
      { scroll: false }
    );
    view.rerender(
      <ProjectStateTab projectId="proj_test" projectName="Test Project" validation={VALIDATION} />
    );

    await waitFor(() => {
      expect(hookMocks.loadCommits).toHaveBeenLastCalledWith(
        'proj_test',
        'feature/prd-audience',
        100
      );
    });
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=feature%2Fprd-audience&returnTo=%2Ft3x-dev%2Ftest-project%3Fbranch%3Dfeature%252Fprd-audience'
    );
  });

  it('drops the previous commit from the route when switching branches', async () => {
    navigationMocks.search = `view=canvas&branch=main&commit=${encodeURIComponent(PRD_COMMIT.hash)}`;
    renderStateTab();

    await screen.findByTestId('state-canvas-workspace');
    fireEvent.change(screen.getByLabelText('Branch focus'), {
      target: { value: 'feature/prd-audience' },
    });

    expect(navigationMocks.router.replace).toHaveBeenCalledWith(
      '/t3x-dev/test-project?view=canvas&branch=feature%2Fprd-audience',
      { scroll: false }
    );
  });

  it('waits for the canonical branch pointer before enabling the workspace handoff', async () => {
    const canonicalHead = {
      ...PRD_COMMIT,
      hash: 'sha256:canonical-main-head',
      message: 'Canonical main HEAD',
      parents: [],
    };
    hookMocks.branchesLoading = true;
    hookMocks.loadCommit.mockImplementation(async (hash: string) =>
      hash === canonicalHead.hash ? canonicalHead : PARENT_COMMIT
    );
    const view = renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open workspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();

    hookMocks.branchHeads = { main: canonicalHead.hash };
    hookMocks.branchesLoading = false;
    view.rerender(
      <ProjectStateTab projectId="proj_test" projectName="Test Project" validation={VALIDATION} />
    );

    expect(await screen.findByText('Canonical main HEAD')).toBeInTheDocument();
    expect(hookMocks.loadCommit).toHaveBeenCalledWith(canonicalHead.hash);
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      `/t3x-dev/test-project/workspaces?branch=main&commit=${encodeURIComponent(canonicalHead.hash)}&conversation=conv_d4d239f3&sourceView=chat`
    );
  });

  it('clears old commit actions while a newly selected branch is loading', async () => {
    const view = renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    hookMocks.loadCommits.mockReturnValueOnce(new Promise<ApiCommit[]>(() => {}));
    fireEvent.change(screen.getByLabelText('Branch focus'), {
      target: { value: 'feature/prd-audience' },
    });
    view.rerender(
      <ProjectStateTab projectId="proj_test" projectName="Test Project" validation={VALIDATION} />
    );

    await waitFor(() => {
      expect(hookMocks.loadCommits).toHaveBeenLastCalledWith(
        'proj_test',
        'feature/prd-audience',
        100
      );
    });
    expect(screen.getByText('Loading state')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open commit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parent diff' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=feature%2Fprd-audience&returnTo=%2Ft3x-dev%2Ftest-project%3Fbranch%3Dfeature%252Fprd-audience'
    );
  });
});
