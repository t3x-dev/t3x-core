// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStateTab } from '@/components/project/ProjectStateTab';
import { PRD_CORE_ARTIFACT, PRD_MODULE_ARTIFACTS } from '@/data/schemaModules';
import type { YSchemaValidationSummary } from '@/domain/project/yschemaValidation';
import { useCanvasStore } from '@/store/canvasStore';
import type { ApiCommit, SkillArtifact } from '@/types/api';
import type { SchemaArtifactPreview } from '@/types/schemaModules';
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
  schemaArtifacts: [] as SchemaArtifactPreview[],
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

vi.mock('@/hooks/schemas/useSchemaArtifactRegistry', () => ({
  useSchemaArtifactRegistry: () => ({
    artifacts: hookMocks.schemaArtifacts,
    error: undefined,
    pending: false,
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
        slots: { title: 'Checkout rollout guardrails' },
        children: [
          {
            key: 'summary',
            slots: {
              problem:
                'Checkout-api release risk is hard to audit without deterministic rollout evidence.',
              audience: 'Release managers and checkout platform engineers',
              outcome: 'Service checkout-api currently has replicas 4',
              scope: 'checkout-api canary rollout',
              source: 'source_chat:conv_d4d239f3',
            },
            children: [],
          },
          {
            key: 'requirements',
            slots: {},
            children: [
              {
                key: 'checkout_api_rollout',
                slots: {
                  title: 'Service checkout-api currently has replicas 4',
                  priority: 'P1',
                  owner: 'Checkout platform',
                  service: 'checkout-api',
                  environment: 'production',
                  acceptance: 'Replay confirms desired replicas before traffic promotion',
                  release_gate: 'Replay verifies canary rollout before commit',
                  rollback: 'Restore baseline replicas and disable canary traffic',
                  metric: 'checkout error rate remains below 0.2 percent',
                },
                children: [],
              },
              {
                key: 'traffic_guardrails',
                slots: {
                  title: 'Guard canary traffic before promotion',
                  priority: 'P1',
                  owner: 'Release agent',
                  service: 'checkout-api',
                  environment: 'production',
                  acceptance: 'Promotion only proceeds after replay and schema checks pass',
                  rollback: 'Hold at current exposure and page release owner',
                  metric: 'p95 latency remains within rollout budget',
                },
                children: [],
              },
            ],
          },
          {
            key: 'metadata',
            slots: {
              version: '1.0.0',
              source: 'source_chat:conv_d4d239f3',
              owner: 'Release agent',
              review_mode: 'pull-request level',
            },
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
                  schedule: 'weekday business-hours release window',
                },
                children: [],
              },
            ],
          },
          {
            key: 'verification',
            slots: {
              replay: 'matched',
              schema: 'valid',
              evidence_review: 'pending',
              reviewer: 'release-agent',
            },
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
        slots: { title: 'Checkout rollout guardrails' },
        children: [
          {
            key: 'summary',
            slots: {
              problem: 'Manual rollout steps make checkout-api releases hard to audit.',
              audience: 'Release managers and checkout platform engineers',
              outcome: 'Reduce deployment risk with manual review checkpoints.',
              scope: 'checkout-api canary rollout',
              source: 'source_chat:conv_d4d239f3',
            },
            children: [],
          },
          {
            key: 'requirements',
            slots: {},
            children: [
              {
                key: 'checkout_api_rollout',
                slots: {
                  title: 'Scale checkout-api manually before launch',
                  priority: 'P1',
                  owner: 'Checkout platform',
                  service: 'checkout-api',
                  environment: 'production',
                  acceptance: 'Replay confirms desired replicas before traffic promotion',
                  legacy_gate: 'Manual approver confirms launch note before merge',
                  rollback: 'Restore baseline replicas and disable canary traffic',
                  metric: 'checkout error rate remains below 0.2 percent',
                },
                children: [],
              },
              {
                key: 'traffic_guardrails',
                slots: {
                  title: 'Guard canary traffic before promotion',
                  priority: 'P1',
                  owner: 'Release agent',
                  service: 'checkout-api',
                  environment: 'production',
                  acceptance: 'Promotion only proceeds after replay and schema checks pass',
                  rollback: 'Hold at current exposure and page release owner',
                  metric: 'p95 latency remains within rollout budget',
                },
                children: [],
              },
            ],
          },
          ...PRD_COMMIT.content.trees[0]!.children.slice(2),
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
      code: 'RETIRED_GATE_REVIEW',
      label: 'Retired gate review',
      message: 'legacy_gate was removed and needs release-owner signoff.',
      path: 'prd.requirements.checkout_api_rollout.legacy_gate',
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
          {
            set: {
              path: 'prd.summary.problem',
              value:
                'Checkout-api release risk is hard to audit without deterministic rollout evidence.',
            },
          },
          {
            set: {
              path: 'prd.summary.outcome',
              value: 'Service checkout-api currently has replicas 4',
            },
          },
          {
            set: {
              path: 'prd.requirements.checkout_api_rollout.title',
              value: 'Service checkout-api currently has replicas 4',
            },
          },
          { unset: { path: 'prd.requirements.checkout_api_rollout.legacy_gate' } },
          {
            append: {
              path: 'prd.requirements.checkout_api_rollout.release_gate',
              value: 'Replay verifies canary rollout before commit',
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
    hookMocks.schemaArtifacts = [];
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

  it('loads the branch HEAD and renders the structured state tree from the Structure view', async () => {
    navigationMocks.search = 'view=structure&branch=main';
    hookMocks.projectWorkspaces = [
      {
        baseCommitHash: PRD_COMMIT.hash,
        id: 'workspace_main_prd',
        outputTargets: [
          {
            format: 'markdown',
            id: 'output_prd_markdown',
            status: 'draft_target',
            title: 'PRD document export',
            type: 'document',
          },
        ],
        projectId: 'proj_test',
        schemaBindings: [],
        schemaCandidate: { fields: [], summary: 'Current branch workspace' },
        schemaReview: { gaps: [], summary: 'Ready', verdict: 'ready' },
        sourceBundle: [],
        status: 'draft',
        summary: 'Current branch workspace',
        targetBranch: 'main',
        title: 'Branch workspace',
        updatedAt: '2026-07-09T08:03:00.000Z',
        yopsDraft: { id: 'draft_workspace_main_prd', operations: [] },
      },
    ];

    renderStateTab();

    expect(await screen.findAllByText('PRD audience handoff committed')).not.toHaveLength(0);
    expect(document.querySelector('[data-state-view="structure"]')).toHaveClass(
      'h-full',
      'min-h-0',
      'overflow-hidden'
    );
    expect(screen.queryByRole('region', { name: 'State overview' })).not.toBeInTheDocument();
    expect(screen.queryByText('Snapshot')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Structure/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText('summary')).not.toHaveLength(0);
    expect(screen.getAllByText('problem')).not.toHaveLength(0);
    expect(screen.getAllByText('audience')).not.toHaveLength(0);
    expect(screen.getAllByText('01 SET')[0]).toBeInTheDocument();
    expect(screen.getAllByText('REMOVE')[0]).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Views' })).not.toBeInTheDocument();
    const relationships = screen.getByRole('complementary', { name: 'State relationships' });
    expect(within(relationships).queryByText('Document')).not.toBeInTheDocument();
    expect(within(relationships).getByText('About')).toBeInTheDocument();
    expect(
      within(relationships).queryByText('Version control for structured state.')
    ).not.toBeInTheDocument();
    expect(within(relationships).queryByText('structured-state')).not.toBeInTheDocument();
    expect(within(relationships).getByText('Revision')).toBeInTheDocument();
    expect(within(relationships).getByText('Validation')).toBeInTheDocument();
    expect(within(relationships).getAllByText('t3x/prd')).not.toHaveLength(0);
    expect(within(relationships).getAllByText('prd')).not.toHaveLength(0);
    expect(within(relationships).getByText('HEAD cb5813f')).toBeInTheDocument();
    expect(within(relationships).getByText('1 commit')).toBeInTheDocument();
    expect(within(relationships).getByText('5 changes')).toBeInTheDocument();
    expect(within(relationships).getByText('1 gap')).toBeInTheDocument();
    expect(within(relationships).getByText('Sources')).toBeInTheDocument();
    expect(within(relationships).getByRole('link', { name: /conv_d4d239f3/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/project/proj_test/sources/conversations/conv_d4d239f3')
    );
    expect(within(relationships).getByText('Used by')).toBeInTheDocument();
    expect(within(relationships).getByRole('link', { name: /Branch workspace/ })).toHaveAttribute(
      'href',
      '/t3x-dev/test-project/workspaces?branch=main'
    );
    expect(within(relationships).getByText('PRD document export')).toBeInTheDocument();
    expect(within(relationships).queryByText('Contributors')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'State details' })).not.toBeInTheDocument();
    expect(hookMocks.loadCommits).toHaveBeenCalledWith('proj_test', 'main', 100);
    expect(hookMocks.loadOperations).toHaveBeenCalledWith(PRD_COMMIT.hash, 'proj_test');
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=main&returnTo=%2Ft3x-dev%2Ftest-project%3Fview%3Dstructure%26branch%3Dmain'
    );
    expect(screen.getByRole('link', { name: 'Use this state' })).toHaveAttribute(
      'href',
      '/t3x-dev/test-project/workspaces?branch=main'
    );
    expect(screen.queryByRole('button', { name: 'Like 0' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Follow branch main' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open workspace' })).toHaveAttribute(
      'href',
      '/t3x-dev/test-project/workspaces?branch=main'
    );
    expect(screen.queryByRole('link', { name: 'Parent diff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /changed paths/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change review dock' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Canvas/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Compare' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy path' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open graph' })).not.toBeInTheDocument();

    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    expect(structureView).toHaveClass('min-h-0', 'flex-1', 'overflow-hidden');
    const structureScroller = within(structureView).getByRole('region', { name: 'State rows' });
    expect(structureScroller).toHaveAttribute('tabindex', '0');
    const structureScrollArea = structureScroller.closest('[data-slot="state-scroll-area"]');
    expect(structureScrollArea).toHaveClass('min-h-0', 'flex-1');
    expect(structureScrollArea).toHaveAttribute('data-scroll-axes', 'vertical');
    expect(within(structureView).getByRole('table')).toHaveClass(
      'w-full',
      'min-w-0',
      'table-fixed'
    );
    expect(within(structureView).getByRole('table').querySelector('col')).toHaveClass('w-[29%]');
    expect(within(structureView).getByRole('table').querySelector('thead')).toBeNull();
    expect(within(structureScroller).getByText('problem').closest('tr')).toHaveClass('h-[34px]');
    expect(screen.queryByRole('heading', { name: 'State details' })).not.toBeInTheDocument();

    expect(
      screen.queryByRole('separator', { name: 'Resize state details' })
    ).not.toBeInTheDocument();
  });

  it('shows a selected state node provenance form from Structure row clicks', async () => {
    navigationMocks.search = 'view=structure&branch=main';

    renderStateTab();

    expect(await screen.findAllByText('PRD audience handoff committed')).not.toHaveLength(0);
    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    const stateRowsRegion = within(structureView).getByRole('region', { name: 'State rows' });
    expect(stateRowsRegion.closest('[data-slot="state-scroll-area"]')).toHaveAttribute(
      'data-scroll-axes',
      'vertical'
    );
    expect(within(stateRowsRegion).getByRole('table')).toHaveClass('min-w-0');
    const exactDiffKinds = within(stateRowsRegion)
      .getAllByRole('row')
      .filter((row) => row.getAttribute('data-diff-exact') === 'true')
      .map((row) => row.getAttribute('data-diff-kind'))
      .sort();
    expect(exactDiffKinds).toEqual(['added', 'modified', 'modified', 'modified', 'removed']);
    expect(within(stateRowsRegion).getAllByRole('row').length).toBeGreaterThanOrEqual(30);
    const selectedStateRow = within(stateRowsRegion)
      .getAllByRole('row')
      .find((stateRow) => stateRow.getAttribute('aria-selected') === 'true');
    expect(selectedStateRow?.getAttribute('data-diff-kind')).toBe('modified');
    expect(selectedStateRow?.getAttribute('class')).toContain('bg-[var(--diff-modified-bg)]');
    expect(selectedStateRow?.getAttribute('class')).toContain('[&>td]:bg-[var(--panel)]');
    expect(selectedStateRow?.querySelector('td > span[aria-hidden="true"]')).toHaveClass(
      'bg-[var(--diff-modified-accent)]'
    );
    expect(selectedStateRow?.querySelector('td')?.getAttribute('class')).not.toContain(
      'accent-commit'
    );

    const selectedNode = screen.getByRole('complementary', { name: 'State change provenance' });
    const selectedForm = within(selectedNode).getByRole('form', {
      name: 'State change provenance form',
    });

    expect(within(selectedForm).getByRole('heading', { name: 'problem' })).toBeInTheDocument();
    expect(within(selectedForm).getByText('Selected change')).toBeInTheDocument();
    expect(within(selectedForm).getByText('Modified')).toBeInTheDocument();
    const stateValueChange = within(selectedForm).getByTestId('state-value-change');
    expect(stateValueChange).toHaveClass('mt-3', 'min-w-0');
    expect(stateValueChange.firstElementChild).toHaveClass(
      'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      'px-2'
    );
    const stateValueFrame = within(stateValueChange).getByTestId('state-value-frame');
    expect(stateValueFrame).toHaveClass(
      'h-9',
      'overflow-hidden',
      'rounded-[8px]',
      'shadow-[var(--fx-shadow-sm)]'
    );
    expect(within(stateValueChange).getByTestId('state-before-value')).toHaveClass(
      'block',
      'overflow-hidden',
      'rounded-[6px]',
      'hover:bg-[var(--surface-elevated)]'
    );
    expect(within(stateValueChange).getByText('Before')).toHaveClass('text-[10px]');
    expect(within(stateValueChange).getByText('Result')).toHaveClass('text-[10px]');
    expect(within(stateValueFrame).getByText('->')).toBeInTheDocument();
    expect(within(stateValueChange).getByTestId('state-before-value')).toHaveAttribute(
      'aria-label',
      'Before full value: Manual rollout steps make checkout-api releases hard to audit.'
    );
    expect(within(stateValueChange).getByTestId('state-before-value')).toHaveAttribute(
      'title',
      'Manual rollout steps make checkout-api releases hard to audit.'
    );
    expect(within(stateValueChange).getByTestId('state-result-value')).toHaveAttribute(
      'aria-label',
      'Result full value: Checkout-api release risk is hard to audit without deterministic rollout evidence.'
    );
    expect(within(stateValueChange).getByTestId('state-result-value')).toHaveAttribute(
      'title',
      'Checkout-api release risk is hard to audit without deterministic rollout evidence.'
    );
    expect(within(stateValueChange).queryByRole('button', { name: 'View full value' })).toBeNull();
    expect(
      within(selectedForm).getAllByText(
        'Manual rollout steps make checkout-api releases hard to audit.'
      ).length
    ).toBeGreaterThan(0);
    expect(
      within(selectedForm).getAllByText(
        'Checkout-api release risk is hard to audit without deterministic rollout evidence.'
      ).length
    ).toBeGreaterThan(0);
    expect(within(selectedForm).getByRole('heading', { name: 'Why' })).toBeInTheDocument();
    expect(within(selectedForm).getByRole('heading', { name: 'Source' })).toBeInTheDocument();
    expect(within(selectedForm).getByRole('link', { name: 'conv_d4d239f3' })).toHaveAttribute(
      'href',
      `/project/proj_test/sources/conversations/conv_d4d239f3?branch=main&commit=${encodeURIComponent(PRD_COMMIT.hash)}`
    );
    expect(
      within(selectedForm).getByText(
        'problem = Checkout-api release risk is hard to audit without deterministic rollout evidence.'
      )
    ).toBeInTheDocument();
    expect(within(selectedForm).getByText('Verified')).toBeInTheDocument();
    expect(within(selectedForm).getByText('Replay matched · Schema valid')).toBeInTheDocument();
    expect(within(selectedForm).getByText('Technical details')).toBeInTheDocument();
    const detailsButton = within(selectedForm).getByRole('button', { name: 'View' });
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(detailsButton);
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
    expect(detailsButton).toHaveTextContent('Hide');
    expect(within(selectedForm).getByText('State path')).toBeInTheDocument();
    expect(within(selectedForm).getByText('prd / summary / problem')).toBeInTheDocument();
    expect(within(selectedForm).getByText('Effect')).toBeInTheDocument();
    expect(within(selectedForm).getByText('Replay')).toBeInTheDocument();
    expect(within(selectedForm).getByText('Base base-pr -> HEAD cb5813f')).toBeInTheDocument();
    expect(within(selectedForm).getByText('Commit')).toBeInTheDocument();
    expect(within(selectedForm).getAllByText('01 SET: prd/summary/problem')).not.toHaveLength(0);
    expect(
      within(selectedForm).getByText(
        'This commit updates the problem statement from its parent value.'
      )
    ).toBeInTheDocument();
    expect(within(selectedForm).getByRole('button', { name: 'Edit result' })).toBeInTheDocument();
    expect(within(selectedForm).getByRole('button', { name: 'Comment' })).toBeInTheDocument();
    expect(within(selectedForm).queryByRole('button', { name: 'More' })).not.toBeInTheDocument();

    fireEvent.click(within(selectedForm).getByRole('button', { name: 'Edit result' }));

    await waitFor(() =>
      expect(within(selectedNode).getByRole('heading', { name: 'Edit result' })).toBeInTheDocument()
    );
    const editForm = within(selectedNode).getByRole('form', {
      name: 'State change provenance form',
    });
    expect(within(editForm).getByRole('heading', { name: 'Edit result' })).toBeInTheDocument();
    expect(
      within(editForm).getByRole('heading', { name: 'Propose a new result' })
    ).toBeInTheDocument();
    expect(within(editForm).getByLabelText('Before')).toHaveTextContent(
      'Manual rollout steps make checkout-api releases hard to audit.'
    );
    expect(within(editForm).getByLabelText('Proposed result')).toHaveValue(
      'Checkout-api release risk is hard to audit without deterministic rollout evidence.'
    );
    expect(within(editForm).getByLabelText('Why is this result different?')).toHaveValue(
      'This commit updates the problem statement from its parent value.'
    );
    expect(within(editForm).getByLabelText('Source')).toHaveValue('conv_d4d239f3');
    expect(
      within(editForm).getByText('Schema checks run now; replay reruns after save.')
    ).toBeInTheDocument();

    fireEvent.click(within(editForm).getAllByRole('button', { name: 'Cancel' })[0]);

    fireEvent.click(screen.getByRole('row', { name: /legacy_gate/ }));

    await waitFor(() =>
      expect(within(selectedNode).getByRole('heading', { name: 'legacy_gate' })).toBeInTheDocument()
    );
    expect(within(selectedNode).getByText('1 passed · 1 needs review')).toBeInTheDocument();
    expect(within(selectedNode).getByText('Schema needs review')).toBeInTheDocument();
    expect(
      within(selectedNode).getByText(
        'Retired gate review: legacy_gate was removed and needs release-owner signoff.'
      )
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('row', { name: /outcome Service checkout-api currently has replicas 4/ })
    );

    await waitFor(() =>
      expect(within(selectedNode).getByRole('heading', { name: 'outcome' })).toBeInTheDocument()
    );
    expect(
      within(selectedNode).getAllByText('Reduce deployment risk with manual review checkpoints.')
        .length
    ).toBeGreaterThan(0);
    expect(
      within(selectedNode).getAllByText('Service checkout-api currently has replicas 4').length
    ).toBeGreaterThan(0);
    fireEvent.click(within(selectedNode).getByRole('button', { name: 'View' }));
    expect(within(selectedNode).getByText('prd / summary / outcome')).toBeInTheDocument();
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
    navigationMocks.search = 'view=structure&branch=main';
    hookMocks.loadCommits.mockResolvedValue([MUST_CONDITIONS_COMMIT]);
    renderStateTab();

    await screen.findByText('PRD must conditions committed');
    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    const stateRowsRegion = within(structureView).getByRole('region', { name: 'State rows' });
    expect(within(structureView).queryAllByRole('columnheader')).toHaveLength(0);
    expect(within(structureView).getByRole('table')).toHaveClass('table-fixed');

    const mustToggle = within(stateRowsRegion).getByRole('button', {
      name: 'Expand Must conditions',
    });
    expect(mustToggle).toHaveAttribute('aria-expanded', 'false');
    for (const key of MUST_CONDITION_KEYS) {
      expect(within(stateRowsRegion).queryByText(key)).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByPlaceholderText('Search state...'), {
      target: { value: 'degradation_path' },
    });
    expect(
      within(stateRowsRegion).getByText('for_every_relevant_case_must_define_degradation_path')
    ).toBeInTheDocument();
    expect(
      within(stateRowsRegion).getByRole('button', { name: 'Collapse Must conditions' })
    ).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(screen.getByPlaceholderText('Search state...'), {
      target: { value: '' },
    });
    const collapsedMustToggle = within(stateRowsRegion).getByRole('button', {
      name: 'Expand Must conditions',
    });
    fireEvent.click(collapsedMustToggle.closest('tr')!);
    expect(
      within(stateRowsRegion).getByRole('button', { name: 'Collapse Must conditions' })
    ).toHaveAttribute('aria-expanded', 'true');
    for (const key of MUST_CONDITION_KEYS) {
      expect(within(stateRowsRegion).getByText(key)).toBeInTheDocument();
    }

    const problemToggle = within(stateRowsRegion).getByRole('button', {
      name: 'Collapse summary',
    });
    fireEvent.click(problemToggle.closest('tr')!);
    expect(within(stateRowsRegion).queryByText('problem')).not.toBeInTheDocument();

    const rootToggle = within(stateRowsRegion).getByRole('button', { name: 'Collapse prd' });
    fireEvent.click(rootToggle.closest('tr')!);
    expect(
      within(stateRowsRegion).queryByRole('button', { name: 'Collapse Must conditions' })
    ).not.toBeInTheDocument();
    expect(within(stateRowsRegion).queryByText('title')).not.toBeInTheDocument();

    fireEvent.click(within(stateRowsRegion).getByRole('button', { name: 'Expand prd' }));
    expect(
      within(stateRowsRegion).getByRole('button', { name: 'Collapse Must conditions' })
    ).toBeInTheDocument();
  });

  it('summarizes and collapses dense boolean rule groups by default', async () => {
    navigationMocks.search = 'view=structure&branch=main';
    hookMocks.loadCommits.mockResolvedValue([DENSE_RULES_COMMIT]);
    renderStateTab();

    await screen.findByText('Dense rule groups committed');
    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    const stateRowsRegion = within(structureView).getByRole('region', { name: 'State rows' });
    const constraintsToggle = within(stateRowsRegion).getByRole('button', {
      name: 'Expand constraints',
    });
    const retryToggle = within(stateRowsRegion).getByRole('button', {
      name: 'Expand retry_eligibility',
    });

    expect(constraintsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(retryToggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(stateRowsRegion).getByText('4 rules · all enabled')).toBeInTheDocument();
    expect(within(stateRowsRegion).getByText('5 fields · 4/4 rules enabled')).toBeInTheDocument();
    for (const key of DENSE_RULE_KEYS) {
      expect(within(stateRowsRegion).queryByText(key)).not.toBeInTheDocument();
    }

    fireEvent.change(screen.getByPlaceholderText('Search state...'), {
      target: { value: 'delivery_must_be_incremental' },
    });
    const longKey = within(stateRowsRegion).getByText('delivery_must_be_incremental');
    expect(longKey).toBeInTheDocument();
    expect(longKey).toHaveClass('min-w-0', 'flex-1', 'truncate');
    expect(longKey).not.toHaveClass('line-clamp-2', '[overflow-wrap:anywhere]');
    expect(longKey).toHaveAttribute(
      'title',
      expect.stringContaining('delivery_must_be_incremental')
    );
    expect(
      within(stateRowsRegion).getByRole('button', { name: 'Collapse constraints' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('checks branch freshness on focus without exposing a manual Refresh action', async () => {
    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    fireEvent.focus(window);

    await waitFor(() => expect(hookMocks.refreshBranches).toHaveBeenCalledTimes(1));
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
    expect(screen.queryByRole('heading', { name: 'State details' })).not.toBeInTheDocument();

    fireEvent.click(within(update).getByRole('button', { name: 'View latest' }));

    expect(
      await screen.findByRole('heading', { name: 'Confirm retry recovery validation evidence' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Newer commit available on main')).not.toBeInTheDocument();
  });

  it('does not draw an inline diff from the State toolbar', async () => {
    navigationMocks.search = 'view=structure&branch=main';
    renderStateTab();

    await waitFor(() => expect(screen.getAllByText('problem').length).toBeGreaterThan(0));
    expect(screen.queryByRole('link', { name: /changed paths/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'T3X Diff' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Structure/ })).toBeInTheDocument();
  });

  it('opens the schema-selected Render view from the State tabs', async () => {
    navigationMocks.search = 'view=structure&branch=main';
    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    fireEvent.click(screen.getByRole('tab', { name: /Render/ }));

    expect(
      await screen.findByRole('heading', {
        name: /Product Requirements.*Checkout Rollout Guardrails/,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Render/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: '1. Executive Summary' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. Stakeholders & Audience' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '3. Requirements Schema' })).toBeInTheDocument();
    expect(screen.queryByText('Required field missing')).not.toBeInTheDocument();
    expect(screen.getAllByText('Service checkout-api currently has replicas 4')).not.toHaveLength(
      0
    );
    expect(screen.queryByRole('tablist', { name: 'PRD navigation view' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'PRD semantic nodes' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Document outline' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'PRD inspector' })).not.toBeInTheDocument();
    expect(screen.queryByText('Selected semantic node')).not.toBeInTheDocument();
    expect(screen.queryByText('AC-001-01')).not.toBeInTheDocument();
    expect(screen.queryByText('Seventh rollout field remains visible')).not.toBeInTheDocument();

    const schemaRender = screen.getByRole('region', { name: 'Schema render' });
    expect(schemaRender).toHaveClass('h-full', 'min-h-0', 'flex-1', 'overflow-hidden');
    expect(
      screen.queryByRole('separator', { name: 'Resize document outline' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('separator', { name: 'Resize PRD inspector' })
    ).not.toBeInTheDocument();

    const requirementButton = screen.getByRole('button', {
      name: 'Inspect requirement checkout_api_rollout',
    });
    expect(requirementButton).toBeInTheDocument();
    fireEvent.click(requirementButton);
    expect(screen.getAllByText('Validated node')).not.toHaveLength(0);
    expect(
      screen.getByText('Replay confirms desired replicas before traffic promotion')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Progressive exposure and promotion gates/ })
    );
    expect(screen.getByText('Seventh rollout field remains visible')).toBeInTheDocument();
    expect(screen.queryByText('HEAD materialized YOps')).not.toBeInTheDocument();
  });

  it('uses a current Workspace composition when the rendered HEAD has no committed composition', async () => {
    const rolloutArtifact = PRD_MODULE_ARTIFACTS.find(
      (artifact) => artifact.canonicalName === 't3x/prd-rollout-operations'
    )!;
    hookMocks.schemaArtifacts = [
      PRD_CORE_ARTIFACT,
      { ...rolloutArtifact, nodePaths: ['rollout_plan'] },
    ];
    hookMocks.projectWorkspaces = [
      {
        id: 'workspace_current_prd',
        projectId: 'proj_test',
        title: 'Current PRD workspace',
        summary: 'Draft composition based on the rendered HEAD',
        status: 'draft',
        updatedAt: '2026-07-09T08:00:00.000Z',
        baseCommitHash: PRD_COMMIT.hash,
        targetBranch: 'main',
        sourceBundle: [],
        schemaBindings: [],
        schemaComposition: {
          apiVersion: 't3x.dev/yschema-composition/v1',
          id: 'composition:workspace_current_prd',
          revision: 2,
          family: 'prd',
          status: 'draft',
          core: {
            canonicalName: PRD_CORE_ARTIFACT.canonicalName,
            version: PRD_CORE_ARTIFACT.version,
          },
          modules: [
            {
              canonicalName: rolloutArtifact.canonicalName,
              version: rolloutArtifact.version,
              order: 0,
              slot: 'operations',
            },
          ],
        },
        schemaCandidate: { summary: 'Current Workspace', fields: [] },
        schemaReview: { verdict: 'ready', summary: 'Ready', gaps: [] },
        yopsDraft: { id: 'draft_current_prd', operations: [] },
        outputTargets: [],
      },
    ];

    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    expect(screen.queryByRole('tablist', { name: 'PRD navigation view' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'PRD Module navigation' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'View Rollout & Operations source Module in YSchema' })
    ).toHaveAttribute(
      'href',
      '/t3x-dev/test-project/schemas?family=prd&mode=compose&module=t3x%2Fprd-rollout-operations&version=1.0.0#module-detail'
    );
    expect(
      screen.getByText('Mapped by Workspace composition t3x/prd-rollout-operations@1.0.0')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Progressive exposure and promotion gates/ })
    );
    expect(screen.getByText('Seventh rollout field remains visible')).toBeInTheDocument();
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
    expect(screen.getAllByText('t3x/skill')).not.toHaveLength(0);
    expect(screen.queryByText('adapter skill.document')).not.toBeInTheDocument();
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
    expect(screen.getAllByText('t3x/prompt')).not.toHaveLength(0);
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
    expect(
      screen.getByRole('region', { name: 'Generic structured state render' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Device' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1. Platform' })).toBeInTheDocument();
    expect(screen.getByText('esphome')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Schema render' })).not.toBeInTheDocument();
  });

  it('initializes a new branch from main without inventing a schema binding', async () => {
    hookMocks.branchHeads = { main: null };
    hookMocks.loadCommits.mockResolvedValue([]);
    renderStateTab();

    await screen.findByText('No commit on this branch');
    fireEvent.click(screen.getByRole('button', { name: 'New branch' }));
    const createBranchDialog = screen.getByRole('dialog', { name: 'Create a new branch' });
    fireEvent.change(within(createBranchDialog).getByLabelText('Branch name'), {
      target: { value: 'feature/checkout-retry' },
    });
    fireEvent.click(within(createBranchDialog).getByRole('button', { name: 'Create branch' }));

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

    await screen.findByText('PRD audience handoff committed');
    fireEvent.click(screen.getByRole('tab', { name: /Code/ }));

    const codeView = screen.getByRole('region', { name: 'YAML code view' });
    expect(codeView).toHaveTextContent('prd:');
    expect(codeView).toHaveTextContent('summary:');
    expect(codeView).toHaveTextContent(
      'problem: Checkout-api release risk is hard to audit without deterministic rollout evidence.'
    );
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
    expect(codeView.querySelector('code .whitespace-pre')).not.toBeNull();
  });

  it('opens Canvas as a separate State mode without leaving the repository route', async () => {
    renderStateTab();

    await screen.findByText('PRD audience handoff committed');
    fireEvent.click(screen.getByRole('button', { name: /Canvas/ }));

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

    expect(screen.queryByText('Snapshot')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Canvas/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=main&returnTo=%2Ft3x-dev%2Ftest-project%3Fview%3Dcanvas'
    );
    expect(screen.getByRole('link', { name: 'Use this state' })).toHaveAttribute(
      'href',
      '/t3x-dev/test-project/workspaces?branch=main'
    );
  });

  it('clarifies that an empty focused branch does not own commits shown on the all-branch canvas', async () => {
    hookMocks.loadCommits.mockResolvedValue([]);
    renderStateTab();

    await screen.findByText('No commit on this branch');
    fireEvent.click(screen.getByRole('button', { name: /Canvas/ }));

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
    navigationMocks.search = 'view=structure&branch=main';
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
        schemaReview: { gaps: [], summary: '', verdict: 'ready' },
        sourceBundle: [],
        status: 'committed',
        summary: 'Reviewed PRD workspace',
        targetBranch: 'feature/prd-audience',
        title: 'Checkout rollout guardrails',
        updatedAt: '2026-07-09T08:01:00.000Z',
        yopsDraft: {
          id: 'draft:workspace_prd_handoff',
          operations: [
            {
              afterValue:
                'Checkout-api release risk is hard to audit without deterministic rollout evidence.',
              id: 'op_backend_1',
              op: 'set',
              path: 'prd/summary/problem',
              summary: 'Set summary.problem',
            },
            {
              afterValue: 'Service checkout-api currently has replicas 4',
              id: 'op_backend_2',
              op: 'set',
              path: 'prd/summary/outcome',
              summary: 'Set summary.outcome',
            },
            {
              afterValue: 'Service checkout-api currently has replicas 4',
              id: 'op_backend_3',
              op: 'set',
              path: 'prd/requirements/checkout_api_rollout/title',
              summary: 'Set checkout rollout title',
            },
            {
              id: 'op_backend_4',
              op: 'unset',
              path: 'prd/requirements/checkout_api_rollout/legacy_gate',
              summary: 'Remove legacy release gate',
            },
            {
              afterValue: 'Replay verifies canary rollout before commit',
              id: 'op_backend_5',
              op: 'append',
              path: 'prd/requirements/checkout_api_rollout/release_gate',
              summary: 'Add replay-backed release gate',
            },
          ],
        },
      },
    ];

    renderStateTab(null);

    expect(await screen.findAllByText('PRD audience handoff committed')).not.toHaveLength(0);
    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    expect(within(structureView).getAllByText(/SET/)).toHaveLength(3);
    expect(within(structureView).queryByText('Missing')).not.toBeInTheDocument();
    expect(screen.getByText('Validation pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run validation' })).not.toBeInTheDocument();
    expect(screen.queryByText('Validated at HEAD')).not.toBeInTheDocument();
    expect(screen.queryByText('INITIAL CREATE')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parent diff' })).not.toBeInTheDocument();
  });

  it('keeps stale validation state out of the State toolbar', async () => {
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
    expect(screen.getByText('Validation pending')).toBeInTheDocument();
    expect(screen.queryByText('Validated at HEAD')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run validation' })).not.toBeInTheDocument();
    expect(onRunValidation).not.toHaveBeenCalled();
  });

  it('does not reuse stale workspace gaps after the visible HEAD validates cleanly', async () => {
    navigationMocks.search = 'view=structure&branch=main';
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
    expect(screen.queryByText('Validated at HEAD')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run validation' })).not.toBeInTheDocument();
    const structureView = screen.getByRole('region', { name: 'Structured state tree' });
    expect(within(structureView).queryByText('Missing')).not.toBeInTheDocument();
  });

  it('keeps rendering committed state when operations are unavailable', async () => {
    navigationMocks.search = 'view=structure&branch=main';
    hookMocks.loadOperations.mockRejectedValueOnce(new Error('operations unavailable'));

    renderStateTab();

    expect(await screen.findByText('PRD audience handoff committed')).toBeInTheDocument();
    expect(screen.queryByText('YOps log unavailable.')).not.toBeInTheDocument();
    expect(screen.getAllByText('problem')).not.toHaveLength(0);
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

    expect(screen.queryByRole('heading', { name: 'State details' })).not.toBeInTheDocument();
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

    await screen.findByText('PRD audience handoff committed');
    hookMocks.loadCommits.mockResolvedValueOnce([
      { ...PRD_COMMIT, branch: 'feature/prd-audience' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: /Switch branches\/tags/ }));
    expect(screen.getByRole('dialog')).toHaveClass('h-[320px]', 'w-[276px]', 'rounded-[6px]');
    const branchMenu = screen.getByRole('menu', { name: 'Switch branches/tags' });
    expect(branchMenu).toHaveClass('min-h-0', 'flex-1');
    expect(
      within(branchMenu).getByRole('menuitemradio', { name: /feature\/prd-audience/ })
    ).toHaveClass('h-9');
    fireEvent.click(
      within(branchMenu).getByRole('menuitemradio', { name: /feature\/prd-audience/ })
    );

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
    fireEvent.click(screen.getByRole('button', { name: /Switch branches\/tags/ }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: 'Switch branches/tags' })).getByRole(
        'menuitemradio',
        { name: /feature\/prd-audience/ }
      )
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
    expect(screen.getByText('Loading state')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open commit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Parent diff' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/project/proj_test/history?branch=feature%2Fprd-audience&returnTo=%2Ft3x-dev%2Ftest-project%3Fbranch%3Dfeature%252Fprd-audience'
    );
  });
});
