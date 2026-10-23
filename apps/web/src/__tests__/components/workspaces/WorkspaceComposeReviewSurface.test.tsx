// @vitest-environment jsdom

import '@testing-library/jest-dom';
import type { AssistantSchemaSettingsView } from '@t3x-dev/api-client';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommitChangeInspection } from '@/components/workspaces/WorkspaceCommitChangeDetails';
import { WorkspaceComposeReviewSurface } from '@/components/workspaces/WorkspaceComposeReviewSurface';
import {
  getProjectWorkspaceStarterCandidate,
  getWorkspacePreviewCandidates,
} from '@/data/workspaceCandidates';
import type { useComposeActivity } from '@/hooks/workspaces/useComposeActivity';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import type { ApiCommit } from '@/types/api';

vi.mock('@/components/workspaces/WorkspaceCommitGraph', () => ({
  WorkspaceCommitGraph: ({
    projectId,
    branch,
    onSelectCommit,
  }: {
    projectId: string;
    branch: string;
    onSelectCommit?: (commit: ApiCommit) => void;
  }) => (
    <section aria-label="Commit graph">
      Graph for {projectId} · {branch}
      <button
        type="button"
        onClick={() =>
          onSelectCommit?.({
            project_id: projectId,
            hash: 'sha256:historical',
            message: 'Earlier submission',
          } as ApiCommit)
        }
      >
        Open earlier Commit
      </button>
    </section>
  ),
}));
vi.mock('@/components/workspaces/WorkspaceCommitHistoryPanel', () => ({
  WorkspaceCommitHistoryPanel: ({
    onReturn,
    onInspect,
    commit,
  }: {
    onReturn: () => void;
    onInspect: (inspection: CommitChangeInspection) => void;
    commit: ApiCommit;
  }) => (
    <section aria-label="Committed changes">
      <h2>Earlier submission · Read-only</h2>
      <button
        type="button"
        onClick={() =>
          onInspect({
            id: 'earlier-owner',
            commitDigest: commit.hash,
            kind: 'content',
            card: { nodeId: 'owner', path: 'owner', before: 'before', after: 'archived' },
            current: 'Archived owner',
            reason: 'Historical owner change',
            timestamp: '',
          })
        }
      >
        Inspect committed owner
      </button>
      <button type="button" onClick={onReturn}>
        Return to current Draft
      </button>
    </section>
  ),
}));

const activityMocks = vi.hoisted(() => ({
  value: undefined as ReturnType<typeof useComposeActivity> | undefined,
}));
const schemaCardMocks = vi.hoisted(() => ({
  record: null as AssistantSchemaSettingsView | null,
  error: undefined,
  generating: false,
  generate: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@/hooks/schemas/useAssistantSchemaSettings', () => ({
  useAssistantSchemaSettings: () => schemaCardMocks,
}));
vi.mock('@/hooks/schemas/useWorkspaceDraftSchema', () => ({
  useWorkspaceDraftSchema: () => ({ definition: undefined, loading: false }),
}));
vi.mock('@/hooks/schemas/useWorkspaceSchemaPending', () => ({
  useWorkspaceSchemaPending: () => ({ data: { status: 'none', pending: null }, loading: false }),
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
vi.mock('@/hooks/schemas/useProjectYSchemaVersions', () => ({
  useProjectYSchemaVersions: () => ({
    error: undefined,
    pending: false,
    refresh: vi.fn(),
    versions: [],
  }),
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
const schemaDiscussion = vi.fn();
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
    schemaCardMocks.record = null;
    localStorage.removeItem('t3x-workspace-draft-width');
    localStorage.removeItem('t3x-workspace-draft-collapsed');
    localStorage.removeItem('t3x-workspace-discussion-width');
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
    schemaDiscussion.mockReset();
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    navigationMocks.searchParams = new URLSearchParams();
  });

  function renderResizableCompose() {
    return {
      ...renderCompose(),
      splitter: screen.getByRole('separator', { name: 'Resize current Draft panel' }),
    };
  }

  it('puts the read-only commit graph below the current Draft and scopes it to the workspace', () => {
    renderCompose();
    const sidebar = screen.getByRole('complementary', { name: 'Current Draft navigation' });
    const draft = within(sidebar).getByRole('region', { name: 'Current Draft' });
    const graph = within(sidebar).getByRole('region', { name: 'Commit graph' });
    expect(graph).toHaveTextContent('Graph for proj_1 · main');
    expect(draft.nextElementSibling).toBe(graph);
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Collapse current Draft panel' }));
    expect(screen.queryByRole('region', { name: 'Commit graph' })).not.toBeInTheDocument();
  });

  function renderCompose() {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    return render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={
          {
            candidate,
            isBusy: false,
            materialSources: [],
            prefillAssistant: schemaDiscussion,
          } as unknown as WorkspaceComposeReviewController
        }
        mode="compose"
        onModeChange={vi.fn()}
      />
    );
  }

  it('replaces only the center with historical cards and restores the same live Draft on Return', () => {
    schemaCardMocks.record = {
      settingsId: 'pending-owner',
      revision: 1,
      status: 'pending',
      conversationId: 'chat',
      workspaceRevision: 2,
      schemaHash: 'exact',
      createdAt: '2026-10-22T10:00:00Z',
      settings: {
        action: 'add_node',
        nodePath: 'product',
        name: 'owner',
        definition: {},
        intent: 'Add owner',
      },
    };
    renderCompose();
    const confirmation = screen.getByRole('button', { name: 'Confirm' });
    const toolbar = screen.getByRole('button', { name: 'New change' });
    fireEvent.click(screen.getByRole('button', { name: 'Open earlier Commit' }));
    expect(screen.getByRole('region', { name: 'Committed changes' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect committed owner' }));
    const details = within(screen.getByRole('complementary', { name: 'Discuss change' }));
    expect(details.getByRole('heading', { name: 'Details' })).toBeVisible();
    expect(details.getByText('Value at this Commit')).toBeVisible();
    expect(details.getByText('Archived owner')).toBeVisible();
    expect(details.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(confirmation).not.toBeVisible();
    expect(toolbar).not.toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New change' })).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Committed changes' })).getByRole('button', {
        name: 'Return to current Draft',
      })
    );
    expect(screen.queryByRole('region', { name: 'Committed changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBe(confirmation);
    expect(confirmation).toBeVisible();
    expect(schemaCardMocks.generate).not.toHaveBeenCalled();
    expect(navigationMocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open earlier Commit' }));
    expect(screen.queryByText('Archived owner')).not.toBeInTheDocument();
  });

  it('places pending Schema confirmations on the timeline, never in the discussion composer', () => {
    schemaCardMocks.record = {
      settingsId: 'owner-card',
      revision: 1,
      status: 'pending',
      conversationId: 'chat',
      workspaceRevision: 2,
      schemaHash: 'exact',
      createdAt: '2026-10-22T10:00:00Z',
      settings: {
        action: 'add_node',
        nodePath: 'product',
        name: 'owner',
        definition: {},
        intent: 'Add owner',
      },
    };
    renderCompose();
    expect(
      within(screen.getByRole('region', { name: 'Event: Schema structure change' })).getByRole(
        'heading',
        { name: 'Add Node · owner' }
      )
    ).toBeVisible();
    expect(
      within(screen.getByRole('complementary', { name: 'Discuss change' })).queryByRole('region', {
        name: 'Schema change candidate',
      })
    ).not.toBeInTheDocument();
  });

  it('opens Schema changes in the shared Details panel without looking up a content node', () => {
    schemaCardMocks.record = {
      settingsId: 'advantage-card',
      revision: 1,
      status: 'applied',
      conversationId: 'chat',
      workspaceRevision: 2,
      schemaHash: 'base-schema',
      currentDefinition: { type: 'string', maxLength: 24 },
      settings: {
        action: 'edit_slot',
        nodePath: 'requirements',
        name: 'advantage',
        definition: { type: 'string', maxLength: 80 },
        required: false,
        intent: 'Allow a longer advantage description',
      },
      snapshot: {
        compositionId: 'snapshot',
        compositionRevision: 2,
        compositionHash: 'composition',
        schemaHash: 'result-schema',
      },
    };
    renderCompose();
    const inspect = screen.getByRole('button', {
      name: 'Inspect Schema change: requirements/advantage',
    });
    fireEvent.click(inspect);
    const discussion = screen.getByRole('complementary', { name: 'Discuss change' });
    expect(within(discussion).getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
    const details = within(discussion).getByRole('region', {
      name: 'Selected Schema change details',
    });
    expect(within(details).getByRole('heading', { name: 'Advantage', exact: true })).toBeVisible();
    expect(within(details).getByText('requirements/advantage')).toBeVisible();
    const length = within(details).getByRole('region', { name: 'Field change: maxLength' });
    expect(within(length).getByText('24')).toBeVisible();
    expect(within(length).getByText('80')).toBeVisible();
    expect(within(details).getByText('Allow a longer advantage description')).toBeVisible();
    expect(within(details).getByText('result-schema')).toBeVisible();
    expect(
      within(details).queryByRole('button', { name: 'Edit', exact: true })
    ).not.toBeInTheDocument();
    expect(inspect).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(details).getByRole('button', { name: 'Ask AI' }));
    expect(schemaDiscussion).toHaveBeenCalledWith('修改 Schema 结构 requirements/advantage：');
    expect(inspect).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(discussion).queryByRole('region', { name: 'Selected Schema change details' })
    ).not.toBeInTheDocument();
  });

  it('resizes the Draft rail with keyboard controls, resets it, and restores its saved width', () => {
    const { splitter, unmount } = renderResizableCompose();
    expect(splitter).toHaveAttribute('aria-valuenow', '260');
    fireEvent.keyDown(splitter, { key: 'ArrowRight' });
    expect(splitter).toHaveAttribute('aria-valuenow', '280');
    expect(localStorage.getItem('t3x-workspace-draft-width')).toBe('280');
    expect(splitter.parentElement?.style.getPropertyValue('--draft-width')).toBe('280px');
    fireEvent.keyDown(splitter, { key: 'End' });
    expect(splitter).toHaveAttribute('aria-valuenow', '560');
    fireEvent.keyDown(splitter, { key: 'Home' });
    expect(splitter).toHaveAttribute('aria-valuenow', '180');
    fireEvent.doubleClick(splitter);
    expect(splitter).toHaveAttribute('aria-valuenow', '260');
    fireEvent.keyDown(splitter, { key: 'ArrowLeft' });
    unmount();
    expect(renderResizableCompose().splitter).toHaveAttribute('aria-valuenow', '240');
  });

  it('collapses the Draft rail to a narrow strip and remembers the choice', () => {
    const { splitter, unmount } = renderResizableCompose();
    const board = splitter.parentElement!;
    fireEvent.click(screen.getByRole('button', { name: 'Collapse current Draft panel' }));
    expect(board).toHaveAttribute('data-draft-collapsed', 'true');
    expect(screen.queryByRole('region', { name: 'Current Draft' })).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize current Draft panel' })).toBeNull();
    expect(localStorage.getItem('t3x-workspace-draft-collapsed')).toBe('true');
    unmount();
    renderCompose();
    expect(screen.queryByRole('region', { name: 'Current Draft' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand current Draft panel' }));
    expect(screen.getByRole('region', { name: 'Current Draft' })).toBeVisible();
    expect(screen.getByRole('separator', { name: 'Resize current Draft panel' })).toBeVisible();
    expect(localStorage.getItem('t3x-workspace-draft-collapsed')).toBe('false');
  });

  it('drags the Draft divider and stops resizing on release or cancellation', () => {
    const originalPointerEvent = window.PointerEvent;
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    try {
      const { splitter } = renderResizableCompose();
      Object.assign(splitter, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: vi.fn(),
      });
      fireEvent.pointerDown(splitter, { button: 0, clientX: 300 });
      expect(splitter.parentElement).toHaveAttribute('data-resizing', 'true');
      fireEvent.pointerMove(splitter, { clientX: 380 });
      expect(splitter).toHaveAttribute('aria-valuenow', '340');
      fireEvent.pointerUp(splitter, { clientX: 380 });
      expect(splitter.parentElement).not.toHaveAttribute('data-resizing');
      fireEvent.pointerMove(splitter, { clientX: 450 });
      expect(splitter).toHaveAttribute('aria-valuenow', '340');
      fireEvent.pointerDown(splitter, { button: 0, clientX: 380 });
      fireEvent.pointerCancel(splitter);
      fireEvent.pointerMove(splitter, { clientX: 450 });
      expect(splitter).toHaveAttribute('aria-valuenow', '340');
      expect(splitter.parentElement).not.toHaveAttribute('data-resizing');
    } finally {
      window.PointerEvent = originalPointerEvent;
    }
  });

  it('limits Draft width so changes and Chat retain room, and ignores invalid saved preferences', () => {
    localStorage.setItem('t3x-workspace-draft-width', 'not-a-width');
    const { splitter } = renderResizableCompose();
    expect(splitter).toHaveAttribute('aria-valuenow', '260');
    Object.defineProperty(splitter.parentElement, 'clientWidth', {
      value: 1000,
      configurable: true,
    });
    fireEvent.keyDown(splitter, { key: 'End' });
    expect(splitter).toHaveAttribute('aria-valuenow', '240');
    expect(screen.getByRole('separator', { name: 'Resize discussion panel' })).toHaveAttribute(
      'aria-valuenow',
      '440'
    );
    expect(screen.getByRole('complementary', { name: 'Discuss change' })).toBeVisible();
  });

  it('selects list rows directly and keeps Details or Chat permanently visible', async () => {
    schemaCardMocks.record = {
      settingsId: 'schema-row',
      revision: 1,
      status: 'applied',
      conversationId: 'chat',
      workspaceRevision: 2,
      schemaHash: 'exact',
      settings: {
        action: 'add_slot',
        nodePath: 'requirements',
        name: 'advantage',
        definition: { type: 'string' },
        intent: 'Add advantage',
      },
    };
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
    const uploadFile = vi.fn().mockResolvedValue(true);
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
      uploadFile,
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

    expect(screen.getByRole('tab', { name: 'Compose' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Change context' })).not.toBeInTheDocument();
    const discussion = screen.getByRole('complementary', { name: 'Discuss change' });
    const draftNavigation = screen.getByRole('complementary', { name: 'Current Draft navigation' });
    expect(draftNavigation).toContainElement(screen.getByRole('region', { name: 'Current Draft' }));
    expect(
      within(discussion).queryByRole('region', { name: 'Current Draft' })
    ).not.toBeInTheDocument();
    const changes = screen.getByRole('main');
    expect(
      draftNavigation.compareDocumentPosition(changes) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      changes.compareDocumentPosition(discussion) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(discussion).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
    expect(within(discussion).getByTitle(candidate.title)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByRole('button', { name: 'Review complete draft' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chat', exact: true }));
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
    const sources = screen.getByRole('button', { name: 'Workspace sources (0 included)' });
    expect(composer).toContainElement(sources);
    expect(sources.compareDocumentPosition(modelSelector) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    fireEvent.change(screen.getByLabelText('Upload source material'), {
      target: { files: [new File(['exact source'], 'source.txt', { type: 'text/plain' })] },
    });
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'source.txt' }));
    const allChanges = screen.getByRole('tab', { name: 'All changes' });
    const latestAction = screen.getByRole('tab', { name: 'Latest' });
    expect(latestAction).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('heading', { name: 'Proposed changes' }).closest('section')
    ).toContainElement(screen.getByRole('tablist', { name: 'Change scope' }));
    expect(
      latestAction.compareDocumentPosition(screen.getByRole('button', { name: 'New change' })) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('heading', { name: 'Proposed changes' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Expand Approval' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Approval' })).not.toBeInTheDocument();
    const inspectSchema = screen.getByRole('button', {
      name: 'Inspect Schema change: requirements/advantage',
    });
    fireEvent.click(inspectSchema);
    for (const row of screen.getAllByRole('button', { name: /^Inspect (?!Schema change:)/ })) {
      expect(row).toHaveAttribute('aria-pressed', 'false');
    }
    expect(
      within(discussion).getByRole('region', { name: 'Selected Schema change details' })
    ).toBeVisible();
    expect(activityMocks.value.inspectNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Approval: rollout/approval' }));
    expect(inspectSchema).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(discussion).queryByRole('region', { name: 'Selected Schema change details' })
    ).not.toBeInTheDocument();
    expect(within(discussion).getByRole('heading', { name: 'Details' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Inspect Approval: rollout/approval' })
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(discussion).getByRole('button', { name: 'Ask AI' }));
    expect(screen.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByRole('heading', { name: 'Event evidence' })).not.toBeInTheDocument();
    fireEvent.click(allChanges);
    expect(allChanges).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Approval: rollout/approval' }));
    expect(within(discussion).getByRole('heading', { name: 'Details' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    fireEvent.click(within(discussion).getByRole('button', { name: 'Ask AI' }));
    expect(within(discussion).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Chat', exact: true }));
    expect(within(discussion).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
    expect(screen.queryByText('Before event')).not.toBeInTheDocument();
    fireEvent.click(latestAction);
    expect(latestAction).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Action history is not available for this draft.')).toBeNull();

    expect(screen.queryByRole('button', { name: 'Add attachment' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Workspace workflow tabs')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Workspace scenario' })).not.toBeInTheDocument();
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

    expect(screen.queryByRole('button', { name: 'Close discussion' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show discussion' })).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Discuss change' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Chat', exact: true }));
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
  });

  it('stages manual cards locally and saves the selected subset as one P', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
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
    };
    const cards = [{ nodeId: 'allocation', path: 'rollout/allocation', before: 20, after: 25 }];
    const publish = vi.fn().mockResolvedValue({ kind: 'published' });
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
      publish,
      publishCandidate: vi.fn(),
      createAssistantConversation: vi.fn(),
      view: {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 1,
        compositionRevision: 1,
        basis: { refName: 'main', refHead: null, baseDigest: 'base' },
        actions: [action],
        selected: { action, cards },
        current: { rollout: { allocation: 25, channel: 'stable' } },
        netDiff: cards,
        node: null,
        nextBeforeSequence: null,
      },
    };
    render(
      <WorkspaceComposeReviewSurface
        branchOptions={['main']}
        candidate={candidate}
        controller={
          {
            busyAction: null,
            candidate,
            error: null,
            hasCollaborationConflict: false,
            isBusy: false,
            materialSources: [],
            notice: null,
          } as unknown as WorkspaceComposeReviewController
        }
        mode="compose"
        onModeChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Allocation: rollout/allocation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
    fireEvent.change(screen.getByLabelText('New value'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Adjust pilot allocation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    expect(publish).not.toHaveBeenCalled();
    expect(screen.getByText('Ungrouped manual changes')).toBeInTheDocument();
    const draftSidebar = screen.getByRole('region', { name: 'Current Draft' });
    expect(within(draftSidebar).getByText('30')).toBeVisible();
    expect(within(draftSidebar).getByText(/ungrouped local changes/)).toBeVisible();
    expect(
      screen.getByRole('checkbox', { name: 'Include Allocation in the next P' })
    ).toBeChecked();

    fireEvent.keyDown(screen.getByRole('button', { name: 'New change' }), { key: 'Enter' });
    expect(screen.queryByRole('menuitem', { name: 'Add manually' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit a field' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit structure' }));
    const dialog = await screen.findByRole('dialog', { name: 'Current structure' });
    expect(within(dialog).getByText('allocation')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add inside rollout' }));
    fireEvent.change(within(dialog).getByLabelText('New name'), {
      target: { value: 'regions' },
    });
    fireEvent.change(within(dialog).getByLabelText('What to add'), {
      target: { value: 'field' },
    });
    fireEvent.change(within(dialog).getByLabelText('New value'), {
      target: { value: 'us' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(within(dialog).getByText('regions')).toBeInTheDocument());
    expect(publish).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]!);
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Include Regions in the next P' })).toBeChecked()
    );

    const inspectNode = activityMocks.value.inspectNode;
    vi.mocked(inspectNode).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Regions: rollout/regions' }));
    expect(screen.getByText('Unsaved change · not yet applied to Draft')).toBeVisible();
    expect(screen.getByLabelText('Selected field details')).toHaveTextContent('us');
    expect(inspectNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Chat', exact: true }));
    expect(sourceGenerationMocks.options?.workspaceAssistant?.allowProposal).toBe(false);
    expect(
      screen.getByText(
        'Save every ungrouped manual change as a P before asking the assistant to add changes.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Regions in the next P' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save selected as P (1)' }));
    await waitFor(() =>
      expect(publish).toHaveBeenCalledWith(
        expect.objectContaining({
          operations: [{ set: { path: 'rollout/allocation', value: 30 } }],
        })
      )
    );
    expect(
      screen.getByRole('checkbox', { name: 'Include Regions in the next P' })
    ).not.toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: 'Include Allocation in the next P' })
    ).not.toBeInTheDocument();
  });

  it('stages object slot edits as one object row and publishes the selected field operations as P', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    Object.assign(candidate, { authoringLedger: { actions: [] } });
    const path = 'tasks/[key=flight]';
    const before = { key: 'flight', slots: { goal: '开飞机的任务', done: false }, children: [] };
    const current = { ...before, slots: { ...before.slots, done: true } };
    const action = {
      actionId: 'a1',
      sequence: 1,
      channel: 'manual',
      actor: { id: 'Maya', kind: 'human' },
      publishedAt: '2026-09-21T11:53:00Z',
      beforeRevision: 0,
      afterRevision: 1,
      operations: [],
      reason: 'Prepare flight',
    };
    const cards = [{ nodeId: 'task-id', path, before, after: current }];
    const publish = vi.fn().mockResolvedValue({ kind: 'published' });
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
      publish,
      publishCandidate: vi.fn(),
      createAssistantConversation: vi.fn(),
      view: {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 1,
        compositionRevision: 1,
        basis: { refName: 'main', refHead: null, baseDigest: 'base' },
        actions: [action],
        selected: { action, cards },
        base: { tasks: [before] },
        current: { tasks: [current] },
        netDiff: cards,
        node: null,
        nextBeforeSequence: null,
      },
    } as unknown as ReturnType<typeof useComposeActivity>;
    render(
      <WorkspaceComposeReviewSurface
        branchOptions={['main']}
        candidate={candidate}
        controller={
          {
            busyAction: null,
            candidate,
            error: null,
            hasCollaborationConflict: false,
            isBusy: false,
            materialSources: [],
            notice: null,
          } as unknown as WorkspaceComposeReviewController
        }
        mode="compose"
        onModeChange={vi.fn()}
      />
    );
    const publishedEvent = screen.getByLabelText('Event: Prepare flight');
    fireEvent.click(
      within(publishedEvent).getByRole('button', { name: `Inspect Flight: ${path}` })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
    fireEvent.change(screen.getByLabelText('goal'), { target: { value: '学习飞行' } });
    fireEvent.change(screen.getByLabelText('done'), { target: { value: 'false' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Start with training' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
    const ungrouped = await screen.findByLabelText('Event: Ungrouped manual changes');
    expect(
      within(ungrouped).getAllByRole('button', { name: `Inspect Flight: ${path}` })
    ).toHaveLength(1);
    expect(within(ungrouped).getAllByRole('checkbox')).toHaveLength(2);
    expect(publish).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
    expect(screen.getByRole('textbox', { name: 'goal', exact: true })).toHaveValue('学习飞行');
    expect(screen.getByRole('combobox', { name: 'done', exact: true })).toHaveValue('false');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // Saving the unchecked goal later must remain possible without widening the done operation.
    fireEvent.click(
      within(ungrouped).getByRole('checkbox', { name: 'Include goal in the next P' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save selected as P (1)' }));
    await waitFor(() =>
      expect(publish).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          operations: [{ set: { path: `${path}/slots/done`, value: false } }],
          reason: 'Start with training',
        })
      )
    );
    expect(
      within(screen.getByLabelText('Event: Ungrouped manual changes')).getByRole('checkbox')
    ).not.toBeChecked();
    expect(activityMocks.value.inspectNode).not.toHaveBeenCalled();
  });

  it('waits in Chat until the user enables Draft activity', () => {
    bootstrapMocks.value.start.mockClear();
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const controller = {
      busyAction: null,
      candidate,
      error: null,
      hasCollaborationConflict: false,
      isBusy: false,
      materialSources: [],
      notice: null,
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
    } as unknown as WorkspaceComposeReviewController;
    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="compose"
        onModeChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate changes/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Upload source material')).toBeInTheDocument();
    expect(screen.getByText('Add source')).toBeInTheDocument();
    expect(bootstrapMocks.value.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Enable Draft activity/ }));
    expect(bootstrapMocks.value.start).toHaveBeenCalledOnce();
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
    const inspectWithoutHistory = screen.getByRole('button', { name: /^Inspect Outcome:/ });
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
    expect(document.querySelector('.workspace-rendered-review-theme')).not.toBeInTheDocument();
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
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Field',
      'Before',
      'After',
    ]);
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

  it.each([
    false,
    true,
  ])('reviews the complete Base-to-Draft instead of only the selected event (update=%s)', async (update) => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    Object.assign(candidate, { authoringLedger: { actions: [] } });
    navigationMocks.searchParams = new URLSearchParams('workspaceMode=review&reviewPane=changes');
    const current = {
      domain: 't3x.dev/semantic-content',
      version: 1,
      content: {
        relations: [],
        trees: [
          {
            key: 'prd',
            slots: {},
            children: [
              {
                key: 'temperature',
                children: [],
                slots: { title: '气温', acceptance: ['低于20度'] },
              },
            ],
          },
        ],
      },
    };
    const before = update ? JSON.parse(JSON.stringify(current)) : {};
    if (update) before.content.trees[0].children[0].slots.acceptance = ['低于30度'];
    activityMocks.value = {
      enabled: true,
      loading: false,
      error: null,
      actions: [],
      cards: {},
      view: {
        base: {},
        current,
        workspaceRevision: 7,
        compositionRevision: 4,
        selected: {
          before,
          after: current,
          cards: [
            {
              nodeId: 'temperature-content',
              path: 'content/trees/[key=prd]/children/[key=temperature]/slots/acceptance',
              before: update ? ['低于30度'] : undefined,
              after: ['低于20度'],
            },
          ],
        },
        netDiff: [
          {
            nodeId: 'temperature-title',
            path: 'content/trees/[key=prd]/children/[key=temperature]/slots/title',
            after: '气温',
          },
          {
            nodeId: 'temperature-content',
            path: 'content/trees/[key=prd]/children/[key=temperature]/slots/acceptance',
            after: ['低于20度'],
          },
        ],
      },
    } as unknown as ReturnType<typeof useComposeActivity>;
    const prepareReview = vi.fn();
    const controller = {
      candidate,
      busyAction: null,
      isBusy: false,
      error: null,
      notice: null,
      hasCollaborationConflict: false,
      materialSources: [],
      sourceBusy: false,
      scenarios: { options: [], selectedId: candidate.id },
      prepareReview,
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
      model: { loading: false, ready: true, selectedModel: 'gpt-5.4', selectedProvider: 'openai' },
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
    } as unknown as WorkspaceComposeReviewController;
    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );
    const structure = await screen.findByLabelText('Workspace review structure');
    expect(within(structure).queryByText(/低于30度/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 modified/)).not.toBeInTheDocument();
    expect(within(structure).getAllByText('气温').length).toBeGreaterThan(0);
    expect(within(structure).getAllByText('低于20度').length).toBeGreaterThan(0);
    expect(prepareReview).not.toHaveBeenCalled();
  });

  it('shows the schema statement gaps on the current candidate', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    navigationMocks.searchParams = new URLSearchParams('workspaceMode=review&reviewPane=checks');
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
        view: {
          checks: {
            objectIntegrity: 'verified',
            replay: { observation: 'observed', outcomes: ['verified'], runs: [] },
            validation: {
              observation: 'observed',
              outcomes: ['failed'],
              runs: [
                {
                  predicate: {
                    outcome: 'failed',
                    gaps: [
                      {
                        code: 'REQUIRED_EVIDENCE_MISSING',
                        path: 'summary/audience',
                        message: 'summary/audience needs accepted source evidence.',
                      },
                    ],
                  },
                },
              ],
            },
          },
          history: { observation: 'not_committed' },
          mode: 'transition',
        },
      },
      scenarios: { options: [], selectedId: candidate.id },
      sourceBusy: false,
    } as unknown as WorkspaceComposeReviewController;

    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );

    expect(
      await screen.findByRole('region', { name: 'Workspace review checks' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('REQUIRED_EVIDENCE_MISSING').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Gap (1)' })).toBeInTheDocument();
    expect(screen.getAllByText('summary/audience').length).toBeGreaterThan(0);
    expect(screen.queryByText('REQUIRED_SLOT_MISSING')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Generate a candidate proposal from source evidence.')
    ).not.toBeInTheDocument();
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

  it('lets Compose keep the default Schema or pin another published Schema', () => {
    const bindSchema = vi.fn();
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={
          {
            busyAction: null,
            bindSchema,
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
              selectedModel: 'gpt-5.4',
              selectedProvider: 'openai',
            },
            notice: null,
            scenarios: { options: [], selectedId: candidate.id },
            sourceBusy: false,
          } as unknown as WorkspaceComposeReviewController
        }
        mode="compose"
        onModeChange={vi.fn()}
      />
    );

    const schema = screen.getByRole('combobox', { name: 'Workspace schema' });
    expect(schema).toHaveValue('default');
    expect(
      within(schema).getByRole('option', { name: 'Default · PRD Schema v2' })
    ).toBeInTheDocument();
    fireEvent.change(schema, { target: { value: 't3x/prompt@v1' } });
    expect(bindSchema).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalName: 't3x/prompt', version: 'v1' })
    );
  });

  it('renders complete authoring Draft in Review even while a single Compose action is selected', async () => {
    const candidate = {
      ...getProjectWorkspaceStarterCandidate('proj_1'),
      title: 'Main workspace',
      summary: 'Collect source evidence and build the next structured state commit.',
      schemaBindings: getWorkspacePreviewCandidates('proj_1')[0]!.schemaBindings,
    };
    const weatherTree = [
      {
        key: 'prd',
        slots: {},
        children: [
          {
            key: 'requirements',
            slots: {},
            children: [{ key: 'weather', slots: { title: '天气为晴天' }, children: [] }],
          },
        ],
      },
    ];
    const current = {
      domain: 't3x.dev/semantic-content',
      version: 1,
      content: { trees: weatherTree, relations: [] },
    };
    const cards = [
      {
        nodeId: 'weather',
        path: 'content/trees/[key=prd]/children/[key=requirements]/children/[key=weather]/slots/title',
        after: '天气为晴天',
      },
      { nodeId: 'domain', path: 'domain', after: 't3x.dev/semantic-content' },
      { nodeId: 'version', path: 'version', after: 1 },
    ];
    activityMocks.value = {
      enabled: true,
      loading: false,
      error: null,
      actions: [],
      cards: {},
      cursor: null,
      node: null,
      nodeLoading: false,
      nodeError: null,
      nodeCursor: null,
      notice: null,
      newActivity: null,
      compositionRevision: 2,
      workspaceRevision: 4,
      basis: { refName: 'main', refHead: null, baseDigest: 'empty' },
      refresh: vi.fn(),
      loadOlder: vi.fn(),
      loadLatest: vi.fn(),
      inspectNode: vi.fn(),
      selectActionNode: vi.fn(),
      loadOlderNode: vi.fn(),
      publish: vi.fn(),
      publishCandidate: vi.fn(),
      createAssistantConversation: vi.fn(),
      view: {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 4,
        compositionRevision: 2,
        basis: { refName: 'main', refHead: null, baseDigest: 'empty' },
        actions: [],
        selected: null,
        netDiff: cards,
        node: null,
        nextBeforeSequence: null,
        base: {},
        current,
      },
    } as unknown as ReturnType<typeof useComposeActivity>;
    if (activityMocks.value.view) {
      Object.assign(activityMocks.value.view, {
        selected: {
          before: {},
          after: {
            ...current,
            content: {
              trees: [{ key: 'isolated', slots: { title: 'Selected action only' }, children: [] }],
              relations: [],
            },
          },
          cards: [],
        },
      });
    }
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

    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    expect(screen.getAllByText('天气为晴天').length).toBeGreaterThan(0);
    expect(screen.getByText('Proposed changes')).toBeInTheDocument();
    expect(screen.getByText('t3x.dev/semantic-content')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1', exact: true })).toBeInTheDocument();
    expect(screen.queryByText('No outcome has been recorded.')).not.toBeInTheDocument();
    expect(screen.queryByText(candidate.summary)).not.toBeInTheDocument();
    expect(screen.queryByText('No rollout plan recorded.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Structure diff' }));
    expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(screen.queryByText('No structured changes are prepared yet')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByTitle('prd/requirements/weather/title')
    ).toBeInTheDocument();
  });

  it('shows the inherited branch State in Review before any change is made', async () => {
    const candidate = {
      ...getProjectWorkspaceStarterCandidate('proj_1'),
      targetBranch: 'dev4',
      schemaBindings: getWorkspacePreviewCandidates('proj_1')[0]!.schemaBindings,
    };
    const inherited = {
      domain: 't3x.dev/semantic-content',
      version: 1,
      content: {
        trees: [
          {
            key: 'prd',
            slots: {},
            children: [
              {
                key: 'requirements',
                slots: {},
                children: [{ key: 'weather', slots: { title: '天气为晴天' }, children: [] }],
              },
            ],
          },
        ],
        relations: [],
      },
    };
    activityMocks.value = {
      enabled: true,
      loading: false,
      error: null,
      actions: [],
      cards: {},
      cursor: null,
      node: null,
      nodeLoading: false,
      nodeError: null,
      nodeCursor: null,
      notice: null,
      newActivity: null,
      compositionRevision: 0,
      workspaceRevision: 1,
      basis: { refName: 'dev4', refHead: 'sha256:main', baseDigest: 'main' },
      refresh: vi.fn(),
      loadOlder: vi.fn(),
      loadLatest: vi.fn(),
      inspectNode: vi.fn(),
      selectActionNode: vi.fn(),
      loadOlderNode: vi.fn(),
      publish: vi.fn(),
      publishCandidate: vi.fn(),
      createAssistantConversation: vi.fn(),
      view: {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 1,
        compositionRevision: 0,
        basis: { refName: 'dev4', refHead: 'sha256:main', baseDigest: 'main' },
        actions: [],
        selected: null,
        netDiff: [],
        node: null,
        nextBeforeSequence: null,
        base: inherited,
        current: inherited,
      },
    } as unknown as ReturnType<typeof useComposeActivity>;
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

    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Structure diff' }));
    expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(screen.queryByText('No structured changes are prepared yet')).not.toBeInTheDocument();
    expect(screen.getByText('0 added')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByTitle('prd/requirements/weather')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rendered YAML' }));
    expect(screen.queryByText('No structured changes are prepared yet')).not.toBeInTheDocument();
    expect(screen.getAllByText(/天气为晴天/).length).toBeGreaterThan(0);
  });
});
