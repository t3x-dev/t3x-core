// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { useCanvasStore } from '@/store/canvasStore';
import type { ApiCommit, SkillArtifact } from '@/types/api';
import type { WorkspaceCandidate } from '@/types/workspaces';

const hookMocks = vi.hoisted(() => ({
  branchHeads: {} as Record<string, string | null>,
  createBranch: vi.fn(),
  loadCanvas: vi.fn(),
  loadCommit: vi.fn(),
  loadCommits: vi.fn(),
  loadOperations: vi.fn(),
  projectWorkspaces: [] as WorkspaceCandidate[],
  refreshBranches: vi.fn(),
  refreshWorkspaces: vi.fn(),
  saveDraft: vi.fn(),
  skillArtifact: null as SkillArtifact | null,
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
    loading: false,
    refresh: hookMocks.refreshBranches,
  }),
}));

vi.mock('@/hooks/commits/useCommitByHash', () => ({
  useCommitByHash: () => ({ loadCommit: hookMocks.loadCommit }),
}));

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({
    error: null,
    loading: false,
    refresh: hookMocks.refreshWorkspaces,
    workspaces: hookMocks.projectWorkspaces,
  }),
}));

vi.mock('@/hooks/workspaces/useWorkspaceFlow', () => ({
  useWorkspaceFlow: () => ({ saveDraft: hookMocks.saveDraft }),
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

vi.mock('@/hooks/projects/useSkillArtifact', () => ({
  useSkillArtifact: () => ({
    artifact: hookMocks.skillArtifact,
    error: null,
    loading: false,
  }),
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
              outcome: 'Office workers',
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
                  title: 'Find food and drinks',
                  priority: 'P1',
                  acceptance: 'Users can quickly find satisfying options',
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
          {
            key: 'rollout_plan',
            slots: {},
            children: [
              {
                key: 'phase_1',
                slots: {
                  audience: 'Internal accounts',
                  exposure: '1 percent',
                  gateway: 'Primary gateway',
                  owner: 'Checkout platform',
                  rollback: 'Kill switch',
                  success_gate: 'No duplicate orders',
                  verification_window: 'Seventh rollout field remains visible',
                },
                children: [],
              },
            ],
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
  schema: 't3x/commit/v2',
  sources: [{ type: 'conversation', id: 'conv_d4d239f3' }],
  yops_log_ids: ['op_1', 'op_2', 'op_3'],
};

const MUST_CONDITION_KEYS = [
  'for_every_relevant_case_must_define_degradation_path',
  'for_every_relevant_case_must_define_retry_eligibility',
  'for_every_relevant_case_must_define_responsible_service',
  'for_every_relevant_case_must_define_operational_response',
  'cases_not_resolvable_automatically_need_manual_handling_path',
  'for_every_relevant_case_must_define_expected_system_behavior',
  'cases_not_resolvable_automatically_need_operational_runbook_link_or_reference',
] as const;

const MUST_CONDITIONS_COMMIT: ApiCommit = {
  ...PRD_COMMIT,
  content: {
    ...PRD_COMMIT.content,
    trees: [
      {
        ...PRD_COMMIT.content.trees[0]!,
        slots: {
          ...PRD_COMMIT.content.trees[0]!.slots,
          ...Object.fromEntries(MUST_CONDITION_KEYS.map((key) => [key, true])),
        },
      },
    ],
  },
  hash: 'sha256:must-conditions',
  message: 'PRD must conditions committed',
};

const DENSE_RULE_KEYS = [
  'delivery_must_be_incremental',
  'cannot_replace_payment_gateway',
  'must_fit_existing_architecture',
  'cannot_rewrite_entire_order_platform',
] as const;

const DENSE_RULES_COMMIT: ApiCommit = {
  ...PRD_COMMIT,
  content: {
    ...PRD_COMMIT.content,
    trees: [
      {
        ...PRD_COMMIT.content.trees[0]!,
        children: [
          ...PRD_COMMIT.content.trees[0]!.children,
          {
            key: 'constraints',
            slots: Object.fromEntries(DENSE_RULE_KEYS.map((key) => [key, true])),
            children: [],
          },
          {
            key: 'retry_eligibility',
            slots: {
              retry_action_visibility_rule: 'Only show retry after an eligible backend decision.',
              ...Object.fromEntries(DENSE_RULE_KEYS.map((key) => [`retry_${key}`, true] as const)),
            },
            children: [],
          },
        ],
      },
    ],
  },
  hash: 'sha256:dense-rules',
  message: 'Dense rule groups committed',
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

const PROMPT_COMMIT: ApiCommit = {
  ...PRD_COMMIT,
  content: {
    relations: [
      { from: 'messages/system_policy', to: 'messages/user_task', type: 'precedes' },
      { from: 'messages/user_task', to: 'variables/user_request', type: 'uses_variable' },
    ],
    trees: [
      {
        children: [],
        key: 'manifest',
        slots: {
          name: 'extract-requirements',
          summary: 'Extract source-backed requirements.',
        },
      },
      {
        children: [],
        key: 'contract',
        slots: {
          goal: 'Produce grounded requirements.',
          inputs: ['Request'],
          non_goals: ['Invent facts'],
          outputs: ['JSON'],
          truth_policy: 'evidence_only',
        },
      },
      {
        children: [
          {
            children: [],
            key: 'user_request',
            slots: {
              description: 'Request to extract.',
              on_missing: 'ask_user',
              required: true,
              source: 'user',
              value_type: 'string',
            },
          },
        ],
        key: 'variables',
        slots: {},
      },
      {
        children: [
          {
            children: [],
            key: 'user_task',
            slots: {
              on_missing_variable: 'report_and_stop',
              optional: false,
              purpose: 'Provide request.',
              role: 'user',
              sequence: 2,
              template: '{{user_request}}',
            },
          },
          {
            children: [],
            key: 'system_policy',
            slots: {
              on_missing_variable: 'report_and_stop',
              optional: false,
              purpose: 'Set policy.',
              role: 'system',
              sequence: 1,
              template: 'Use source evidence only.',
            },
          },
        ],
        key: 'messages',
        slots: {},
      },
      {
        children: [],
        key: 'runtime',
        slots: {
          mode: 'chat',
          response_format: 'json',
          streaming: false,
          tool_policy: 'none',
        },
      },
      {
        children: [],
        key: 'output',
        slots: { format: 'json', on_parse_failure: 'report_and_stop', strict: true },
      },
      {
        children: [
          {
            children: [],
            key: 'compile_templates',
            slots: { blocking: true, kind: 'template_compile', run_when: 'pre_compile' },
          },
        ],
        key: 'checks',
        slots: {},
      },
    ],
  },
  hash: 'sha256:prompt',
  message: 'Add extract requirements Prompt',
  parents: [],
  provenance: { method: 'workspace', schema_ref: { name: 't3x/prompt', version: 'v1' } },
  sources: [{ id: 'conv_prompt', title: 'Prompt brief', type: 'conversation' }],
  yops_log_ids: ['op_prompt'],
};

const PROMPT_VALIDATION: YSchemaValidationSummary = {
  checkedAt: '2026-07-30T08:01:00.000Z',
  commitHash: PROMPT_COMMIT.hash,
  errorCount: 1,
  fixCount: 0,
  gapCount: 0,
  gaps: [],
  issues: [
    {
      code: 'INVALID_TYPE',
      label: 'Invalid type',
      message: 'Template must be a string.',
      path: 'messages.system_policy.template',
    },
  ],
  ready: false,
  runId: 'ysvr_prompt',
  schemaName: 't3x/prompt',
  status: 'failed',
  valid: false,
};

function setupHookMocks() {
  hookMocks.branchHeads = {};
  hookMocks.loadCommit.mockResolvedValue(PRD_COMMIT);
  hookMocks.createBranch.mockResolvedValue({
    branch_id: 'branch_feature_checkout_retry',
    created_at: '2026-07-09T08:02:00.000Z',
    head_commit_hash: PRD_COMMIT.hash,
    is_current: false,
    name: 'feature/checkout-retry',
    parent_branch: 'main',
    updated_at: '2026-07-09T08:02:00.000Z',
  });
  hookMocks.saveDraft.mockResolvedValue({ workspace: {} });
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
          { set: { path: 'prd.summary.outcome', value: 'Office workers' } },
          {
            populate: {
              path: 'prd.requirements.0',
              values: {
                title: 'Find food and drinks',
                priority: 'P1',
                acceptance: 'Users can quickly find satisfying options',
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
    <ProjectStateTab projectId="proj_test" projectName="Test Project" validation={validation} />
  );
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
    hookMocks.skillArtifact = null;
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
    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(document.querySelector('[data-state-view="structure"]')).toHaveClass(
      'h-full',
      'min-h-0',
      'overflow-hidden'
    );
    expect(screen.queryByRole('region', { name: 'State overview' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Snapshot/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Structure/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Path / Key')).toBeInTheDocument();
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(screen.getByText('problem')).toBeInTheDocument();
    expect(screen.getAllByText('audience')).not.toHaveLength(0);
    expect(screen.getAllByText('01 SET')[0]).toBeInTheDocument();
    expect(screen.getAllByText('missing')[0]).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Views' })).not.toBeInTheDocument();
    expect(screen.getAllByText('t3x/prd')[0]).toBeInTheDocument();
    const stateDetails = screen.getByRole('heading', { name: 'State details' }).closest('section');
    expect(stateDetails).not.toBeNull();
    expect(within(stateDetails as HTMLElement).getAllByText('cb5813f')[0]).toHaveAttribute(
      'title',
      PRD_COMMIT.hash
    );
    expect(within(stateDetails as HTMLElement).getByText('base-pr')).toHaveAttribute(
      'title',
      PRD_COMMIT.parents[0]
    );
    expect(hookMocks.loadCommits).toHaveBeenCalledWith('proj_test', 'main', 100);
    expect(hookMocks.loadOperations).toHaveBeenCalledWith(PRD_COMMIT.hash, 'proj_test');
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=main&returnTo=%2Ft3x-dev%2Ftest-project'
    );
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      '/t3x-dev/test-project/workspaces?branch=main'
    );
    expect(screen.getByRole('link', { name: 'cb5813f' })).toHaveAttribute(
      'href',
      `/t3x-dev/test-project?view=canvas&branch=main&commit=${encodeURIComponent(PRD_COMMIT.hash)}`
    );
    expect(screen.queryByRole('link', { name: 'Parent diff' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2 changed paths' })).toHaveAttribute(
      'href',
      `/project/proj_test/diff?base=${encodeURIComponent(PRD_COMMIT.parents[0])}&target=${encodeURIComponent(PRD_COMMIT.hash)}&returnTo=%2Ft3x-dev%2Ftest-project`
    );
    expect(screen.queryByRole('button', { name: 'Change review dock' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Canvas/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy path' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open graph' })).not.toBeInTheDocument();

    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    expect(structureView).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden');
    const structureScroller = within(structureView).getByRole('region', { name: 'State rows' });
    expect(structureScroller).toHaveAttribute('tabindex', '0');
    const structureScrollArea = structureScroller.closest('[data-slot="state-scroll-area"]');
    expect(structureScrollArea).toHaveClass('min-h-0', 'flex-1');
    expect(structureScrollArea).toHaveAttribute('data-scroll-axes', 'both');
    expect(within(structureView).getByRole('table')).toHaveClass(
      'min-w-[1010px]',
      'text-base',
      'leading-5'
    );
    expect(within(structureView).getByRole('table').querySelector('col')).toHaveClass('w-[250px]');
    expect(within(structureView).getByText('Path / Key').closest('thead')).toHaveClass(
      'sticky',
      'top-0'
    );
    expect(within(structureView).getByText('Path / Key').closest('th')).toHaveClass(
      'sticky',
      'left-0'
    );
    expect(within(structureView).getByText('problem').closest('tr')).toHaveClass('h-10');
    expect(screen.getByRole('heading', { name: 'State details' })).toHaveClass('text-base');

    expect(
      screen.queryByRole('separator', { name: 'Resize state details' })
    ).not.toBeInTheDocument();
  });

  it('uses branch metadata without loading snapshot commits in Canvas mode', () => {
    navigationMocks.search = 'view=canvas&branch=main';
    hookMocks.branchHeads = { main: PRD_COMMIT.hash };

    renderStateTab();

    expect(screen.getByTestId('state-canvas-workspace')).toHaveAttribute(
      'data-focused-branch',
      'main'
    );
    expect(screen.queryByText('main has no HEAD commit.')).not.toBeInTheDocument();
    expect(hookMocks.loadCommits).not.toHaveBeenCalled();
    expect(hookMocks.loadCommit).not.toHaveBeenCalled();
    expect(hookMocks.loadOperations).not.toHaveBeenCalled();
  });

  it('keeps key and value adjacent and collapses parent-managed state rows', async () => {
    hookMocks.loadCommits.mockResolvedValue([MUST_CONDITIONS_COMMIT]);
    renderStateTab();

    await screen.findByText('PRD must conditions committed');
    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    expect(
      within(structureView)
        .getAllByRole('columnheader')
        .map((header) => header.textContent?.trim())
    ).toEqual(['Path / Key', 'Value', 'Type', 'Status', 'Source / Op', 'Issues']);

    const mustToggle = within(structureView).getByRole('button', {
      name: 'Expand Must conditions',
    });
    expect(mustToggle).toHaveAttribute('aria-expanded', 'false');
    for (const key of MUST_CONDITION_KEYS) {
      expect(within(structureView).queryByText(key)).not.toBeInTheDocument();
    }

    fireEvent.change(within(structureView).getByPlaceholderText('Search paths, titles, types...'), {
      target: { value: 'degradation_path' },
    });
    expect(
      within(structureView).getByText('for_every_relevant_case_must_define_degradation_path')
    ).toBeInTheDocument();
    expect(
      within(structureView).getByRole('button', { name: 'Collapse Must conditions' })
    ).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(within(structureView).getByPlaceholderText('Search paths, titles, types...'), {
      target: { value: '' },
    });
    const collapsedMustToggle = within(structureView).getByRole('button', {
      name: 'Expand Must conditions',
    });
    fireEvent.click(collapsedMustToggle.closest('tr')!);
    expect(
      within(structureView).getByRole('button', { name: 'Collapse Must conditions' })
    ).toHaveAttribute('aria-expanded', 'true');
    for (const key of MUST_CONDITION_KEYS) {
      expect(within(structureView).getByText(key)).toBeInTheDocument();
    }

    const problemToggle = within(structureView).getByRole('button', {
      name: 'Collapse summary',
    });
    fireEvent.click(problemToggle.closest('tr')!);
    expect(within(structureView).queryByText('problem')).not.toBeInTheDocument();

    const rootToggle = within(structureView).getByRole('button', { name: 'Collapse prd' });
    fireEvent.click(rootToggle.closest('tr')!);
    expect(
      within(structureView).queryByRole('button', { name: 'Collapse Must conditions' })
    ).not.toBeInTheDocument();
    expect(within(structureView).queryByText('title')).not.toBeInTheDocument();

    fireEvent.click(within(structureView).getByRole('button', { name: 'Expand prd' }));
    expect(
      within(structureView).getByRole('button', { name: 'Collapse Must conditions' })
    ).toBeInTheDocument();
  });

  it('summarizes and collapses dense boolean rule groups by default', async () => {
    hookMocks.loadCommits.mockResolvedValue([DENSE_RULES_COMMIT]);
    renderStateTab();

    await screen.findByText('Dense rule groups committed');
    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    const constraintsToggle = within(structureView).getByRole('button', {
      name: 'Expand constraints',
    });
    const retryToggle = within(structureView).getByRole('button', {
      name: 'Expand retry_eligibility',
    });

    expect(constraintsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(retryToggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(structureView).getByText('4 rules · all enabled')).toBeInTheDocument();
    expect(within(structureView).getByText('5 fields · 4/4 rules enabled')).toBeInTheDocument();
    for (const key of DENSE_RULE_KEYS) {
      expect(within(structureView).queryByText(key)).not.toBeInTheDocument();
    }

    fireEvent.change(within(structureView).getByPlaceholderText('Search paths, titles, types...'), {
      target: { value: 'delivery_must_be_incremental' },
    });
    const longKey = within(structureView).getByText('delivery_must_be_incremental');
    expect(longKey).toBeInTheDocument();
    expect(longKey).toHaveClass('min-w-0', 'flex-1', 'truncate');
    expect(longKey).not.toHaveClass('line-clamp-2', '[overflow-wrap:anywhere]');
    expect(longKey).toHaveAttribute(
      'title',
      expect.stringContaining('delivery_must_be_incremental')
    );
    expect(
      within(structureView).getByRole('button', { name: 'Collapse constraints' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('checks branch freshness on focus without exposing a manual Refresh action', async () => {
    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    fireEvent.focus(window);

    await waitFor(() => expect(hookMocks.refreshBranches).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Just now')).toBeInTheDocument();
    expect(hookMocks.refreshWorkspaces).not.toHaveBeenCalled();
  });

  it('announces a newer branch HEAD while keeping the inspected commit pinned until View latest', async () => {
    const newerHead: ApiCommit = {
      ...PRD_COMMIT,
      committed_at: '2026-07-30T05:00:00.000Z',
      hash: 'sha256:9f31c42000000000000000000000000000000000000000000000000000000000',
      message: 'Confirm retry recovery validation evidence',
      parents: [PRD_COMMIT.hash],
    };
    hookMocks.loadCommit.mockImplementation(async (hash: string) => {
      if (hash === newerHead.hash) return newerHead;
      if (hash === PRD_COMMIT.hash) return PRD_COMMIT;
      return PARENT_COMMIT;
    });
    const view = renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    hookMocks.branchHeads = { main: newerHead.hash };
    hookMocks.loadCommits.mockResolvedValue([newerHead, PRD_COMMIT]);
    view.rerender(
      <ProjectStateTab projectId="proj_test" projectName="Test Project" validation={VALIDATION} />
    );

    const update = await screen.findByRole('status');
    expect(update).toHaveTextContent('Newer commit available on main');
    expect(update).toHaveTextContent('9f31c42');
    expect(
      screen.getByRole('heading', { name: 'PRD audience handoff committed' })
    ).toBeInTheDocument();
    expect(screen.getByText('main · pinned cb5813f')).toBeInTheDocument();

    fireEvent.click(within(update).getByRole('button', { name: 'View latest' }));

    expect(
      await screen.findByRole('heading', { name: 'Confirm retry recovery validation evidence' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Newer commit available on main')).not.toBeInTheDocument();
  });

  it('routes changed paths to the shared commit T3X Diff instead of drawing an inline diff', async () => {
    renderStateTab();

    const changedPaths = await screen.findByRole('link', { name: '2 changed paths' });
    expect(changedPaths).toHaveAttribute(
      'href',
      `/project/proj_test/diff?base=${encodeURIComponent(PRD_COMMIT.parents[0])}&target=${encodeURIComponent(PRD_COMMIT.hash)}&returnTo=%2Ft3x-dev%2Ftest-project`
    );
    expect(screen.queryByRole('region', { name: 'T3X Diff' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Structure/ })).toBeInTheDocument();
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
    expect(screen.getAllByText('Find food and drinks')).not.toHaveLength(0);
    expect(screen.getByRole('navigation', { name: 'PRD semantic nodes' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Document outline' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'PRD inspector' })).toBeInTheDocument();
    expect(screen.getByText('Selected semantic node')).toBeInTheDocument();
    expect(screen.queryByText('AC-001-01')).not.toBeInTheDocument();
    expect(screen.queryByText('Seventh rollout field remains visible')).not.toBeInTheDocument();

    const schemaRender = screen.getByRole('region', { name: 'Schema render' });
    expect(schemaRender).toHaveClass('h-full', 'min-h-0', 'flex-1', 'overflow-hidden');

    const outlineSeparator = screen.getByRole('separator', {
      name: 'Resize document outline',
    });
    const inspectorSeparator = screen.getByRole('separator', {
      name: 'Resize PRD inspector',
    });
    expect(outlineSeparator).toHaveAttribute('aria-valuenow', '220');
    expect(inspectorSeparator).toHaveAttribute('aria-valuenow', '310');
    fireEvent.keyDown(outlineSeparator, { key: 'ArrowRight' });
    fireEvent.keyDown(inspectorSeparator, { key: 'ArrowLeft' });
    expect(outlineSeparator).toHaveAttribute('aria-valuenow', '236');
    expect(inspectorSeparator).toHaveAttribute('aria-valuenow', '326');
    fireEvent.doubleClick(outlineSeparator);
    fireEvent.doubleClick(inspectorSeparator);
    expect(outlineSeparator).toHaveAttribute('aria-valuenow', '220');
    expect(inspectorSeparator).toHaveAttribute('aria-valuenow', '310');

    vi.spyOn(
      outlineSeparator.parentElement as HTMLElement,
      'getBoundingClientRect'
    ).mockReturnValue({
      bottom: 760,
      height: 640,
      left: 0,
      right: 1900,
      top: 120,
      width: 1900,
      x: 0,
      y: 120,
      toJSON: () => ({}),
    });
    fireEvent.mouseDown(outlineSeparator, { clientX: 220 });
    fireEvent.mouseMove(document, { clientX: 270 });
    expect(outlineSeparator).toHaveAttribute('aria-valuenow', '270');
    fireEvent.mouseUp(document);
    fireEvent.doubleClick(outlineSeparator);

    fireEvent.mouseDown(inspectorSeparator, { clientX: 1590 });
    fireEvent.mouseMove(document, { clientX: 1540 });
    expect(inspectorSeparator).toHaveAttribute('aria-valuenow', '360');
    fireEvent.mouseUp(document);
    fireEvent.doubleClick(inspectorSeparator);

    const requirementButton = screen.getByRole('button', {
      name: 'Inspect requirement Find food and drinks',
    });
    expect(requirementButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(requirementButton);
    expect(requirementButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('AC-001-01')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rollout Plan · rollout_plan' }));
    expect(screen.getByText('Seventh rollout field remains visible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /HEAD evidence 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /HEAD YOps 3/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Find food and drinks · 0' }));
    const inspector = screen.getByRole('complementary', { name: 'PRD inspector' });
    expect(
      within(inspector).getByRole('heading', { name: '0 · Find food and drinks' })
    ).toBeInTheDocument();
    expect(within(inspector).getByText('State → prd → requirements → 0')).toBeInTheDocument();
    expect(within(inspector).getByText('1 acceptance criterion')).toBeInTheDocument();
    expect(within(inspector).getByText('Present')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /HEAD YOps 3/ }));
    expect(screen.getByText('HEAD materialized YOps')).toBeInTheDocument();
    expect(screen.getByText('prd/summary/problem')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'raw' }));
    expect(screen.getByRole('region', { name: 'Raw materialized YAML' })).toHaveTextContent('prd:');
  });

  it('uses Skill-specific state labels and the Skill reader for a Skill commit', async () => {
    const skillCommit: ApiCommit = {
      ...PRD_COMMIT,
      content: {
        relations: [],
        trees: [
          {
            children: [],
            key: 'manifest',
            slots: {
              default_freedom: 'medium',
              description: 'Review code when a user requests a review.',
              name: 'review-code',
            },
          },
          {
            children: [],
            key: 'activation',
            slots: {
              implicit: true,
              should_not_trigger: ['Implement this feature.'],
              should_trigger: ['Review this change.'],
            },
          },
          {
            children: [],
            key: 'contract',
            slots: {
              goal: 'Produce an evidence-backed review.',
              inputs: ['Repository changes'],
              non_goals: ['Implement fixes'],
              outputs: ['Actionable findings'],
              truth_policy: 'evidence_only',
            },
          },
          {
            children: [
              {
                children: [],
                key: 'inspect',
                slots: {
                  approval: 'none',
                  body: 'Read the diff and surrounding code.',
                  effect: 'read',
                  freedom: 'medium',
                  kind: 'procedure',
                  sequence: 1,
                  success_criteria: ['Changes are inspected.'],
                  title: 'Inspect changes',
                },
              },
            ],
            key: 'instructions',
            slots: {},
          },
        ],
      },
      hash: 'sha256:skill',
      message: 'Add review-code Skill',
      parents: [],
      provenance: { method: 'workspace', schema_ref: { name: 't3x/skill' } },
      yops_log_ids: [],
    };
    hookMocks.loadCommits.mockResolvedValue([skillCommit]);
    hookMocks.loadOperations.mockResolvedValue({ commit_hash: skillCommit.hash, operations: [] });

    renderStateTab(null);

    await screen.findByText('Add review-code Skill');
    expect(screen.getByText('skill-state.yaml')).toBeInTheDocument();
    expect(screen.getAllByText('t3x/skill').length).toBeGreaterThan(0);
    expect(screen.queryByText('adapter skill.document')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Render/ }));
    expect(screen.getByRole('region', { name: 'Skill schema render' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'review-code' })).toBeInTheDocument();
  });

  it('routes Prompt commits to the Prompt reader with validation and YOp context', async () => {
    hookMocks.loadCommits.mockResolvedValue([PROMPT_COMMIT]);
    hookMocks.loadOperations.mockResolvedValue({
      commit_hash: PROMPT_COMMIT.hash,
      operations: [
        {
          created_at: '2026-07-30T08:00:00.000Z',
          id: 'op_prompt',
          model: null,
          source: 'source_chat',
          turn_hash: 'turn_prompt',
          yops: [
            {
              set: {
                path: 'messages/system_policy/template',
                value: 'Use source evidence only.',
              },
            },
          ],
        },
      ],
    });

    renderStateTab(PROMPT_VALIDATION);

    await screen.findByText('Add extract requirements Prompt');
    expect(screen.getByText('prompt-state.yaml')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Render/ }));
    expect(screen.getByRole('region', { name: 'Prompt schema render' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText('messages/system_policy/template')).not.toHaveLength(0);
    expect(screen.getByText('01 SET')).toBeInTheDocument();
    expect(screen.getByText('Source Chat')).toBeInTheDocument();
  });

  it('renders unregistered schemas as an inspectable document instead of a generic card', async () => {
    const genericCommit: ApiCommit = {
      ...PRD_COMMIT,
      content: {
        relations: [],
        trees: [
          {
            children: [{ children: [], key: 'hostname', slots: { value: 'sensor-node-1' } }],
            key: 'device',
            slots: { platform: 'esphome' },
          },
        ],
      },
      hash: 'sha256:generic-state',
      message: 'Add device state',
      parents: [],
      provenance: { method: 'workspace', schema_ref: { name: 'vendor/device', version: 'v1' } },
      sources: [],
      yops_log_ids: [],
    };
    hookMocks.loadCommits.mockResolvedValue([genericCommit]);
    hookMocks.loadOperations.mockResolvedValue({
      commit_hash: genericCommit.hash,
      operations: [],
    });

    renderStateTab(null);

    await screen.findByText('Add device state');
    fireEvent.click(screen.getByRole('tab', { name: /Render/ }));
    expect(screen.getByRole('region', { name: 'Schema render' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Device' })).toBeInTheDocument();
    expect(screen.getAllByText('Platform')).not.toHaveLength(0);
    expect(screen.getByText('esphome')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Generic structured state render' })
    ).not.toBeInTheDocument();
  });

  it('initializes a new branch from main without inventing a schema binding', async () => {
    hookMocks.branchHeads = { main: null };
    hookMocks.loadCommits.mockResolvedValue([]);
    renderStateTab();

    await screen.findByText('No commit on this branch');
    fireEvent.click(screen.getByRole('button', { name: 'New branch' }));
    fireEvent.change(screen.getByLabelText('Branch name'), {
      target: { value: 'feature/checkout-retry' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create branch' }));

    await waitFor(() => {
      expect(hookMocks.createBranch).toHaveBeenCalledWith('feature/checkout-retry', 'main');
      expect(hookMocks.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          baseCommitHash: PRD_COMMIT.hash,
          id: 'workspace_branch:feature%2Fcheckout-retry',
          schemaBindings: [],
          status: 'draft',
          targetBranch: 'feature/checkout-retry',
        })
      );
    });
    expect(navigationMocks.router.push).toHaveBeenCalledWith(
      '/t3x-dev/test-project/workspaces?branch=feature%2Fcheckout-retry'
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
    expect(codeView).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden');
    const codeScroller = within(codeView).getByRole('region', {
      name: 'Canonical YAML content',
    });
    expect(codeScroller).toHaveAttribute('tabindex', '0');
    const codeScrollArea = codeScroller.closest('[data-slot="state-scroll-area"]');
    expect(codeScrollArea).toHaveClass('min-h-0', 'flex-1');
    expect(codeScrollArea).toHaveAttribute('data-scroll-axes', 'both');
    expect(codeView.querySelector('code')).toHaveClass('min-w-max');
    expect(within(codeView).getByText('problem: "You: i need food and drink"')).toHaveClass(
      'whitespace-pre'
    );
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
    expect(screen.getByRole('region', { name: 'Multi-commit state canvas' })).toHaveClass(
      'h-full',
      'min-h-0',
      'flex-1',
      'overflow-hidden'
    );
    expect(screen.getByTestId('state-canvas-workspace')).toHaveAttribute(
      'data-focused-branch',
      'main'
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
              afterValue: 'Office workers',
              id: 'op_backend_2',
              op: 'set',
              path: 'prd/summary/outcome',
              summary: 'Set summary.outcome',
            },
            {
              afterValue: 'Find food and drinks',
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
    expect(screen.getAllByText('Validation pending').length).toBeGreaterThan(0);
    expect(screen.queryByText('Validated at HEAD')).not.toBeInTheDocument();
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
    expect(screen.getAllByText('Validation pending').length).toBeGreaterThan(0);
    expect(screen.queryByText('Validated at HEAD')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run validation' }));
    expect(onRunValidation).toHaveBeenCalledWith(PRD_COMMIT.hash, 't3x/prd');
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
    expect(screen.getAllByText('Validated at HEAD').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Run validation' })).not.toBeInTheDocument();
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
    expect(hookMocks.loadOperations).toHaveBeenCalledWith(tip.hash, 'proj_test');
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
    expect(screen.getByRole('link', { name: 'History' })).toHaveTextContent('0');
    expect(screen.queryByText('stale-canvas-branch')).not.toBeInTheDocument();
    expect(screen.queryByText(/stale-canvas-commit/)).not.toBeInTheDocument();

    const details = screen.getByRole('heading', { name: 'State details' }).closest('section');
    expect(details).not.toBeNull();
    const changedLabel = within(details as HTMLElement).getByText('Changed');
    expect(changedLabel.nextElementSibling).toHaveTextContent('0 paths');
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
    expect(hookMocks.loadCommit).toHaveBeenCalledWith(inheritedHead.hash, 'proj_test');
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

  it('clears stale commit actions while a newly selected branch is loading', async () => {
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
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=feature%2Fprd-audience&returnTo=%2Ft3x-dev%2Ftest-project%3Fbranch%3Dfeature%252Fprd-audience'
    );
  });
});
