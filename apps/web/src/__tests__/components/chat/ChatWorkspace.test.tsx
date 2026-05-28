// @vitest-environment jsdom

import type { SourcedYOp } from '@t3x-dev/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { CONVERSATION_BRANCH_CHANGED_EVENT } from '@/hooks/conversations/useConversationBranchSwitch';
import { useChatStore } from '@/store/chatStore';
import { usePinsStore } from '@/store/pinsStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { ConversationContextManifest, Material } from '@/types/api';

const mocks = vi.hoisted(() => ({
  ensureProject: vi.fn(),
  addPin: vi.fn(),
  fetchPins: vi.fn(),
  handleExtract: vi.fn(),
  handleModelChange: vi.fn(),
  sendMessage: vi.fn(),
  stopGenerating: vi.fn(),
  toastMessage: vi.fn(),
  useContextManifest: vi.fn(),
  reloadContextManifest: vi.fn(),
  updateSelectedPins: vi.fn(),
  parentConversationId: null as string | null,
  contextManifest: null as ConversationContextManifest | null,
  projectLeaves: [],
  projectMaterials: [],
  refreshProjectMaterials: vi.fn(),
  uploadMaterial: vi.fn(),
  archiveMaterial: vi.fn(),
  textSelection: {
    current: null as null | {
      selection: {
        text: string;
        turnHash: string;
        turnRole: string;
        turnText: string;
        startChar: number;
        endChar: number;
        rect: DOMRect;
      };
      clearSelection: () => void;
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    message: (...args: unknown[]) => mocks.toastMessage(...args),
  },
}));

vi.mock('@/domain/sourceMap', () => ({
  buildSourceMap: () => new Map(),
}));

vi.mock('@/hooks/commits/useCommittedHighlights', () => ({
  useCommittedHighlights: () => new Map(),
}));

vi.mock('@/hooks/conversations/useChatInit', () => ({
  useChatInit: () => ({ parentConversationId: mocks.parentConversationId }),
}));

vi.mock('@/hooks/conversations/useContextManifest', () => ({
  useContextManifest: (conversationId: string | null | undefined) => {
    mocks.useContextManifest(conversationId);
    return {
      manifest: mocks.contextManifest,
      loading: false,
      error: null,
      reload: mocks.reloadContextManifest,
    };
  },
}));

vi.mock('@/hooks/conversations/useConversationContextPins', () => ({
  useConversationContextPins: () => ({
    updateSelectedPins: mocks.updateSelectedPins,
  }),
}));

vi.mock('@/hooks/conversations/useConversationChat', () => ({
  useConversationChat: () => ({
    messages: [{ id: 'sha256:t1', role: 'user', content: 'hello' }],
    isLoading: false,
    isStreaming: false,
    streamingContent: '',
    error: null,
    warning: null,
    sendMessage: mocks.sendMessage,
    stopGenerating: mocks.stopGenerating,
    searchQuery: null,
    citations: [],
    thinkingContent: '',
    isThinking: false,
  }),
}));

vi.mock('@/hooks/drafts/useExtraction', () => ({
  useExtraction: () => ({
    handleExtract: mocks.handleExtract,
    isExtracting: false,
  }),
}));

vi.mock('@/hooks/leaves/useProjectLeaves', () => ({
  useProjectLeaves: () => ({
    leaves: mocks.projectLeaves,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/materials/useProjectMaterials', () => ({
  useProjectMaterials: () => ({
    materials: mocks.projectMaterials,
    loading: false,
    error: null,
    refresh: mocks.refreshProjectMaterials,
  }),
}));

vi.mock('@/hooks/materials/useMaterialUpload', () => ({
  useMaterialUpload: () => ({
    uploading: false,
    upload: mocks.uploadMaterial,
  }),
}));

vi.mock('@/hooks/materials/useMaterialArchive', () => ({
  useMaterialArchive: () => ({
    archiving: false,
    archiveMaterial: mocks.archiveMaterial,
  }),
}));

vi.mock('@/hooks/pins/usePinsCrud', () => ({
  usePinsCrud: () => ({ fetch: mocks.fetchPins, add: mocks.addPin, setAssertions: vi.fn() }),
}));

vi.mock('@/hooks/projects/useAutoProject', () => ({
  useAutoProject: () => ({ ensureProject: mocks.ensureProject }),
}));

vi.mock('@/hooks/shared/useChatModelSelection', () => ({
  useChatModelSelection: () => ({
    loading: false,
    hasConfiguredGenerationProvider: true,
    availabilityError: null,
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet',
    handleModelChange: mocks.handleModelChange,
    isSelectionReady: true,
  }),
}));

vi.mock('@/hooks/shared/useRealtimeSync', () => ({
  useRealtimeSync: () => undefined,
}));

vi.mock('@/hooks/shared/useTextSelection', () => ({
  useTextSelection: () =>
    mocks.textSelection.current ?? { selection: null, clearSelection: vi.fn() },
}));

vi.mock('@/hooks/shared/useUndo', () => ({
  useUndo: () => undefined,
  useUndoTracker: () => ({ trackAction: vi.fn() }),
}));

vi.mock('@/components/chat/ChatMessage', () => ({
  ChatMessage: () => null,
}));

vi.mock('@/components/chat/ChatSpanActions', () => ({
  ChatSpanActions: () => <div data-testid="chat-span-actions" />,
}));

function makeContextManifest(): ConversationContextManifest {
  return {
    conversation_id: 'conv_123',
    project_id: 'proj_123',
    baseline: {
      commit_hash: 'sha256:parent',
      branch: 'main',
      message: 'Parent commit',
      source: 'parent_commit',
      source_conversation_id: null,
      node_count: 0,
      relation_count: 0,
      content: { trees: [], relations: [] },
    },
    references: [
      {
        type: 'conversation',
        id: 'conv_parent',
        pin_id: 'pin_parent',
        included: true,
        title: 'Parent conversation',
      },
    ],
    feedback: [],
    source_items: [
      {
        id: 'sha256:parent',
        kind: 'baseline',
        role: 'baseline',
        title: 'Baseline inherited',
        pinned: false,
        pinnable: false,
        included: true,
        readonly: true,
      },
      {
        id: 'conv_parent',
        kind: 'conversation',
        role: 'evidence',
        title: 'Parent conversation',
        pin_id: 'pin_parent',
        pinned: true,
        pinnable: true,
        included: true,
      },
    ],
    token_estimate: 0,
    sources: [{ type: 'commit', id: 'sha256:parent', title: 'Parent commit' }],
    chat_context_text: '',
    extraction_context_text: '',
  };
}

const sourceDocumentMaterial = {
  id: 'mat_source_doc',
  project_id: 'proj_123',
  source_type: 'document',
  title: 'Launch notes',
  filename: 'launch-notes.pdf',
  mime_type: 'application/pdf',
  content_hash: 'abc123',
  content_excerpt: 'Private beta starts with five design partners.',
  token_estimate: 12,
  metadata: {},
  created_at: '2026-05-26T00:00:00.000Z',
  archived_at: null,
  created_by: null,
} satisfies Material;

const extractedOp = {
  set: { path: 'concepts/title', value: 'understand' },
  source: { type: 'llm', provider: 'anthropic', model: 'claude-sonnet' },
} as SourcedYOp;

describe('ChatWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.scrollTo = vi.fn();
    mocks.textSelection.current = null;
    mocks.parentConversationId = null;
    mocks.contextManifest = null;
    mocks.projectLeaves = [];
    mocks.projectMaterials = [];
    mocks.refreshProjectMaterials.mockReset();
    mocks.uploadMaterial.mockReset();
    mocks.archiveMaterial.mockReset();
    mocks.useContextManifest.mockReset();
    const workspace = useWorkspaceStore.getState();
    workspace.reset();
    workspace.setActiveProject('proj_123');
    workspace.setConversation('conv_123');
    workspace.setTurns([{ turn_hash: 'sha256:t1', role: 'user', content: 'hello' }]);
    useChatStore.setState({ activeBranch: 'main' });
    usePinsStore.setState({
      pins: [],
      loading: false,
      error: null,
      initialized: true,
      currentProjectId: 'proj_123',
    });
  });

  it('opens source chooser inside Sources instead of the composer or message stream', () => {
    mocks.parentConversationId = 'conv_parent';
    mocks.contextManifest = makeContextManifest();
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [],
      baselineCommitHash: 'sha256:parent',
      hasConversationChanges: false,
    });
    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('t3x:extract-requested', {
          detail: { chooseSources: true },
        })
      );
    });

    expect(mocks.handleExtract).not.toHaveBeenCalled();
    expect(mocks.toastMessage).not.toHaveBeenCalledWith('No pinned sources yet');

    const manifest = screen.getByRole('region', { name: /sources/i });
    const messageScroll = screen.getByTestId('chat-message-scroll');
    expect(screen.queryByTestId('source-picker-overlay')).toBeNull();
    expect(manifest.contains(screen.getByRole('tab', { name: /materials/i }))).toBe(true);
    expect(screen.queryByText('Pin parent')).toBeNull();
    expect(screen.getAllByText('Baseline inherited').length).toBeGreaterThan(0);
    expect(messageScroll.contains(manifest)).toBe(false);
  });

  it('reloads Sources when the active conversation branch changes', async () => {
    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(CONVERSATION_BRANCH_CHANGED_EVENT, {
          detail: {
            projectId: 'proj_123',
            conversationId: 'conv_123',
            branch: 'branch 111',
            parentCommitHash: 'sha256:branch_head',
          },
        })
      );
    });

    await waitFor(() => {
      expect(mocks.reloadContextManifest).toHaveBeenCalled();
    });
  });

  it('shows the switched branch baseline before the Sources manifest reload finishes', () => {
    mocks.contextManifest = makeContextManifest();
    useChatStore.setState({ activeBranch: 'branch 111' });
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [],
      baselineCommitHash: 'sha256:branch_head',
      hasConversationChanges: false,
    });

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    expect(screen.getByText('Baseline branch_h')).toBeTruthy();
    expect(screen.queryByText('Baseline parent')).toBeNull();
  });

  it('hides source text actions before YOps content exists', () => {
    mocks.textSelection.current = {
      selection: {
        text: 'understand',
        turnHash: 'sha256:t1',
        turnRole: 'assistant',
        turnText: 'hello',
        startChar: 10,
        endChar: 20,
        rect: new DOMRect(),
      },
      clearSelection: vi.fn(),
    };
    useWorkspaceStore.getState().setMode('idle');

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    expect(screen.queryByTestId('chat-span-actions')).toBeNull();
  });

  it('shows source text actions for a valid selection after YOps content is applied', () => {
    mocks.textSelection.current = {
      selection: {
        text: 'understand',
        turnHash: 'sha256:t1',
        turnRole: 'assistant',
        turnText: 'hello',
        startChar: 10,
        endChar: 20,
        rect: new DOMRect(),
      },
      clearSelection: vi.fn(),
    };
    useWorkspaceStore.getState().setMode('idle');
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [extractedOp],
    });

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    expect(screen.getByTestId('chat-span-actions')).not.toBeNull();
  });

  it('hides source text actions while an extraction draft is waiting for Apply', () => {
    mocks.textSelection.current = {
      selection: {
        text: 'understand',
        turnHash: 'sha256:t1',
        turnRole: 'assistant',
        turnText: 'hello',
        startChar: 10,
        endChar: 20,
        rect: new DOMRect(),
      },
      clearSelection: vi.fn(),
    };
    useWorkspaceStore.getState().setMode('idle');
    useWorkspaceStore.getState().setDraft({
      ops: [extractedOp],
      tree: { trees: [], relations: [] },
    });

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    expect(screen.queryByTestId('chat-span-actions')).toBeNull();
  });

  it('hides source text actions while manual YOps changes are waiting to run', () => {
    mocks.textSelection.current = {
      selection: {
        text: 'understand',
        turnHash: 'sha256:t1',
        turnRole: 'assistant',
        turnText: 'hello',
        startChar: 10,
        endChar: 20,
        rect: new DOMRect(),
      },
      clearSelection: vi.fn(),
    };
    useWorkspaceStore.getState().setMode('idle');
    useWorkspaceStore.getState().setDerived({
      tree: { trees: [], relations: [] },
      sourceIndex: new Map(),
      opsLog: [extractedOp],
    });
    useWorkspaceStore
      .getState()
      .setEditorOverride('yops:\n  - set:\n      path: x\n      value: y\n');

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    expect(screen.queryByTestId('chat-span-actions')).toBeNull();
  });

  it('hides project context controls for temporary chats', () => {
    render(<ChatWorkspace conversationId="temp_chat_1" />);

    expect(mocks.useContextManifest).toHaveBeenCalledWith(null);
    expect(screen.queryByRole('button', { name: /open sources/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /sources/i })).toBeNull();
  });

  it('does not show source text actions for a user question selection', () => {
    mocks.textSelection.current = {
      selection: {
        text: 'question text',
        turnHash: 'sha256:t1',
        turnRole: 'user',
        turnText: 'question text',
        startChar: 0,
        endChar: 12,
        rect: new DOMRect(),
      },
      clearSelection: vi.fn(),
    };

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    expect(screen.queryByTestId('chat-span-actions')).toBeNull();
  });

  it('uploads a material and immediately adds it to the current conversation context', async () => {
    mocks.contextManifest = makeContextManifest();
    mocks.uploadMaterial.mockResolvedValue(sourceDocumentMaterial);
    mocks.addPin.mockResolvedValue({
      id: 'pin_material',
      project_id: 'proj_123',
      type: 'import',
      ref_id: 'mat_source_doc',
      pinned_at: '2026-05-26T00:00:00.000Z',
    });

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));

    const file = new File(['source material'], 'launch-notes.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText(/add material file/i), {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(mocks.uploadMaterial).toHaveBeenCalledWith('proj_123', file);
      expect(mocks.addPin).toHaveBeenCalledWith('proj_123', 'import', 'mat_source_doc');
      expect(mocks.updateSelectedPins).toHaveBeenCalledWith('conv_123', null);
    });

    expect(mocks.reloadContextManifest).toHaveBeenCalled();
    expect(mocks.refreshProjectMaterials).toHaveBeenCalled();
  });

  it('archives an available uploaded material from the Materials tab', async () => {
    mocks.contextManifest = makeContextManifest();
    mocks.projectMaterials = [sourceDocumentMaterial];
    mocks.archiveMaterial.mockResolvedValue({
      ...sourceDocumentMaterial,
      content_text: sourceDocumentMaterial.content_excerpt,
      page_count: null,
      segment_count: 1,
      segments: [],
      parse_quality: {
        status: 'ready',
        score: 0.84,
        message: 'Parsed text is available.',
      },
      metadata: {},
      archived_at: '2026-05-27T00:00:00.000Z',
    });

    render(<ChatWorkspace conversationId="conv_123" projectId="proj_123" />);

    fireEvent.click(screen.getByRole('button', { name: /open sources/i }));
    fireEvent.click(screen.getByRole('tab', { name: /materials/i }));
    fireEvent.click(screen.getByRole('button', { name: /archive material launch notes/i }));

    await waitFor(() => {
      expect(mocks.archiveMaterial).toHaveBeenCalledWith('proj_123', 'mat_source_doc');
      expect(mocks.refreshProjectMaterials).toHaveBeenCalled();
      expect(mocks.reloadContextManifest).toHaveBeenCalled();
    });
  });
});
