// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceWorkbench } from '@/components/workspaces/WorkspaceWorkbench';
import {
  getProjectWorkspaceStarterCandidate,
  getWorkspacePreviewCandidates,
} from '@/data/workspaceCandidates';
import type { WorkspaceCandidate, WorkspaceYOpsDraftOperation } from '@/types/workspaces';

const mocks = vi.hoisted(() => ({
  readAuthoring: vi.fn(),
  refreshWorkspaces: vi.fn(),
  saveDraft: vi.fn(),
  startNextIteration: vi.fn(),
  onSelectedWorkspaceChange: vi.fn(),
  onViewCommitInState: vi.fn(),
  sourceThreadGenerationOptions: vi.fn(),
  chatMessages: [] as Array<{
    content: string;
    id: string;
    rings?: Record<string, unknown>;
    role: 'assistant' | 'user';
  }>,
  validateComparison: vi.fn(),
}));
vi.mock('@/components/workspaces/WorkspaceSchemaPendingNotice', () => ({
  WorkspaceSchemaPendingNotice: ({ onPrepared }: { onPrepared: () => Promise<void> }) => (
    <button type="button" onClick={() => void onPrepared()}>
      Complete Schema preparation
    </button>
  ),
}));

vi.mock('@/infrastructure/sharedApiClient', () => ({
  getSharedApiClient: () => ({
    workspaces: { authoring: { read: mocks.readAuthoring } },
  }),
}));

vi.mock('@/hooks/workspaces/useWorkspaceYOps', () => ({
  validateWorkspaceCandidateYOps: mocks.validateComparison,
}));

vi.mock('@/hooks/workspaces/useWorkspaceAuthoringBootstrap', () => ({
  useWorkspaceAuthoringBootstrap: () => ({
    active: false,
    busy: false,
    error: null,
    importSnapshot: undefined,
    start: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/project/proj_1',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=workspaces'),
}));

vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({
    items: [{ available: true, id: 'product-brief', kind: 'module' }],
    loading: false,
  }),
}));

vi.mock('@/hooks/schemas/useProjectYSchemaVersions', () => ({
  useProjectYSchemaVersions: () => ({
    error: undefined,
    pending: false,
    refresh: vi.fn().mockResolvedValue([]),
    versions: [],
  }),
}));

vi.mock('@/hooks/workspaces/useWorkspaceFlow', () => ({
  useWorkspaceFlow: () => ({
    refreshWorkspaces: mocks.refreshWorkspaces,
    saveDraft: mocks.saveDraft,
    startNextIteration: mocks.startNextIteration,
  }),
}));

vi.mock('@/hooks/workspaces/useWorkspaceProposalGeneration', () => ({
  useWorkspaceProposalGeneration: () => ({
    generate: vi.fn(),
    verify: vi.fn(),
  }),
}));

vi.mock('@/hooks/workspaces/useWorkspaceConversations', () => ({
  useWorkspaceConversations: () => ({
    data: { conversations: [] },
    loading: false,
    error: null,
    refetch: vi.fn(),
    update: vi.fn(),
  }),
}));

vi.mock('@/hooks/shared/useChatModelSelection', () => ({
  useChatModelSelection: () => ({
    availabilityError: null,
    handleModelChange: vi.fn(),
    isSelectionReady: true,
    loading: false,
    selectedModel: 'gpt-5.4-mini',
    selectedProvider: 'openai',
  }),
}));

vi.mock('@/hooks/sourceThreads/useSourceThreadGeneration', () => ({
  useSourceThreadGeneration: (options: unknown) => {
    mocks.sourceThreadGenerationOptions(options);
    return {
      error: null,
      input: '',
      isLoading: false,
      isStreaming: false,
      messages: mocks.chatMessages,
      sendMessage: vi.fn(),
      setInput: vi.fn(),
      stopGenerating: vi.fn(),
      streamingContent: '',
      warning: null,
    };
  },
}));

vi.mock('@/hooks/materials/useMaterialUpload', () => ({
  useMaterialUpload: () => ({
    upload: vi.fn(),
    uploadUrl: vi.fn(),
    uploading: false,
  }),
}));

vi.mock('@/hooks/pins/usePinsCrud', () => ({
  usePinsCrud: () => ({
    add: vi.fn(),
    fetch: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn(),
  }),
}));

vi.mock('@/store/pinsStore', () => {
  const state = { pins: [] };
  const usePinsStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state }
  );
  return { usePinsStore };
});

vi.mock('@/components/generation/GenerationModelSelector', () => ({
  GenerationModelSelector: ({ selectedModel }: { selectedModel: string }) => (
    <button aria-label={`Select model: ${selectedModel}`} type="button">
      {selectedModel}
    </button>
  ),
}));

function operation(id: string, path: string, afterValue: string): WorkspaceYOpsDraftOperation {
  return {
    id,
    op: 'set',
    path,
    summary: afterValue,
    afterValue,
    sourceRefs: ['material:brief'],
  };
}

function workspace(
  id: string,
  title: string,
  operations: WorkspaceYOpsDraftOperation[] = []
): WorkspaceCandidate {
  const starter = getProjectWorkspaceStarterCandidate('proj_1');
  return {
    ...starter,
    schemaBindings: getWorkspacePreviewCandidates('proj_1')[0]!.schemaBindings,
    id,
    revision: 3,
    title,
    yopsDraft: {
      id: `draft:${id}`,
      operations,
    },
  };
}

function mockComparison(summary: Record<string, string>, title?: string) {
  mocks.validateComparison.mockResolvedValue({
    ok: true,
    applied: Object.keys(summary).length + (title ? 1 : 0),
    yops: [],
    baselineRelations: [],
    previewRelations: [],
    baselineTrees: [{ key: 'prd', slots: {}, children: [] }],
    previewTrees: [
      {
        key: 'prd',
        slots: {},
        children: [
          { key: 'summary', slots: summary, children: [] },
          ...(title
            ? [
                {
                  key: 'requirements',
                  slots: {},
                  children: [{ key: 'canary', slots: { title }, children: [] }],
                },
              ]
            : []),
        ],
      },
    ],
  });
}

describe('WorkspaceWorkbench Compose/Review integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.readAuthoring.mockRejectedValue(new Error('This draft has no authoring ledger.'));
    mocks.validateComparison.mockReset();
    mockComparison({});
    mocks.chatMessages.length = 0;
    mocks.refreshWorkspaces.mockResolvedValue([]);
    mocks.saveDraft.mockImplementation(async (candidate: WorkspaceCandidate, command?: string) => ({
      candidate_id: `candidate:${candidate.id}`,
      command,
      receipt: { request_id: `request:${command ?? 'draft.save'}` },
      workspace: { ...candidate, revision: (candidate.revision ?? 0) + 1 },
      yops_draft_id: candidate.yopsDraft.id,
    }));
  });

  it('hydrates the exact prepared Workspace revision instead of discarding the refresh result', async () => {
    const original = workspace('workspace_main', 'Main workspace');
    const remote = {
      ...original,
      revision: (original.revision ?? 0) + 1,
      title: 'Prepared workspace',
    };
    const onRefresh = vi.fn();
    mocks.refreshWorkspaces.mockResolvedValue([remote]);
    render(
      <WorkspaceWorkbench
        candidates={[original]}
        projectId="proj_1"
        onWorkspacesRefresh={onRefresh}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete Schema preparation' }));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Workspace detail' })).toHaveAccessibleDescription(
        remote.title
      )
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('exposes only the current Compose and Review workflow surfaces', () => {
    render(
      <WorkspaceWorkbench
        candidates={[workspace('workspace_main', 'Main workspace')]}
        projectId="proj_1"
      />
    );

    expect(screen.getByRole('tab', { name: 'Compose' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Review' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Proposal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Commit' })).not.toBeInTheDocument();
  });

  it('uses the externally selected workspace as the Compose context', () => {
    const main = workspace('workspace_main', 'Main workspace');
    const release = workspace('workspace_release', 'Release workspace');
    render(
      <WorkspaceWorkbench
        candidates={[main, release]}
        projectId="proj_1"
        selectedWorkspaceId={release.id}
      />
    );

    expect(screen.getByRole('region', { name: 'Workspace detail' })).toHaveAccessibleDescription(
      release.title
    );
    expect(
      within(screen.getByRole('region', { name: 'Workspace AI chat' })).getByTitle(release.title)
    ).toBeVisible();
  });

  it('waits for the user to enable Draft activity before preparing Chat', () => {
    render(
      <WorkspaceWorkbench
        candidates={[workspace('workspace_main', 'Main workspace')]}
        projectId="proj_1"
      />
    );

    expect(mocks.sourceThreadGenerationOptions).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Enable Draft activity/ })).toBeEnabled();
    expect(screen.queryByText('Preparing your draft…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate changes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Switch to discuss/ })).not.toBeInTheDocument();
  });

  it('renders structured changes in Compose and lets Review nodes select their evidence', async () => {
    mockComparison({ outcome: 'Auditable rollouts' }, 'Canary rollout');
    const candidate = workspace('workspace_main', 'Main workspace', [
      operation('op_outcome', 'prd/summary/outcome', 'Auditable rollouts'),
      operation('op_title', 'prd/requirements/canary/title', 'Canary rollout'),
    ]);
    render(<WorkspaceWorkbench candidates={[candidate]} projectId="proj_1" />);

    const outcome = screen.getByRole('button', { name: 'Inspect Outcome: prd/summary/outcome' });
    const title = screen.getByRole('button', {
      name: 'Inspect Title: prd/requirements/canary/title',
    });
    expect(within(outcome).getByText('Auditable rollouts')).toBeVisible();
    expect(within(title).getByText('Canary rollout')).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));

    expect(screen.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));

    expect(screen.getByText('Loading the exact before and after values…')).toBeInTheDocument();
    expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
    const secondNode = within(screen.getByRole('table'))
      .getByTitle('prd/requirements/canary/title')
      .closest('tr')!;
    fireEvent.click(secondNode);
    expect(secondNode).toHaveAttribute('aria-selected', 'true');
    expect(
      within(screen.getByRole('region', { name: 'Selected change' })).getByTitle(
        'prd/requirements/canary/title'
      )
    ).toHaveTextContent('prd.requirements.canary.title');
    expect(screen.getAllByText('material:brief').length).toBeGreaterThan(0);
  });

  it('updates the Compose context when the navigation owner selects another workspace', () => {
    const baseline = workspace('workspace_main', 'Main workspace', [
      operation('op_outcome', 'prd/summary/outcome', 'Baseline'),
    ]);
    const scenario = {
      ...workspace('workspace_scenario', 'Risk scenario', [
        operation('op_outcome_scenario', 'prd/summary/outcome', 'Reduced risk'),
      ]),
      scenario: {
        id: 'workspace_scenario',
        name: 'Risk scenario',
        createdAt: '2026-08-26T00:00:00.000Z',
        sourceWorkspaceId: baseline.id,
      },
    };
    const { rerender } = render(
      <WorkspaceWorkbench
        candidates={[baseline, scenario]}
        onSelectedWorkspaceChange={mocks.onSelectedWorkspaceChange}
        projectId="proj_1"
        selectedWorkspaceId={baseline.id}
      />
    );

    expect(screen.getByRole('region', { name: 'Workspace detail' })).toHaveAccessibleDescription(
      baseline.title
    );
    expect(screen.getByText('Baseline')).toBeVisible();
    expect(screen.queryByText('Reduced risk')).not.toBeInTheDocument();
    rerender(
      <WorkspaceWorkbench
        candidates={[baseline, scenario]}
        onSelectedWorkspaceChange={mocks.onSelectedWorkspaceChange}
        projectId="proj_1"
        selectedWorkspaceId={scenario.id}
      />
    );
    expect(screen.getByRole('region', { name: 'Workspace detail' })).toHaveAccessibleDescription(
      scenario.title
    );
    expect(screen.getByText('Reduced risk')).toBeVisible();
    expect(screen.queryByText('Baseline')).not.toBeInTheDocument();
    expect(mocks.onSelectedWorkspaceChange).not.toHaveBeenCalled();
  });

  it('renders the selected workspace changes in Review without the retired compare control', async () => {
    mockComparison({ outcome: 'Baseline', audience: 'Platform engineers' });
    const baseline = workspace('workspace_main', 'Main workspace', [
      operation('op_outcome', 'prd/summary/outcome', 'Baseline'),
      operation('op_audience', 'prd/summary/audience', 'Platform engineers'),
    ]);
    const scenario = {
      ...workspace('workspace_scenario', 'Risk scenario', [
        operation('op_outcome_scenario', 'prd/summary/outcome', 'Reduced risk'),
        operation('op_extra', 'prd/requirements/canary/title', 'Canary rollout'),
      ]),
      scenario: {
        id: 'workspace_scenario',
        name: 'Risk scenario',
        createdAt: '2026-08-26T00:00:00.000Z',
        sourceWorkspaceId: baseline.id,
      },
    };
    render(
      <WorkspaceWorkbench
        candidates={[baseline, scenario]}
        projectId="proj_1"
        selectedWorkspaceId={baseline.id}
      />
    );

    expect(screen.getByRole('region', { name: 'Workspace detail' })).toHaveAccessibleDescription(
      baseline.title
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));

    expect(screen.queryByRole('combobox', { name: 'Compare scenario' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByTitle('prd/summary/outcome')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByTitle('prd/summary/audience')
    ).toBeInTheDocument();
  });

  it('restores View in State for an already committed Workspace', () => {
    const committed = {
      ...workspace('workspace_main', 'Committed workspace'),
      lastCommitHash: 'sha256:committed-workspace',
      status: 'committed' as const,
      targetBranch: 'feature/canary',
    };
    render(
      <WorkspaceWorkbench
        candidates={[committed]}
        onViewCommitInState={mocks.onViewCommitInState}
        projectId="proj_1"
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'View in State' }));

    expect(mocks.onViewCommitInState).toHaveBeenCalledWith(
      'sha256:committed-workspace',
      'feature/canary'
    );
  });

  it('fails honestly when preparation produces no deterministic operations', async () => {
    render(
      <WorkspaceWorkbench
        candidates={[workspace('workspace_main', 'Main workspace')]}
        projectId="proj_1"
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prepare review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No structured changes yet');
    expect(screen.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-current', 'page');
    expect(
      screen.queryByRole('button', { name: /Commit changes|Approve and commit/i })
    ).not.toBeInTheDocument();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('renders loading, error, and no-candidate states explicitly', () => {
    const { rerender } = render(
      <WorkspaceWorkbench candidates={[]} projectId="proj_1" viewState="loading" />
    );
    expect(screen.getByText('Loading workspaces')).toBeInTheDocument();

    rerender(
      <WorkspaceWorkbench
        candidates={[]}
        errorMessage="Workspace API unavailable"
        projectId="proj_1"
        viewState="error"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace API unavailable');

    rerender(<WorkspaceWorkbench candidates={[]} projectId="proj_1" />);
    expect(screen.getByText('No workspaces yet.')).toBeInTheDocument();
  });
});
