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
import { useProjectStore } from '@/store/projectStore';
import type { ApiCommit } from '@/types/api';

vi.mock('@/components/workspaces/WorkspaceContentEditor', () => ({
  WorkspaceContentEditor: () => <div>Edit structured content</div>,
}));
vi.mock('@/components/workspaces/OutputTargetsTab', () => ({
  OutputTargetsTab: () => <div>Committed State delivery</div>,
}));

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
const conversationMocks = vi.hoisted(() => ({
  value: {
    data: { conversations: [] as Array<Record<string, unknown>> },
    loading: false,
    error: null as Error | null,
    refetch: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
  },
}));
vi.mock('@/hooks/workspaces/useWorkspaceConversations', () => ({
  useWorkspaceConversations: () => conversationMocks.value,
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
const schemaEditingMocks = vi.hoisted(() => ({ hasPendingEdit: vi.fn(), read: vi.fn() }));
vi.mock('@/hooks/workspaces/useWorkspaceSchemaEditingRequests', () => ({
  useWorkspaceSchemaEditingRequests: () => schemaEditingMocks,
}));
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
    conversationId?: string;
    title?: string;
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
    conversationId?: string;
    title?: string;
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
    localStorage.clear();
    useProjectStore.setState({ projects: [], details: {} });
    schemaCardMocks.record = null;
    schemaEditingMocks.hasPendingEdit.mockReset().mockResolvedValue(false);
    schemaEditingMocks.read.mockReset().mockRejectedValue(new Error('Candidate must be loaded'));
    localStorage.removeItem('t3x-workspace-draft-width');
    localStorage.removeItem('t3x-workspace-draft-collapsed');
    localStorage.removeItem('t3x-workspace-discussion-width');
    localStorage.removeItem(
      `t3x-workspace-chat-folders:proj_1:${getProjectWorkspaceStarterCandidate('proj_1').id}`
    );
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
    conversationMocks.value.data.conversations = [];
    conversationMocks.value.loading = false;
    conversationMocks.value.error = null;
    conversationMocks.value.refetch.mockReset();
    conversationMocks.value.get.mockReset();
    conversationMocks.value.remove.mockReset().mockResolvedValue(undefined);
    conversationMocks.value.update.mockReset().mockResolvedValue(undefined);
    schemaDiscussion.mockReset();
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    navigationMocks.searchParams = new URLSearchParams();
  });

  function renderResizableCompose() {
    return {
      ...renderCompose(),
      splitter: screen.getByRole('separator', { name: 'Resize conversation panel' }),
    };
  }

  it('opens Review without checking or applying a saved Schema candidate', () => {
    enableComposeActivity();
    schemaEditingMocks.hasPendingEdit.mockResolvedValue(true);
    const candidate = { ...getProjectWorkspaceStarterCandidate('proj_1'), revision: 4 };
    const onModeChange = vi.fn();
    render(
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
        onModeChange={onModeChange}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Review', exact: true }));
    expect(onModeChange).toHaveBeenCalledWith('review');
    expect(schemaEditingMocks.hasPendingEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Edit Workspace Draft' })).not.toBeInTheDocument();
  });

  it('moves Draft structure and commit history into the right-side workspace tools', () => {
    renderCompose();
    const sidebar = screen.getByRole('complementary', { name: 'Workspace conversations' });
    expect(within(sidebar).getByRole('region', { name: 'Workspace chat list' })).toBeVisible();
    expect(
      within(sidebar).queryByRole('region', { name: 'Current Draft' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Workspace tools' })).getByRole('button', {
        name: 'Structure',
      })
    );
    expect(screen.getByRole('region', { name: 'Current Draft' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    const graph = screen.getByRole('region', { name: 'Commit graph' });
    expect(graph).toHaveTextContent('Graph for proj_1 · main');
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Collapse conversation panel' }));
    expect(screen.getByRole('region', { name: 'Commit graph' })).toBeVisible();
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

  it('restores the change scope and stage on return, with explicit URL stages taking priority', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const first = renderCompose();
    fireEvent.click(screen.getByRole('tab', { name: 'All changes' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Review', exact: true }));
    first.unmount();
    const onModeChange = vi.fn();
    const ui = (
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={
          {
            candidate,
            isBusy: false,
            materialSources: [],
          } as unknown as WorkspaceComposeReviewController
        }
        mode="compose"
        onModeChange={onModeChange}
      />
    );
    const returned = render(ui);
    expect(onModeChange).toHaveBeenLastCalledWith('review');
    expect(screen.getByRole('tab', { name: 'All changes' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    returned.unmount();
    navigationMocks.searchParams = new URLSearchParams('workspaceMode=compose');
    onModeChange.mockClear();
    render(ui);
    expect(onModeChange).not.toHaveBeenCalledWith('review');
  });

  it('remembers the selected Review view, including when the Review URL has no pane', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const key = `t3x.workspace-view:proj_1:${candidate.id}:review`;
    const controller = {
      candidate,
      review: { deterministicValidation: null, view: null },
      scenarios: { options: [] },
      isBusy: false,
      materialSources: [],
    } as unknown as WorkspaceComposeReviewController;
    localStorage.setItem(key, 'yaml');
    navigationMocks.searchParams = new URLSearchParams('workspaceMode=review');
    const ui = (
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );
    const first = render(ui);
    expect(screen.getByRole('button', { name: 'YAML', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
    expect(localStorage.getItem(key)).toBe('rendered');
    first.unmount();
    const returned = render(ui);
    expect(screen.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    navigationMocks.searchParams = new URLSearchParams('workspaceMode=review&reviewPane=changes');
    returned.rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Changes', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(localStorage.getItem(key)).toBe('rendered');
  });

  function enableComposeActivity(createAssistantConversation = vi.fn()) {
    activityMocks.value = {
      enabled: true,
      loading: false,
      error: null,
      view: {
        schema: 't3x.application/workspace-authoring-view/v1',
        projectionVersion: 1,
        workspaceRevision: 1,
        compositionRevision: 1,
        basis: { refName: 'main', refHead: null, baseDigest: 'base' },
        actions: [],
        selected: null,
        current: {},
        netDiff: [],
        node: null,
        nextBeforeSequence: null,
      },
      actions: [],
      cards: {},
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
      publishCandidate: vi.fn(),
      createAssistantConversation,
    } as unknown as ReturnType<typeof useComposeActivity>;
  }

  it('switches independent chat histories and starts a new conversation blank', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    conversationMocks.value.data.conversations = [
      {
        conversation_id: 'chat-alpha',
        project_id: 'proj_1',
        title: 'Alpha plan',
        created_at: '2026-10-26T09:00:00Z',
        metadata: { workspace_id: candidate.id },
      },
      {
        conversation_id: 'chat-beta',
        project_id: 'proj_1',
        title: 'Beta review',
        created_at: '2026-10-26T10:00:00Z',
        metadata: { workspace_id: candidate.id },
      },
    ];
    const createAssistantConversation = vi.fn().mockResolvedValue('chat-new');
    enableComposeActivity(createAssistantConversation);
    renderCompose();

    fireEvent.click(screen.getByRole('button', { name: 'Alpha plan' }));
    await waitFor(() => expect(sourceGenerationMocks.options?.conversationId).toBe('chat-alpha'));
    expect(sourceGenerationMocks.options?.title).toBe('Alpha plan');
    expect(screen.getByRole('button', { name: 'Alpha plan' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Beta review' }));
    await waitFor(() => expect(sourceGenerationMocks.options?.conversationId).toBe('chat-beta'));

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(createAssistantConversation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sourceGenerationMocks.options?.conversationId).toBe('chat-new'));
    expect(sourceGenerationMocks.options?.title).toBe('New conversation');
    expect(conversationMocks.value.update).toHaveBeenCalledWith('chat-new', {
      title: 'New conversation',
      metadata: { workspace_id: candidate.id },
    });
  });

  it('reuses the existing blank conversation instead of creating another one', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const blankConversation = {
      conversation_id: 'chat-blank',
      project_id: 'proj_1',
      title: 'New conversation',
      created_at: '2026-10-26T10:00:00Z',
      metadata: { workspace_id: candidate.id },
    };
    conversationMocks.value.data.conversations = [blankConversation];
    conversationMocks.value.get.mockResolvedValue({ ...blankConversation, turns_count: 0 });
    const createAssistantConversation = vi.fn().mockResolvedValue('chat-new');
    enableComposeActivity(createAssistantConversation);
    renderCompose();

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    await waitFor(() => expect(sourceGenerationMocks.options?.conversationId).toBe('chat-blank'));
    expect(conversationMocks.value.get).toHaveBeenCalledWith('chat-blank');
    expect(createAssistantConversation).not.toHaveBeenCalled();
    expect(conversationMocks.value.update).not.toHaveBeenCalled();
  });

  it('does not create twice when New chat is clicked again before the blank list refreshes', async () => {
    const createdConversation = {
      conversation_id: 'chat-new',
      project_id: 'proj_1',
      title: 'New conversation',
      created_at: '2026-10-26T10:00:00Z',
      metadata: { workspace_id: getProjectWorkspaceStarterCandidate('proj_1').id },
      turns_count: 0,
    };
    conversationMocks.value.get.mockResolvedValue(createdConversation);
    const createAssistantConversation = vi.fn().mockResolvedValue('chat-new');
    enableComposeActivity(createAssistantConversation);
    renderCompose();

    const newConversationButton = screen.getByRole('button', { name: 'New chat' });
    fireEvent.click(newConversationButton);
    await waitFor(() => expect(createAssistantConversation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(newConversationButton).toBeEnabled());

    fireEvent.click(newConversationButton);

    await waitFor(() => expect(conversationMocks.value.get).toHaveBeenCalledWith('chat-new'));
    expect(createAssistantConversation).toHaveBeenCalledTimes(1);
  });

  it('creates a new conversation once the previous placeholder has a turn', async () => {
    const usedConversation = {
      conversation_id: 'chat-used',
      project_id: 'proj_1',
      title: 'New conversation',
      created_at: '2026-10-26T10:00:00Z',
      metadata: { workspace_id: getProjectWorkspaceStarterCandidate('proj_1').id },
    };
    conversationMocks.value.data.conversations = [usedConversation];
    conversationMocks.value.get.mockResolvedValue({ ...usedConversation, turns_count: 1 });
    const createAssistantConversation = vi.fn().mockResolvedValue('chat-next');
    enableComposeActivity(createAssistantConversation);
    renderCompose();

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));

    await waitFor(() => expect(createAssistantConversation).toHaveBeenCalledTimes(1));
    expect(conversationMocks.value.update).toHaveBeenCalledWith('chat-next', {
      title: 'New conversation',
      metadata: { workspace_id: getProjectWorkspaceStarterCandidate('proj_1').id },
    });
  });

  it('creates folders and renames or moves conversations from the Codex-style menu', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    conversationMocks.value.data.conversations = [
      {
        conversation_id: 'chat-alpha',
        project_id: 'proj_1',
        title: 'Alpha plan',
        created_at: '2026-10-26T09:00:00Z',
        metadata: { workspace_id: candidate.id },
      },
    ];
    enableComposeActivity();
    renderCompose();

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const createFolderDialog = screen.getByRole('dialog', { name: 'Create folder' });
    expect(createFolderDialog).toBeVisible();
    expect(
      within(createFolderDialog).getByRole('button', { name: 'Create folder' })
    ).toBeDisabled();
    fireEvent.change(within(createFolderDialog).getByLabelText('Folder name'), {
      target: { value: 'Planning' },
    });
    fireEvent.click(within(createFolderDialog).getByRole('button', { name: 'Create folder' }));
    expect(screen.getByText('Planning')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Create folder' })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for folder Planning' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const renameFolderDialog = screen.getByRole('dialog', { name: 'Rename folder' });
    fireEvent.change(within(renameFolderDialog).getByLabelText('Folder name'), {
      target: { value: 'Roadmap' },
    });
    fireEvent.click(within(renameFolderDialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByText('Roadmap')).toBeVisible());

    const prompt = vi.spyOn(window, 'prompt').mockReturnValueOnce('Alpha renamed');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Alpha plan' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    await waitFor(() =>
      expect(conversationMocks.value.update).toHaveBeenCalledWith('chat-alpha', {
        title: 'Alpha renamed',
      })
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Alpha plan' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to Roadmap' }));
    await waitFor(() =>
      expect(conversationMocks.value.update).toHaveBeenCalledWith(
        'chat-alpha',
        expect.objectContaining({
          metadata: expect.objectContaining({
            workspace_id: candidate.id,
            workspace_folder_name: 'Roadmap',
          }),
        })
      )
    );
    prompt.mockRestore();
  });

  it('pins folders and removes them without deleting their conversations', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const storageKey = `t3x-workspace-chat-folders:proj_1:${candidate.id}`;
    localStorage.setItem(storageKey, JSON.stringify([{ id: 'folder:planning', name: 'Planning' }]));
    conversationMocks.value.data.conversations = [
      {
        conversation_id: 'chat-alpha',
        project_id: 'proj_1',
        title: 'Alpha plan',
        created_at: '2026-10-26T09:00:00Z',
        metadata: {
          workspace_id: candidate.id,
          workspace_folder_id: 'folder:planning',
          workspace_folder_name: 'Planning',
        },
      },
    ];
    enableComposeActivity();
    renderCompose();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for folder Planning' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Pin' }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(storageKey) ?? '[]')).toEqual([
        expect.objectContaining({ id: 'folder:planning', pinned: true }),
      ])
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for folder Planning' }), {
      key: 'Enter',
    });
    expect(await screen.findByRole('menuitem', { name: 'Unpin' })).toBeVisible();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove folder' }));
    const removeDialog = screen.getByRole('dialog', { name: 'Remove “Planning”?' });
    expect(removeDialog).toHaveTextContent(
      'Conversations inside this folder will move to Recent. They will not be deleted.'
    );
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove folder' }));

    await waitFor(() =>
      expect(conversationMocks.value.update).toHaveBeenCalledWith('chat-alpha', {
        metadata: { workspace_id: candidate.id },
      })
    );
    await waitFor(() => expect(screen.queryByText('Planning')).not.toBeInTheDocument());
    expect(conversationMocks.value.remove).not.toHaveBeenCalled();
  });

  it('deletes a confirmed conversation and selects the next conversation', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    conversationMocks.value.data.conversations = [
      {
        conversation_id: 'chat-alpha',
        project_id: 'proj_1',
        title: 'Alpha plan',
        created_at: '2026-10-26T10:00:00Z',
        metadata: { workspace_id: candidate.id },
      },
      {
        conversation_id: 'chat-beta',
        project_id: 'proj_1',
        title: 'Beta review',
        created_at: '2026-10-26T09:00:00Z',
        metadata: { workspace_id: candidate.id },
      },
    ];
    enableComposeActivity();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderCompose();

    fireEvent.click(screen.getByRole('button', { name: 'Alpha plan' }));
    await waitFor(() => expect(sourceGenerationMocks.options?.conversationId).toBe('chat-alpha'));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Alpha plan' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledWith('Delete “Alpha plan”? This cannot be undone.');
    await waitFor(() => expect(conversationMocks.value.remove).toHaveBeenCalledWith('chat-alpha'));
    await waitFor(() => expect(sourceGenerationMocks.options?.conversationId).toBe('chat-beta'));
    confirm.mockRestore();
  });

  it('keeps a conversation when deletion is cancelled', async () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    conversationMocks.value.data.conversations = [
      {
        conversation_id: 'chat-alpha',
        project_id: 'proj_1',
        title: 'Alpha plan',
        created_at: '2026-10-26T10:00:00Z',
        metadata: { workspace_id: candidate.id },
      },
    ];
    enableComposeActivity();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderCompose();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Alpha plan' }), {
      key: 'Enter',
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(conversationMocks.value.remove).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

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
    const toolbar = screen.getByRole('tablist', { name: 'Change scope' });
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
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
    expect(screen.queryByRole('tablist', { name: 'Change scope' })).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('region', { name: 'Committed changes' })).getByRole('button', {
        name: 'Return to current Draft',
      })
    );
    expect(screen.queryByRole('region', { name: 'Committed changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeVisible();
    expect(schemaCardMocks.generate).not.toHaveBeenCalled();
    expect(navigationMocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
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
      within(screen.getByRole('region', { name: 'Workspace AI chat' })).queryByRole('region', {
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
    const generated = screen.getByRole('complementary', { name: 'Generated changes' });
    expect(within(generated).getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
    const details = within(generated).getByRole('region', {
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
      within(generated).queryByRole('region', { name: 'Selected Schema change details' })
    ).not.toBeInTheDocument();
  });

  it('resizes the conversation rail with keyboard controls, resets it, and restores its saved width', () => {
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

  it('collapses the conversation rail to a narrow strip and remembers the choice', () => {
    const { splitter, unmount } = renderResizableCompose();
    const board = splitter.parentElement!;
    fireEvent.click(screen.getByRole('button', { name: 'Collapse conversation panel' }));
    expect(board).toHaveAttribute('data-draft-collapsed', 'true');
    expect(screen.queryByRole('region', { name: 'Workspace chat list' })).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize conversation panel' })).toBeNull();
    expect(localStorage.getItem('t3x-workspace-draft-collapsed')).toBe('true');
    unmount();
    renderCompose();
    expect(screen.queryByRole('region', { name: 'Workspace chat list' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand conversation panel' }));
    expect(screen.getByRole('region', { name: 'Workspace chat list' })).toBeVisible();
    expect(screen.getByRole('separator', { name: 'Resize conversation panel' })).toBeVisible();
    expect(localStorage.getItem('t3x-workspace-draft-collapsed')).toBe('false');
  });

  it('drags the conversation divider and stops resizing on release or cancellation', () => {
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

  it('limits conversation width so changes and Chat retain room, and ignores invalid saved preferences', () => {
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
    expect(screen.getByRole('complementary', { name: 'Generated changes' })).toBeVisible();
  });

  it('keeps AI Chat centered and stacks generated cards above resizable Details', async () => {
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
    const chat = screen.getByRole('region', { name: 'Workspace AI chat' });
    const generated = screen.getByRole('complementary', { name: 'Generated changes' });
    const draftNavigation = screen.getByRole('complementary', { name: 'Workspace conversations' });
    expect(draftNavigation).toContainElement(
      screen.getByRole('region', { name: 'Workspace chat list' })
    );
    expect(within(chat).queryByRole('region', { name: 'Current Draft' })).not.toBeInTheDocument();
    const workspace = screen.getByRole('main');
    expect(
      draftNavigation.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      workspace.compareDocumentPosition(generated) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(chat).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
    expect(within(chat).getByTitle(candidate.title)).toBeVisible();
    expect(generated).toHaveAttribute('data-panel', 'changes');
    expect(screen.queryByRole('button', { name: 'Chat', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review complete draft' })).not.toBeInTheDocument();
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
    expect(generated).toContainElement(screen.getByRole('tablist', { name: 'Change scope' }));
    expect(screen.queryByRole('button', { name: 'New change' })).not.toBeInTheDocument();
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
      within(generated).getByRole('region', { name: 'Selected Schema change details' })
    ).toBeVisible();
    expect(generated).toHaveAttribute('data-panel', 'split');
    const detailsSplitter = within(generated).getByRole('separator', {
      name: 'Resize generated cards and details',
    });
    expect(detailsSplitter).toHaveAttribute('aria-orientation', 'horizontal');
    expect(detailsSplitter).toHaveAttribute('aria-valuenow', '260');
    const originalPointerEvent = window.PointerEvent;
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    try {
      Object.assign(detailsSplitter, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: vi.fn(),
      });
      fireEvent.pointerDown(detailsSplitter, { button: 0, clientY: 260 });
      expect(generated.parentElement).toHaveAttribute('data-details-resizing', 'true');
      fireEvent.pointerMove(detailsSplitter, { clientY: 320 });
      expect(detailsSplitter).toHaveAttribute('aria-valuenow', '320');
      expect(localStorage.getItem('t3x-workspace-generated-panel-height')).toBe('320');
      fireEvent.pointerUp(detailsSplitter, { clientY: 320 });
      expect(generated.parentElement).not.toHaveAttribute('data-details-resizing');
      fireEvent.keyDown(detailsSplitter, { key: 'ArrowUp' });
      expect(detailsSplitter).toHaveAttribute('aria-valuenow', '300');
    } finally {
      window.PointerEvent = originalPointerEvent;
    }
    expect(within(chat).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
    expect(activityMocks.value.inspectNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Approval: rollout/approval' }));
    expect(inspectSchema).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(generated).queryByRole('region', { name: 'Selected Schema change details' })
    ).not.toBeInTheDocument();
    expect(within(generated).getByRole('heading', { name: 'Details' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Inspect Approval: rollout/approval' })
    ).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(generated).getByRole('button', { name: 'Ask AI' }));
    expect(generated).toHaveAttribute('data-panel', 'changes');
    expect(screen.queryByRole('button', { name: 'Chat', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Event evidence' })).not.toBeInTheDocument();
    fireEvent.click(allChanges);
    expect(allChanges).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Approval: rollout/approval' }));
    expect(within(generated).getByRole('heading', { name: 'Details' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chat', exact: true })).not.toBeInTheDocument();
    fireEvent.click(within(generated).getByRole('button', { name: 'Ask AI' }));
    expect(within(chat).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
    expect(within(chat).getByRole('heading', { name: 'Chat', exact: true })).toBeVisible();
    expect(screen.queryByText('Before event')).not.toBeInTheDocument();
    fireEvent.click(latestAction);
    expect(latestAction).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Action history is not available for this draft.')).toBeNull();

    const tools = screen.getByRole('navigation', { name: 'Workspace tools' });
    for (const name of ['Structure', 'History']) {
      fireEvent.click(within(tools).getByRole('button', { name }));
      expect(screen.queryByRole('tablist', { name: 'Change scope' })).not.toBeInTheDocument();
    }
    fireEvent.click(within(tools).getByRole('button', { name: 'Changes' }));
    expect(screen.getByRole('tab', { name: 'Latest' })).toHaveAttribute('aria-selected', 'true');

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
    expect(screen.getByRole('complementary', { name: 'Generated changes' })).toBeVisible();
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
    expect(
      screen.getByRole('checkbox', { name: 'Include Allocation in the next P' })
    ).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: 'Review', exact: true }));
    expect(screen.getByRole('dialog', { name: 'Unsaved Content changes' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing', exact: true }));
    expect(publish).not.toHaveBeenCalled();
    expect(
      screen.getByRole('checkbox', { name: 'Include Allocation in the next P' })
    ).toBeChecked();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Workspace tools' })).getByRole('button', {
        name: 'Structure',
      })
    );
    const draftSidebar = screen.getByRole('region', { name: 'Current Draft' });
    expect(within(draftSidebar).getByText('30')).toBeVisible();
    expect(within(draftSidebar).getByText(/ungrouped local changes/)).toBeVisible();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Advanced tools' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Draft' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Workspace Draft' });
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
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Workspace tools' })).getByRole('button', {
        name: 'Changes',
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Include Regions in the next P' })).toBeChecked()
    );

    const inspectNode = activityMocks.value.inspectNode;
    vi.mocked(inspectNode).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Regions: rollout/regions' }));
    expect(screen.getByText('Unsaved change · not yet applied to Draft')).toBeVisible();
    expect(screen.getByLabelText('Selected field details')).toHaveTextContent('us');
    expect(inspectNode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close change details' }));
    expect(screen.queryByLabelText('Selected field details')).not.toBeInTheDocument();
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
    const { rerender, unmount } = render(
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
    expect(navigationMocks.replace).toHaveBeenLastCalledWith(
      '/t3x-dev/test-project/workspaces?workspaceMode=review',
      { scroll: false }
    );

    rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
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
    expect(screen.queryByRole('button', { name: 'Continue to decision' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Open Run' }));
    const checksTarget = new URL(navigationMocks.push.mock.calls.at(-1)?.[0], 'http://localhost');
    expect(checksTarget.pathname).toBe('/project/proj_1/checks/review%3Arvs_ready');
    expect(checksTarget.searchParams.get('returnTo')).toContain('workspaceMode=review');
    expect(checksTarget.searchParams.get('returnTo')).toContain('reviewPane=rendered');
    expect(snapshotMocks.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'YAML' }));
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
    expect(screen.getAllByRole('region', { name: 'Review readiness' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Continue to decision' })).not.toBeInTheDocument();
    activityMocks.value = {
      view: null,
      newActivity: { workspaceRevision: 13 },
    } as ReturnType<typeof useComposeActivity>;
    controller.review.reviewSnapshot = {
      ...controller.review.reviewSnapshot,
      review: { precondition: { workspaceRevision: 12 } },
    } as never;
    rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );
    expect(screen.queryByRole('button', { name: 'Continue to decision' })).not.toBeInTheDocument();
    expect(
      screen.getByText('The branch or Draft changed. Prepare review again.')
    ).toBeInTheDocument();
    expect(prepareReview).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
    prepareReview.mockImplementationOnce(async (onPrepared) => {
      onPrepared({
        projectId: candidate.projectId,
        workspaceId: candidate.id,
        snapshotId: 'rvs_new',
        review: { precondition: { refName: 'feature/review', workspaceRevision: 13 } },
      });
      return true;
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare review' }));
    expect(navigationMocks.replace).toHaveBeenCalledWith(
      `/project/proj_1?tab=workspaces&workspace=${encodeURIComponent(candidate.id)}&workspaceMode=review&branch=feature%2Freview&reviewSnapshot=rvs_new&reviewPane=yaml`,
      { scroll: false }
    );
    expect(decide).not.toHaveBeenCalled();
    unmount();
    navigationMocks.replace.mockClear();
    prepareReview.mock.calls.at(-1)![0]({
      projectId: candidate.projectId,
      workspaceId: candidate.id,
      snapshotId: 'rvs_delayed',
      review: { precondition: { refName: 'feature/review' } },
    });
    expect(navigationMocks.replace).not.toHaveBeenCalled();
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

  it('redirects legacy Checks to the repository history without preparing a new review', async () => {
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

    await waitFor(() => expect(navigationMocks.replace).toHaveBeenCalled());
    const target = new URL(navigationMocks.replace.mock.calls.at(-1)?.[0], 'http://localhost');
    expect(target.pathname).toBe('/project/proj_1/checks');
    expect(target.searchParams.get('workspace')).toBe(candidate.id);
    expect(controller.prepareReview).not.toHaveBeenCalled();
    expect(snapshotMocks.list).not.toHaveBeenCalled();
  });

  it('normalizes a stale validation review pane to Changes', () => {
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
    expect(screen.getByRole('button', { name: 'Changes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: 'Review readiness' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Review views' }))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Changes', 'Preview', 'YAML']);
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

  it.each([
    'edit',
    'source',
    'delivery',
  ] as const)('moves the legacy %s link out of Review and preserves its Workspace and branch', (tool) => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const controller = { candidate, isBusy: false } as WorkspaceComposeReviewController;
    const onModeChange = vi.fn();
    navigationMocks.searchParams = new URLSearchParams(
      `workspace=ws%3Amain&branch=feature&workspaceMode=review&reviewPane=${tool}`
    );
    render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={onModeChange}
      />
    );
    const target = new URL(navigationMocks.replace.mock.calls.at(-1)?.[0], 'http://localhost');
    expect(target.searchParams.get('workspaceTool')).toBe(tool);
    expect(target.searchParams.get('reviewPane')).toBeNull();
    expect(target.searchParams.get('workspace')).toBe('ws:main');
    expect(target.searchParams.get('branch')).toBe('feature');
    expect(target.searchParams.get('workspaceMode')).toBe(
      tool === 'delivery' ? 'review' : 'compose'
    );
    expect(screen.queryByRole('navigation', { name: 'Review views' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Review' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Compose' })).toHaveAttribute(
      'aria-selected',
      tool === 'delivery' ? 'false' : 'true'
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: tool === 'delivery' ? 'Back to Review' : 'Back to Compose',
      })
    );
    const back = new URL(navigationMocks.replace.mock.calls.at(-1)?.[0], 'http://localhost');
    expect(back.searchParams.get('workspaceTool')).toBeNull();
    expect(back.searchParams.get('reviewPane')).toBeNull();
    expect(back.searchParams.get('workspace')).toBe('ws:main');
    expect(onModeChange).toHaveBeenCalledWith(tool === 'delivery' ? 'review' : 'compose');
  });

  it('returns from Delivery to the exact review snapshot, rejecting external return targets', () => {
    const candidate = getProjectWorkspaceStarterCandidate('proj_1');
    const controller = { candidate, isBusy: false } as WorkspaceComposeReviewController;
    const back =
      '/project/proj_1?tab=workspaces&workspace=ws%3Amain&workspaceMode=review&reviewSnapshot=rvs_saved';
    navigationMocks.searchParams = new URLSearchParams({
      workspaceTool: 'delivery',
      workspaceMode: 'review',
      returnTo: back,
    });
    const view = render(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to Review snapshot' }));
    expect(navigationMocks.push).toHaveBeenCalledWith(back);
    navigationMocks.searchParams.set('returnTo', 'https://outside.example/review');
    view.rerender(
      <WorkspaceComposeReviewSurface
        candidate={candidate}
        controller={controller}
        mode="review"
        onModeChange={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Back to Review snapshot' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Review' })).toBeInTheDocument();
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

    expect(screen.queryByRole('combobox', { name: 'Workspace schema' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Structure', exact: true }));
    expect(screen.queryByRole('tablist', { name: 'Change scope' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Schema', exact: true }));
    const draft = screen.getByRole('region', { name: 'Current Draft' });
    const schema = within(draft).getByRole('combobox', { name: 'Workspace schema' });
    expect(
      within(draft).queryByRole('button', { name: 'Toggle current Draft' })
    ).not.toBeInTheDocument();
    expect(within(draft).queryByRole('button', { name: 'Edit Draft' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Advanced tools' })).toBeVisible();
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

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByLabelText('Rendered result')).toBeInTheDocument();
    expect(screen.getAllByText('天气为晴天').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: 'Content result preview' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Selected action only')).not.toBeInTheDocument();
    expect(screen.queryByText('No outcome has been recorded.')).not.toBeInTheDocument();
    expect(screen.queryByText(candidate.summary)).not.toBeInTheDocument();
    expect(screen.queryByText('No rollout plan recorded.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
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
        hasChanges: false,
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

    fireEvent.click(screen.getByRole('button', { name: 'Changes' }));
    expect(await screen.findByLabelText('Workspace review structure')).toBeInTheDocument();
    expect(screen.queryByText('No structured changes are prepared yet')).not.toBeInTheDocument();
    expect(screen.getByText('0 added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare review' })).toBeDisabled();
    expect(screen.getByText(/No changes to commit/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare review' }));
    expect(controller.prepareReview).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'View History' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getByTitle('prd/requirements/weather')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'YAML' }));
    expect(screen.queryByText('No structured changes are prepared yet')).not.toBeInTheDocument();
    expect(screen.getAllByText(/天气为晴天/).length).toBeGreaterThan(0);
  });
});
