// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceComposeReviewSurface } from '@/components/workspaces/WorkspaceComposeReviewSurface';
import {
  getProjectWorkspaceStarterCandidate,
  getWorkspacePreviewCandidates,
} from '@/data/workspaceCandidates';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';

const activityMocks = vi.hoisted(() => ({
  value: undefined as ReturnType<typeof useComposeActivity> | undefined,
}));
const bootstrapMocks = vi.hoisted(() => ({
  value: {
    active: false,
    busy: false,
    error: null as string | null,
    importSnapshot: undefined as unknown,
    start: vi.fn(),
    cancel: vi.fn(),
  },
}));
vi.mock('@/hooks/workspaces/useWorkspaceAuthoringBootstrap', () => ({
  useWorkspaceAuthoringBootstrap: () => bootstrapMocks.value,
}));
vi.mock('@/hooks/workspaces/useComposeActivity', () => ({
  useComposeActivity: () =>
    activityMocks.value ?? {
      enabled: false,
      loading: false,
      error: null,
      view: null,
      actions: [],
      cards: {},
      cursor: null,
      node: null,
      nodeLoading: false,
      nodeError: null,
      nodeCursor: null,
      notice: null,
      newActivity: null,
      compositionRevision: undefined,
      workspaceRevision: undefined,
      basis: undefined,
      refresh: vi.fn(),
      loadOlder: vi.fn(),
      loadLatest: vi.fn(),
      inspectNode: vi.fn(),
      selectActionNode: vi.fn(),
      loadOlderNode: vi.fn(),
      publish: vi.fn(),
      publishCandidate: vi.fn(),
      createAssistantConversation: vi.fn(),
    },
}));

const comparisonMocks = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock('@/hooks/workspaces/useWorkspaceYOps', () => ({
  validateWorkspaceCandidateYOps: comparisonMocks.validate,
}));

const snapshotMocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock('@/queries/workspaces', () => ({
  fetchWorkspaceTransitionReviewSnapshots: snapshotMocks.list,
  fetchWorkspaceTransitionReviewSnapshot: snapshotMocks.detail,
}));

const modelSelectionMocks = vi.hoisted(() => ({
  handleModelChange: vi.fn(),
}));
const sourceGenerationMocks = vi.hoisted(() => ({
  options: null as null | {
    workspaceAssistant?: {
      allowProposal?: boolean;
      onCandidate?: (transitionId: string, turnId: string) => void;
    };
  },
}));
vi.mock('@/hooks/shared/useChatModelSelection', () => ({
  useChatModelSelection: () => ({
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
    loading: false,
    isSelectionReady: true,
    handleModelChange: modelSelectionMocks.handleModelChange,
  }),
}));
vi.mock('@/hooks/sourceThreads/useSourceThreadGeneration', () => ({
  useSourceThreadGeneration: (options: {
    workspaceAssistant?: {
      allowProposal?: boolean;
      onCandidate?: (transitionId: string, turnId: string) => void;
    };
  }) => {
    sourceGenerationMocks.options = options;
    return {
      messages: [],
      streamingContent: '',
      error: null,
      warning: null,
      input: '',
      isLoading: false,
      isStreaming: false,
      citations: [],
      isThinking: false,
      searchQuery: null,
      thinkingContent: '',
      setInput: vi.fn(),
      sendMessage: vi.fn(),
      stopGenerating: vi.fn(),
    };
  },
}));

const navigationMocks = vi.hoisted(() => ({
  pathname: '/t3x-dev/test-project/workspaces',
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('@/components/generation/GenerationModelSelector', () => ({
  GenerationModelSelector: ({
    onModelChange,
    selectedModel,
  }: {
    onModelChange: (provider: string, model: string) => void;
    selectedModel: string;
  }) => (
    <button
      aria-label={`Select model: ${selectedModel}`}
      onClick={() => onModelChange('openai', 'gpt-5.4-mini')}
      type="button"
    >
      {selectedModel}
    </button>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push, replace: navigationMocks.replace }),
  useSearchParams: () => navigationMocks.searchParams,
}));

describe('WorkspaceComposeReviewSurface composer', () => {
  beforeEach(() => {
    snapshotMocks.list.mockReset().mockResolvedValue({ snapshots: [] });
    snapshotMocks.detail.mockReset();
    activityMocks.value = undefined;
    bootstrapMocks.value.active = false;
    bootstrapMocks.value.busy = false;
    bootstrapMocks.value.error = null;
    bootstrapMocks.value.importSnapshot = undefined;
    bootstrapMocks.value.start.mockReset();
    bootstrapMocks.value.cancel.mockReset();
    modelSelectionMocks.handleModelChange.mockReset();
    sourceGenerationMocks.options = null;
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    navigationMocks.searchParams = new URLSearchParams();
  });

  function renderAuthoringComposer() {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    // Ledger presence must not silently replace the established Compose interface.
    Object.assign(candidate, { authoringLedger: { actions: [] } });
    const action = {
      actionId: 'a1',
      sequence: 1,
      channel: 'manual' as const,
      actor: { id: 'Maya', kind: 'human' as const },
      publishedAt: '2026-09-21T11:53:00Z',
      beforeRevision: 0,
      afterRevision: 1,
      operations: [],
      reason: 'Refine release controls',
    };
    const cards = [
      { nodeId: 'allocation', path: 'rollout/allocation', before: 20, after: 25 },
      { nodeId: 'approval', path: 'rollout/approval', before: false, after: true },
    ];
    const publishCandidate = vi
      .fn()
      .mockRejectedValue(new Error('Candidate posture verification has not passed.'));
    activityMocks.value = {
      enabled: true,
      loading: false,
      error: null,
      actions: [action],
      cards: { a1: cards },
      cursor: null,
      node: null,
      nodeLoading: false,
      nodeError: null,
      nodeCursor: null,
      notice: null,
      newActivity: null,
      compositionRevision: 1,
      workspaceRevision: 1,
      basis: { refName: 'main', refHead: null, baseDigest: 'base' },
      refresh: vi.fn(),
      loadOlder: vi.fn(),
      loadLatest: vi.fn(),
      inspectNode: vi.fn(),
      selectActionNode: vi.fn(),
      loadOlderNode: vi.fn(),
      publish: vi.fn(),
      publishCandidate,
      createAssistantConversation: vi.fn(),
      view: {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 1,
        compositionRevision: 1,
        basis: { refName: 'main', refHead: null, baseDigest: 'base' },
        actions: [action],
        selected: { action, cards },
        netDiff: cards,
        node: null,
        nextBeforeSequence: null,
      },
    };
    const controller = {
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: '',
        isLoading: false,
        isStreaming: false,
        messages: [],
        send: vi.fn(),
        setInput: vi.fn(),
        stop: vi.fn(),
        warning: null,
      },
      error: null,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      model: {
        availabilityError: null,
        change: modelSelectionMocks.handleModelChange,
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4',
        selectedProvider: 'openai',
      },
      notice: null,
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
    } as unknown as WorkspaceComposeReviewController;
    const branchChange = vi.fn();
    render(
      <WorkspaceComposeReviewSurface
        branchOptions={['main', 'release']}
        candidate={candidate}
        controller={controller}
        mode="compose"
        onBranchChange={branchChange}
        onModeChange={vi.fn()}
      />
    );

    return { branchChange, publishCandidate };
  }

  it('keeps the original Compose surface and composer even when an authoring ledger exists', () => {
    const { branchChange } = renderAuthoringComposer();
    const addSource = screen.getByRole('button', { name: 'Add source' });
    expect(screen.getByRole('tab', { name: 'Compose' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Node history' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByRole('button', { name: 'Review complete draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    expect(sourceGenerationMocks.options?.workspaceAssistant?.allowProposal).toBe(true);
    expect(screen.queryByText('Generate a proposal from change requests')).not.toBeInTheDocument();
    expect(screen.queryByText('Proposal ready')).not.toBeInTheDocument();
    const modelSelector = screen.getByRole('button', { name: 'Select model: gpt-5.4' });
    const send = screen.getByRole('button', { name: 'Send message' });
    const composer = screen.getByRole('group', { name: 'Message composer' });
    expect(composer).toContainElement(
      screen.getByRole('textbox', { name: 'Workspace instruction' })
    );
    expect(composer).toContainElement(modelSelector);
    expect(composer).toContainElement(send);
    expect(screen.queryByRole('button', { name: 'Add attachment' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Workspace workflow tabs')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Workspace scenario' })).not.toBeInTheDocument();
    expect(addSource.querySelector('.lucide-file-up')).toBeInTheDocument();
    expect(addSource.querySelector('.lucide-database')).not.toBeInTheDocument();
    const branchSwitcher = screen.getByRole('button', { name: /Switch branches\/tags/ });
    expect(branchSwitcher).toHaveTextContent('main');
    fireEvent.click(branchSwitcher);
    fireEvent.click(
      within(screen.getByRole('menu', { name: 'Switch branches/tags' })).getByRole(
        'menuitemradio',
        { name: 'release' }
      )
    );
    expect(branchChange).toHaveBeenCalledWith('release');
    expect(modelSelector.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('switches immutable action scopes and opens discussion for the inspected node', () => {
    renderAuthoringComposer();
    const allChanges = screen.getByRole('tab', { name: 'All changes' });
    const latestAction = screen.getByRole('tab', { name: 'Latest' });
    expect(latestAction).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Sources' }).closest('section')).toContainElement(
      screen.getByRole('tablist', { name: 'Change scope' })
    );
    expect(
      screen.getByRole('button', { name: 'Add manually' }).compareDocumentPosition(latestAction) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('heading', { name: 'Proposed changes' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Approval' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discuss Approval' }));
    expect(screen.getByRole('tab', { name: 'Chat' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('heading', { name: 'Event evidence' })).not.toBeInTheDocument();
    fireEvent.click(allChanges);
    expect(allChanges).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Before event')).not.toBeInTheDocument();
    fireEvent.click(latestAction);
    expect(latestAction).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Action history is not available for this draft.')).toBeNull();
  });

  it('preserves failed proposal publication and exposes retry after reopening discussion', async () => {
    const { publishCandidate } = renderAuthoringComposer();
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close discussion' }));
    expect(screen.queryByRole('complementary', { name: 'Discuss change' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show discussion' }));
    expect(screen.getByRole('complementary', { name: 'Discuss change' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }));
    vi.stubGlobal('crypto', {
      ...globalThis.crypto,
      randomUUID: vi.fn(() => 'request-1'),
    });
    act(() =>
      sourceGenerationMocks.options?.workspaceAssistant?.onCandidate?.(
        'transition-candidate-1',
        'turn-1'
      )
    );
    await waitFor(() =>
      expect(screen.getByText('Proposal publication failed')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Retry publication' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Candidate posture verification has not passed.'
    );
    expect(publishCandidate).toHaveBeenCalled();
  });

  it('routes composer send and file input to the controller', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const send = vi.fn();
    const generateChanges = vi.fn().mockResolvedValue(true);
    const uploadFile = vi.fn().mockResolvedValue(true);
    const controller = {
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: 'Prepare the reviewed change.',
        isLoading: false,
        isStreaming: false,
        messages: [],
        send,
        setInput: vi.fn(),
        stop: vi.fn(),
        warning: null,
      },
      error: null,
      generateChanges,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      model: {
        availabilityError: null,
        change: vi.fn(),
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4-mini',
        selectedProvider: 'openai',
      },
      notice: null,
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
      uploadFile,
    } as unknown as WorkspaceComposeReviewController;
    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="compose"
        onModeChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(send).toHaveBeenCalledOnce();

    const enable = screen.getByRole('button', { name: 'Enable Draft activity' });
    expect(
      enable.compareDocumentPosition(screen.getByRole('button', { name: 'Add manually' })) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.click(enable);
    expect(bootstrapMocks.value.start).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Generate changes' }));
    expect(generateChanges).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText('Upload source material'), {
      target: { files: [new File(['exact source'], 'source.txt', { type: 'text/plain' })] },
    });
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'source.txt' }));
  });

  it('wires artifact, changed-node, and evidence controls to real review interactions', async () => {
    const starter = getProjectWorkspaceStarterCandidate('proj_1');
    const candidate = {
      ...starter,
      schemaBindings: getWorkspacePreviewCandidates('proj_1')[0]!.schemaBindings,
      yopsDraft: {
        ...starter.yopsDraft,
        operations: [
          {
            id: 'op_outcome',
            op: 'set',
            path: 'prd/summary/outcome',
            summary: 'Auditable rollout outcome',
            afterValue: 'Auditable rollout outcome',
          },
          {
            id: 'op_title',
            op: 'set',
            path: 'prd/requirements/canary/title',
            summary: 'Canary rollout',
            afterValue: 'Canary rollout',
            sourceRefs: ['material:brief'],
          },
        ],
      },
    };
    let resolveComparison!: (value: unknown) => void;
    comparisonMocks.validate.mockReturnValue(
      new Promise((resolve) => {
        resolveComparison = resolve;
      })
    );
    const prepareReview = vi.fn().mockResolvedValue(true);
    const decide = vi.fn().mockResolvedValue(null);
    const onModeChange = vi.fn();
    const controller = {
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: '',
        isLoading: false,
        isStreaming: false,
        messages: [],
        send: vi.fn(),
        setInput: vi.fn(),
        stop: vi.fn(),
        warning: null,
      },
      copyReceipt: vi.fn(),
      decide,
      decisionReason: '',
      error: null,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      model: {
        availabilityError: null,
        change: vi.fn(),
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4-mini',
        selectedProvider: 'openai',
      },
      notice: null,
      prepareReview,
      renderedYaml: '',
      review: {
        changeProjection: null,
        commands: null,
        content: null,
        deterministicValidation: null,
        precondition: null,
        reviewSnapshot: null,
        transitionId: null,
        view: {
          capabilities: {
            accept: { disposition: 'allowed' },
            override: { disposition: 'denied' },
            reject: { disposition: 'allowed' },
          },
          checks: {
            replay: undefined,
            validation: undefined,
          },
          history: { observation: 'pending' },
          mode: 'proposal',
        },
      },
      scenarios: { options: [], selectedId: candidate.id },
      setDecisionReason: vi.fn(),
      sourceBusy: false,
      viewCommit: vi.fn(),
    } as unknown as WorkspaceComposeReviewController;
    const { rerender } = render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="compose"
        onModeChange={onModeChange}
      />
    );

    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' })
    ).not.toBeInTheDocument();
    const inspectWithoutHistory = screen.getByRole('button', { name: 'Inspect Outcome' });
    expect(inspectWithoutHistory).toBeDisabled();
    fireEvent.click(inspectWithoutHistory);
    expect(prepareReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Review' }));
    expect(prepareReview).not.toHaveBeenCalled();
    expect(onModeChange).toHaveBeenCalledWith('review');

    rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );

    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    expect(screen.getByText('No rollout plan recorded.')).toBeInTheDocument();
    expect(
      screen.getByText('No rollback detail is present in the current draft.')
    ).toBeInTheDocument();
    expect(screen.queryByText('internal-preview')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Workspace navigation' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Review views' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Validation' })).not.toBeInTheDocument();
    expect(document.querySelector('.workspace-rendered-review-theme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit changes' })).toBeDisabled();
    controller.review.reviewSnapshot = {
      projectId: 'proj_1',
      workspaceId: candidate.id,
      snapshotId: 'rvs_ready',
    } as never;
    rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Commit changes' }));
    expect(navigationMocks.push).toHaveBeenCalledWith(
      `/project/proj_1/changes/${encodeURIComponent(candidate.id)}/rvs_ready`
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open checks' }));
    expect(screen.getByRole('region', { name: 'Workspace review checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project checks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Run history' })).toBeInTheDocument();
    await waitFor(() => expect(snapshotMocks.list).toHaveBeenCalledWith('proj_1', candidate.id));
    expect(screen.queryByText(/check-\d+/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review' }));
    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Structure diff' }));
    expect(document.querySelector('.workspace-rendered-review-theme')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Workspace review structure')).not.toBeInTheDocument();
    expect(screen.getByText('Loading the exact before and after values…')).toBeInTheDocument();
    expect(comparisonMocks.validate).toHaveBeenCalledWith(candidate);
    await act(async () =>
      resolveComparison({
        ok: true,
        applied: 2,
        baselineRelations: [],
        previewRelations: [],
        yops: [],
        baselineTrees: [
          {
            key: 'prd',
            slots: {},
            children: [
              { key: 'summary', slots: { outcome: 'Previous outcome' }, children: [] },
              {
                key: 'requirements',
                slots: {},
                children: [{ key: 'canary', slots: { title: 'Previous title' }, children: [] }],
              },
            ],
          },
        ],
        previewTrees: [
          {
            key: 'prd',
            slots: {},
            children: [
              { key: 'summary', slots: { outcome: 'Auditable rollout outcome' }, children: [] },
              {
                key: 'requirements',
                slots: {},
                children: [{ key: 'canary', slots: { title: 'Canary rollout' }, children: [] }],
              },
            ],
          },
        ],
      })
    );
    expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(screen.getByRole('table').querySelector('[data-diff-kind="added"]')).toBeNull();
    expect(
      screen
        .getByRole('table')
        .querySelectorAll('[data-diff-kind="modified"][data-diff-exact="true"]')
    ).toHaveLength(2);

    fireEvent.click(
      within(screen.getByRole('table')).getByTitle('prd/summary/outcome').closest('tr')!
    );
    const selectedChange = screen.getByRole('region', { name: 'Selected change' });
    expect(within(selectedChange).getByTitle('prd/summary/outcome')).toHaveTextContent(
      'prd.summary.outcome'
    );
    expect(within(selectedChange).getByText('Previous outcome')).toBeInTheDocument();
    expect(within(selectedChange).getByText('Auditable rollout outcome')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse prd', exact: true }));
    expect(within(screen.getByRole('table')).queryByTitle('prd/summary/outcome')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand prd', exact: true }));
    expect(within(screen.getByRole('table')).getByTitle('prd/summary/outcome')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rendered YAML' }));
    const code = screen.getByLabelText('YAML code view');
    fireEvent.click(
      within(code)
        .getAllByRole('button', {
          name: /Select code path prd\/requirements\/canary\/title, line/,
        })
        .at(-1)!
    );
    expect(
      within(screen.getByRole('region', { name: 'Selected change' })).getByTitle(
        'prd/requirements/canary/title'
      )
    ).toHaveTextContent('prd.requirements.canary.title');
  });

  it('treats a stale validation review pane as Render', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    navigationMocks.searchParams = new URLSearchParams(
      'workspaceMode=review&reviewPane=validation'
    );
    const controller = {
      busyAction: null,
      candidate,
      chat: {
        error: null,
        input: '',
        isLoading: false,
        isStreaming: false,
        messages: [],
        send: vi.fn(),
        setInput: vi.fn(),
        stop: vi.fn(),
        warning: null,
      },
      error: null,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      model: {
        availabilityError: null,
        change: vi.fn(),
        loading: false,
        ready: true,
        selectedModel: 'gpt-5.4-mini',
        selectedProvider: 'openai',
      },
      notice: null,
      prepareReview: vi.fn(),
      renderedYaml: '',
      review: {
        changeProjection: null,
        commands: null,
        content: null,
        deterministicValidation: null,
        precondition: null,
        reviewSnapshot: null,
        transitionId: null,
        view: null,
      },
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
    } as unknown as WorkspaceComposeReviewController;

    const onModeChange = vi.fn();
    const view = render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );

    expect(screen.queryByRole('button', { name: 'Validation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Render' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      '/t3x-dev/test-project/workspaces?workspaceMode=review',
      { scroll: false }
    );

    navigationMocks.searchParams = new URLSearchParams();
    view.rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );
    expect(onModeChange).toHaveBeenCalledWith('compose');
  });
});
