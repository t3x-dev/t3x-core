'use client';
import {
  AlertCircle,
  FileSearch,
  GitCommit,
  Loader2,
  MessageSquarePlus,
  PanelRight,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getExtractDisabledReason } from '@/domain/extractionReadiness';
import { buildSourceMap } from '@/domain/sourceMap';
import { useCommittedHighlights } from '@/hooks/commits/useCommittedHighlights';
import { useChatInit } from '@/hooks/conversations/useChatInit';
import { useContextManifest } from '@/hooks/conversations/useContextManifest';
import {
  CONVERSATION_BRANCH_CHANGED_EVENT,
  type ConversationBranchChangedDetail,
} from '@/hooks/conversations/useConversationBranchSwitch';
import { useConversationChat } from '@/hooks/conversations/useConversationChat';
import { useConversationContextPins } from '@/hooks/conversations/useConversationContextPins';
import { useExtraction } from '@/hooks/drafts/useExtraction';
import { useProjectLeaves } from '@/hooks/leaves/useProjectLeaves';
import { useMaterialArchive } from '@/hooks/materials/useMaterialArchive';
import { useMaterialUpload } from '@/hooks/materials/useMaterialUpload';
import { useProjectMaterials } from '@/hooks/materials/useProjectMaterials';
import { useIntroDemoReplayActions } from '@/hooks/onboarding/useIntroDemoReplayActions';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useRealtimeSync } from '@/hooks/shared/useRealtimeSync';
import { useTextSelection } from '@/hooks/shared/useTextSelection';
import { useUndo } from '@/hooks/shared/useUndo';
import { useChatStore } from '@/store/chatStore';
import { usePinsStore } from '@/store/pinsStore';
import { getTemporaryChat } from '@/store/temporaryChatsStore';
import { selectScriptDirty, useWorkspaceStore } from '@/store/workspaceStore';
import type { ConversationContextManifest } from '@/types/api';
import { cn } from '@/utils/cn';
import { FeatureTourOverlay, type FeatureTourStep } from '../onboarding/FeatureTourOverlay';
import { ChatHeader } from './ChatHeader';
import type { AttachedImage } from './ChatInput';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { ChatSpanActions } from './ChatSpanActions';
import { ContextManifestBar } from './ContextManifestBar';
import { MaterialReader, type MaterialReaderSelection } from './MaterialReader';
import { ProviderSetupBanner } from './ProviderSetupBanner';

interface ChatWorkspaceProps {
  conversationId: string;
  projectId?: string;
  firstMessage?: string;
  initialProvider?: string;
  initialModel?: string;
  className?: string;
  style?: CSSProperties;
  /** Called when a new conversation is created (e.g. from /chat/new). Overrides default URL update. */
  onConversationCreated?: (conversationId: string) => void;
  /** Parent commit hash — if set, hydrate extraction panel with parent's trees */
  inheritFromCommitHash?: string;
  /** Callback to clear inheritFromCommitHash after hydration (prevents re-hydration on remount) */
  onInheritComplete?: () => void;
  activeMaterialReader?: MaterialReaderSelection | null;
  onMaterialReaderChange?: (selection: MaterialReaderSelection | null) => void;
  introDemo?: boolean;
  onIntroDemoDone?: () => void;
  onIntroDemoSkip?: () => void;
  introDemoDoneLabel?: string;
}

export const CHAT_WORKSPACE_TOUR_STEPS: FeatureTourStep[] = [
  {
    id: 'console',
    label: 'Console',
    title: 'Open the console after reading the LLM reply',
    description:
      'The reply is still plain conversation. The next step is opening the right-side console where T3X extracts reviewable meaning.',
    target: 'chat-yops-panel',
    tone: 'extract',
    icon: PanelRight,
    details: [
      'Click the collapsed Workspace rail on the right.',
      'This reveals the YOps editor and output area.',
      'Extraction controls are intentionally inside this workbench surface.',
    ],
    advanceOnTargetClick: true,
  },
  {
    id: 'extract',
    label: 'Extract',
    title: 'Click Extract to replay the preset meaning extraction',
    description:
      'In the demo this is the real Extract button, but it uses recorded fixture YOps instead of calling a model provider.',
    target: 'chat-extract-action',
    tone: 'extract',
    icon: FileSearch,
    details: [
      'The button enters an extracting state.',
      'A staged YOps proposal appears in the workspace.',
      'The user can review the result before applying it.',
    ],
    advanceOnTargetClick: true,
  },
  {
    id: 'apply',
    label: 'Apply',
    title: 'Click Apply changes to materialize the staged YOps',
    description:
      'Apply turns the staged proposal into the workspace output so the user sees the semantic tree update before commit.',
    target: 'chat-apply-action',
    tone: 'pending',
    icon: PanelRight,
    details: [
      'The staged badge clears after Apply.',
      'The output panel becomes the applied semantic state.',
      'Commit stays separate so users learn the review checkpoint.',
    ],
    advanceOnTargetClick: true,
  },
  {
    id: 'commit',
    label: 'Commit',
    title: 'Click Commit to save the applied meaning',
    description:
      'Commit creates the stable semantic version. Canvas should only come after this review checkpoint.',
    target: 'chat-commit-action',
    tone: 'commit',
    icon: GitCommit,
    details: [
      'Click the real Commit button in the workspace action bar.',
      'This opens the commit confirmation dialog.',
      'The applied output is not on Canvas until it is committed.',
    ],
    advanceOnTargetClick: true,
  },
  {
    id: 'commit-confirm',
    label: 'Confirm',
    title: 'Confirm the commit',
    description:
      'This seals the applied YAML as the version that Canvas can show in the project graph.',
    target: 'chat-commit-confirm',
    positionTarget: 'chat-commit-dialog',
    placement: 'above',
    tone: 'commit',
    icon: GitCommit,
    details: [
      'Keep the generated commit name or edit it.',
      'Click Commit in the confirmation dialog.',
      'After the commit finishes, the walkthrough moves to Canvas.',
    ],
    advanceOnTargetClick: true,
    advanceDelayMs: 520,
  },
  {
    id: 'canvas',
    label: 'Canvas',
    title: 'Now go to Canvas',
    description:
      'Only after the reply has been extracted, applied, and committed does the demo move to the project graph.',
    target: 'sidebar-canvas-tab',
    tone: 'commit',
    icon: PanelRight,
    details: [
      'Click Canvas in the sidebar mode switcher.',
      'The route will change to the project graph.',
      'The next step asks the user to click a real canvas node, then continue to Leaf.',
    ],
    advanceOnTargetClick: true,
  },
];

const INTRO_DEMO_EMPTY_TREE = { trees: [], relations: [] };
const INTRO_DEMO_ASSISTANT_REPLY = [
  'I reviewed the prompt-review intake and found the core meaning to preserve:',
  '',
  '- Refunds above $100 should go to manual review.',
  '- Replies need the order id, policy citation, and refund amount before deciding.',
  '- Tone should stay calm, precise, and policy-grounded.',
  '- The main risks are skipped citations and drift in the threshold copy.',
  '',
  'Next, open the console, extract these points into reviewable T3X meaning, then apply them before moving to Canvas.',
].join('\n');

function materialPinSourceItems(manifest: ConversationContextManifest | null) {
  return (
    manifest?.source_items.filter(
      (item) => item.role === 'evidence' && item.pinned && Boolean(item.pin_id)
    ) ?? []
  );
}

function selectedLessonAssertionIds(
  manifest: ConversationContextManifest | null,
  pinId: string
): string[] {
  return (
    manifest?.source_items
      .filter(
        (item) =>
          item.role === 'guidance' && item.pin_id === pinId && item.metadata?.selected === true
      )
      .map((item) => item.id) ?? []
  );
}

function materialDisplayTitle(material: {
  title?: string | null;
  filename?: string | null;
  id: string;
}) {
  return material.title || material.filename || material.id.slice(0, 12);
}

export function ChatWorkspace({
  conversationId,
  projectId,
  firstMessage,
  initialProvider,
  initialModel,
  className,
  style,
  onConversationCreated: onConversationCreatedProp,
  inheritFromCommitHash,
  onInheritComplete,
  activeMaterialReader,
  onMaterialReaderChange,
  introDemo = false,
  onIntroDemoDone,
  onIntroDemoSkip,
  introDemoDoneLabel,
}: ChatWorkspaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection(chatContainerRef);
  useUndo({ bindKeyboard: true });
  const isCommitted = useWorkspaceStore((s) => s.isCommitted);
  const hasYopsContent = useWorkspaceStore((s) => s.draftOps.length > 0 || s.opsLog.length > 0);
  const invalidatePins = usePinsStore((s) => s.invalidatePins);
  const conversationTitle = useChatStore((s) => s.conversationTitle);
  const activeBranch = useChatStore((s) => s.activeBranch);
  const { fetch: fetchPins, add: addPin, setAssertions } = usePinsCrud();
  const [contextManifestOpen, setContextManifestOpen] = useState(false);
  const [pinningLeafIds, setPinningLeafIds] = useState<Set<string>>(() => new Set());
  const [pinningMaterialIds, setPinningMaterialIds] = useState<Set<string>>(() => new Set());
  const [archivingMaterialIds, setArchivingMaterialIds] = useState<Set<string>>(() => new Set());
  const [coverageMode, setCoverageMode] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [contextManifestUpdating, setContextManifestUpdating] = useState(false);
  const contextManifestUpdatingRef = useRef(false);
  const firstMessageSentRef = useRef(false);
  const introDemoPreparedConversationRef = useRef<string | null>(null);
  const {
    loading: modelsLoading,
    hasConfiguredGenerationProvider,
    selectedProvider,
    selectedModel,
    handleModelChange,
    isSelectionReady,
    availabilityError,
  } = useChatModelSelection({
    initialProvider,
    initialModel,
  });

  // For "/chat/new" routes: create either a temporary local chat or a project conversation.
  const isNewChat = conversationId === 'new';
  const [resolvedProjectId, setResolvedProjectId] = useState(projectId ?? '');
  const [resolvedConversationId, setResolvedConversationId] = useState<string | undefined>(
    isNewChat ? undefined : conversationId
  );
  const isTemporaryChat = !resolvedProjectId;
  const showProjectContext = !isTemporaryChat;
  const chatInputDraftKey = resolvedConversationId
    ? isTemporaryChat
      ? `temporary:${resolvedConversationId}`
      : `conversation:${resolvedConversationId}`
    : isNewChat && resolvedProjectId
      ? `new:${resolvedProjectId}`
      : 'temporary:new';
  const pendingMessageRef = useRef<string | null>(null);

  // Real-time sync — WebSocket connection to receive backend state changes
  useRealtimeSync(resolvedProjectId ? (resolvedConversationId ?? conversationId) : null);

  const {
    manifest: contextManifest,
    loading: contextManifestLoading,
    error: contextManifestError,
    reload: reloadContextManifest,
  } = useContextManifest(showProjectContext ? resolvedConversationId : null);

  useEffect(() => {
    if (!showProjectContext || !resolvedConversationId) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ConversationBranchChangedDetail>).detail;
      if (!detail || detail.conversationId !== resolvedConversationId) return;
      if (resolvedProjectId && detail.projectId !== resolvedProjectId) return;
      void reloadContextManifest();
    };
    window.addEventListener(CONVERSATION_BRANCH_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONVERSATION_BRANCH_CHANGED_EVENT, handler);
  }, [reloadContextManifest, resolvedConversationId, resolvedProjectId, showProjectContext]);
  const { updateSelectedPins: updateContextSelectedPins } = useConversationContextPins();
  const {
    leaves: projectLeaves,
    loading: projectLeavesLoading,
    error: projectLeavesError,
  } = useProjectLeaves(
    resolvedProjectId,
    showProjectContext && contextManifestOpen && !isCommitted
  );
  const {
    materials: projectMaterials,
    loading: projectMaterialsLoading,
    error: projectMaterialsError,
    refresh: refreshProjectMaterials,
  } = useProjectMaterials(
    resolvedProjectId,
    showProjectContext && contextManifestOpen && !isCommitted
  );
  const { uploading: materialUploading, upload: uploadMaterial } = useMaterialUpload();
  const { archiveMaterial } = useMaterialArchive();

  // Load project pins for multi-source extraction
  useEffect(() => {
    if (resolvedProjectId) fetchPins(resolvedProjectId);
  }, [resolvedProjectId, fetchPins]);

  const {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    warning,
    sendMessage,
    stopGenerating,
    searchQuery,
    citations,
    thinkingContent,
    isThinking,
  } = useConversationChat({
    projectId: resolvedProjectId,
    conversationId: resolvedConversationId,
    title: conversationTitle ?? undefined,
    provider: selectedProvider ?? undefined,
    model: selectedModel ?? undefined,
    parentCommitHash: inheritFromCommitHash,
    onConversationCreated: useCallback(
      (newConvId: string) => {
        setResolvedConversationId(newConvId);
        if (onConversationCreatedProp) {
          onConversationCreatedProp(newConvId);
        } else {
          // Update URL without triggering Next.js navigation (avoids re-mount)
          const params = new URLSearchParams(window.location.search);
          params.delete('firstMessage');
          const suffix = params.toString() ? `?${params.toString()}` : '';
          window.history.replaceState(null, '', `/chat/${newConvId}${suffix}`);
        }
      },
      [onConversationCreatedProp]
    ),
  });

  // Sync resolved IDs when props change (e.g. sidebar navigation between conversations)
  useEffect(() => {
    if (projectId) setResolvedProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!isNewChat) setResolvedConversationId(conversationId);
  }, [conversationId, isNewChat]);

  useEffect(() => {
    if (!introDemo) return;
    if (isLoading || isStreaming) return;
    if (messages.length < 2 && !firstMessageSentRef.current) return;
    const timeout = window.setTimeout(() => setTourOpen(true), messages.length >= 2 ? 0 : 900);
    return () => window.clearTimeout(timeout);
  }, [introDemo, isLoading, isStreaming, messages.length]);

  // Flush pending message once projectId is resolved and sendMessage is recreated
  useEffect(() => {
    if (isCommitted) {
      pendingMessageRef.current = null;
      return;
    }
    if (
      (resolvedProjectId || isTemporaryChat) &&
      pendingMessageRef.current &&
      (introDemo || isSelectionReady)
    ) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      sendMessage(
        msg,
        introDemo
          ? { fixtureAssistantResponse: INTRO_DEMO_ASSISTANT_REPLY, skipMemoryFetch: true }
          : undefined
      );
    }
  }, [resolvedProjectId, sendMessage, isSelectionReady, isCommitted, isTemporaryChat, introDemo]);

  // Store initialization, draft loading, inheritance hydration, topic loading
  const { parentConversationId } = useChatInit({
    conversationId,
    resolvedConversationId,
    resolvedProjectId,
    setResolvedProjectId,
    inheritFromCommitHash,
    onInheritComplete,
  });

  useEffect(() => {
    if (!isTemporaryChat || !resolvedConversationId) return;
    const chat = getTemporaryChat(resolvedConversationId);
    useChatStore.getState().setConversationTitle(chat?.title ?? 'Temporary chat');
  }, [isTemporaryChat, resolvedConversationId]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Extraction handler + related state
  const { handleExtract, isExtracting } = useExtraction({
    resolvedConversationId,
    selectedProvider,
    selectedModel,
  });
  const { extract: replayIntroDemoExtract } = useIntroDemoReplayActions();

  // Precompute source map from sourceIndex — positions are already known
  // (every LLMSource carries turn_hash + start_char/end_char).
  const sourceIndex = useWorkspaceStore((s) => s.sourceIndex);
  const turns = useWorkspaceStore((s) => s.turns);
  const sourceTextDrafts = useWorkspaceStore((s) => s.sourceTextDrafts);
  const workspaceMode = useWorkspaceStore((s) => s.mode);
  const hasDraft = useWorkspaceStore((s) => s.hasDraft);
  const scriptDirty = useWorkspaceStore(selectScriptDirty);
  const baselineCommitHash = useWorkspaceStore((s) => s.baselineCommitHash);
  const workspaceConversationId = useWorkspaceStore((s) => s.conversationId);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const workspaceLastError = useWorkspaceStore((s) => s.lastError);

  useEffect(() => {
    if (!introDemo || !resolvedConversationId || isLoading) return;
    if (workspaceConversationId !== resolvedConversationId || turns.length === 0) return;
    if (introDemoPreparedConversationRef.current === resolvedConversationId) return;

    const workspace = useWorkspaceStore.getState();
    workspace.clearDraft();
    workspace.clearEditorOverride();
    workspace.setError(null);
    workspace.setRetainedDraftFailure(null);
    workspace.setReplayWarning(null);
    workspace.setMode('idle');
    workspace.setCommitted(false);
    workspace.setDerived({
      tree: INTRO_DEMO_EMPTY_TREE,
      sourceIndex: new Map(),
      opsLog: [],
      rowsById: {},
      opOrigins: [],
      baselineCommitHash: null,
      hasConversationChanges: false,
    });
    if (resolvedProjectId) workspace.setProjectPanelExpansion(resolvedProjectId, false);
    introDemoPreparedConversationRef.current = resolvedConversationId;
  }, [
    introDemo,
    isLoading,
    resolvedConversationId,
    resolvedProjectId,
    turns.length,
    workspaceConversationId,
  ]);

  const sourceMapByTurn = useMemo(() => buildSourceMap(sourceIndex, turns), [sourceIndex, turns]);
  const showAddForm =
    !isCommitted &&
    !hasDraft &&
    !scriptDirty &&
    hasYopsContent &&
    selection &&
    selection.turnRole !== 'user' &&
    selection.text.length > 3;

  // Load persistent committed highlights for this conversation
  const committedHighlightsByTurn = useCommittedHighlights(
    resolvedProjectId,
    resolvedConversationId
  );

  // Listen for extraction request (via custom event)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const disabledReason = getExtractDisabledReason({
        activeProjectId: activeProjectId || resolvedProjectId,
        workspaceConversationId,
        routeConversationId: resolvedConversationId,
        turnCount: introDemo ? Math.max(turns.length, 1) : turns.length,
        workspaceMode,
        isCommitted,
        hasDraft,
        isChatLoading: isLoading,
        isChatStreaming: isStreaming,
        modelsLoading,
        selectedProvider: introDemo ? 'fixture-replay' : selectedProvider,
        selectedModel: introDemo ? 'fixture-replay' : selectedModel,
        lastError: workspaceLastError,
      });
      if (disabledReason) {
        toast.message(disabledReason);
        return;
      }

      if (detail?.sourcePinIds) {
        // Came from source panel confirm — extract with selected pins
        if (introDemo) void replayIntroDemoExtract();
        else handleExtract(detail.sourcePinIds);
      } else if (detail?.chooseSources) {
        setContextManifestOpen(true);
      } else {
        // Default behavior: extract immediately, even when pins exist.
        if (introDemo) void replayIntroDemoExtract();
        else handleExtract();
      }
    };
    window.addEventListener('t3x:extract-requested', handler);
    return () => window.removeEventListener('t3x:extract-requested', handler);
  }, [
    activeProjectId,
    handleExtract,
    hasDraft,
    introDemo,
    isCommitted,
    isLoading,
    isStreaming,
    modelsLoading,
    resolvedConversationId,
    resolvedProjectId,
    replayIntroDemoExtract,
    selectedModel,
    selectedProvider,
    turns.length,
    workspaceConversationId,
    workspaceLastError,
    workspaceMode,
  ]);

  const selectedPinsIncludingNewPin = useCallback(
    (pinId: string): string[] | null => {
      const materials = materialPinSourceItems(contextManifest);
      if (materials.length === 0) return null;

      const selectedPinIds = new Set(
        materials.flatMap((item) => (item.included && item.pin_id ? [item.pin_id] : []))
      );
      if (materials.every((item) => item.pin_id && selectedPinIds.has(item.pin_id))) return null;

      selectedPinIds.add(pinId);
      return Array.from(selectedPinIds);
    },
    [contextManifest]
  );

  const handlePinLeafForContext = useCallback(
    async (leafId: string) => {
      if (!resolvedProjectId) return;

      const existing = usePinsStore.getState().getPinByRef('leaf', leafId);
      if (existing) {
        if (resolvedConversationId) {
          await updateContextSelectedPins(
            resolvedConversationId,
            selectedPinsIncludingNewPin(existing.id)
          );
          await reloadContextManifest();
        }
        return;
      }

      setPinningLeafIds((prev) => {
        const next = new Set(prev);
        next.add(leafId);
        return next;
      });

      try {
        const created = await addPin(resolvedProjectId, 'leaf', leafId);
        if (created && resolvedConversationId) {
          await updateContextSelectedPins(
            resolvedConversationId,
            selectedPinsIncludingNewPin(created.id)
          );
        }
        if (created) await reloadContextManifest();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to pin leaf';
        toast.message(message);
      } finally {
        setPinningLeafIds((prev) => {
          const next = new Set(prev);
          next.delete(leafId);
          return next;
        });
      }
    },
    [
      addPin,
      reloadContextManifest,
      resolvedConversationId,
      resolvedProjectId,
      selectedPinsIncludingNewPin,
      updateContextSelectedPins,
    ]
  );

  const handlePinMaterialForContext = useCallback(
    async (materialId: string) => {
      if (!resolvedProjectId) return;

      const existing = usePinsStore.getState().getPinByRef('import', materialId);
      if (existing) {
        if (resolvedConversationId) {
          await updateContextSelectedPins(
            resolvedConversationId,
            selectedPinsIncludingNewPin(existing.id)
          );
          await reloadContextManifest();
        }
        return;
      }

      setPinningMaterialIds((prev) => {
        const next = new Set(prev);
        next.add(materialId);
        return next;
      });

      try {
        const created = await addPin(resolvedProjectId, 'import', materialId);
        if (created && resolvedConversationId) {
          await updateContextSelectedPins(
            resolvedConversationId,
            selectedPinsIncludingNewPin(created.id)
          );
        }
        if (created) {
          invalidatePins();
          await fetchPins(resolvedProjectId);
          await reloadContextManifest();
          await refreshProjectMaterials();
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to use material';
        toast.message(message);
      } finally {
        setPinningMaterialIds((prev) => {
          const next = new Set(prev);
          next.delete(materialId);
          return next;
        });
      }
    },
    [
      addPin,
      fetchPins,
      invalidatePins,
      reloadContextManifest,
      refreshProjectMaterials,
      resolvedConversationId,
      resolvedProjectId,
      selectedPinsIncludingNewPin,
      updateContextSelectedPins,
    ]
  );

  const handleUploadMaterial = useCallback(
    async (file: File) => {
      if (!resolvedProjectId) return;

      try {
        const material = await uploadMaterial(resolvedProjectId, file);
        await refreshProjectMaterials();
        await handlePinMaterialForContext(material.id);
        toast.message('Material added to context');
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to add material';
        toast.message(message);
      }
    },
    [handlePinMaterialForContext, refreshProjectMaterials, resolvedProjectId, uploadMaterial]
  );

  const handleArchiveMaterial = useCallback(
    async (materialId: string) => {
      if (!resolvedProjectId) return;

      setArchivingMaterialIds((prev) => {
        const next = new Set(prev);
        next.add(materialId);
        return next;
      });

      try {
        await archiveMaterial(resolvedProjectId, materialId);
        await refreshProjectMaterials();
        await reloadContextManifest();
        toast.message('Material archived');
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to archive material';
        toast.message(message);
      } finally {
        setArchivingMaterialIds((prev) => {
          const next = new Set(prev);
          next.delete(materialId);
          return next;
        });
      }
    },
    [archiveMaterial, refreshProjectMaterials, reloadContextManifest, resolvedProjectId]
  );

  const materialReaderContext = useMemo(() => {
    if (!activeMaterialReader) return null;

    const sourceItem = contextManifest?.source_items.find(
      (item) =>
        item.role === 'evidence' &&
        (item.kind === 'import' || item.kind === 'file') &&
        item.id === activeMaterialReader.materialId
    );
    const projectMaterial = projectMaterials.find(
      (material) => material.id === activeMaterialReader.materialId
    );

    return {
      title:
        sourceItem?.title ??
        (projectMaterial ? materialDisplayTitle(projectMaterial) : activeMaterialReader.materialId),
      included: sourceItem?.included ?? false,
      pinId: sourceItem?.pin_id ?? null,
    };
  }, [activeMaterialReader, contextManifest, projectMaterials]);

  const materialReaderSelection = useMemo<MaterialReaderSelection | null>(() => {
    if (!activeMaterialReader) return null;
    return {
      projectId: activeMaterialReader.projectId,
      materialId: activeMaterialReader.materialId,
      context: materialReaderContext,
    };
  }, [activeMaterialReader, materialReaderContext]);

  useEffect(() => {
    if (!materialReaderSelection || !activeMaterialReader || !onMaterialReaderChange) return;
    const current = activeMaterialReader.context;
    const next = materialReaderSelection.context;
    if (
      current?.title === next?.title &&
      current?.included === next?.included &&
      current?.pinId === next?.pinId
    ) {
      return;
    }
    onMaterialReaderChange(materialReaderSelection);
  }, [activeMaterialReader, materialReaderSelection, onMaterialReaderChange]);

  const handleOpenMaterialReader = useCallback(
    (materialId: string) => {
      if (!resolvedProjectId) return;

      const sourceItem = contextManifest?.source_items.find(
        (item) =>
          item.role === 'evidence' &&
          (item.kind === 'import' || item.kind === 'file') &&
          item.id === materialId
      );
      const projectMaterial = projectMaterials.find((material) => material.id === materialId);

      onMaterialReaderChange?.({
        projectId: resolvedProjectId,
        materialId,
        context: {
          title:
            sourceItem?.title ??
            (projectMaterial ? materialDisplayTitle(projectMaterial) : materialId),
          included: sourceItem?.included ?? false,
          pinId: sourceItem?.pin_id ?? null,
        },
      });
      setContextManifestOpen(false);
    },
    [contextManifest, onMaterialReaderChange, projectMaterials, resolvedProjectId]
  );

  const handleCloseMaterialReader = useCallback(() => {
    onMaterialReaderChange?.(null);
  }, [onMaterialReaderChange]);

  const baselineForSourcePanel = useMemo(() => {
    const expectedBaselineHash = baselineCommitHash ?? inheritFromCommitHash ?? null;
    const manifestBaseline =
      contextManifest?.baseline.source === 'parent_commit' &&
      contextManifest.baseline.commit_hash === expectedBaselineHash
        ? contextManifest.baseline
        : null;
    const commitHash = expectedBaselineHash;
    if (!commitHash) return undefined;

    return {
      commitHash,
      branch: manifestBaseline?.branch ?? activeBranch ?? null,
      parentConversationId,
    };
  }, [
    activeBranch,
    baselineCommitHash,
    contextManifest,
    inheritFromCommitHash,
    parentConversationId,
  ]);

  // Send firstMessage on mount (once only)
  useEffect(() => {
    if (firstMessage && !firstMessageSentRef.current && !isLoading) {
      firstMessageSentRef.current = true;
      pendingMessageRef.current = firstMessage;

      if (introDemo || isSelectionReady) {
        pendingMessageRef.current = null;
        sendMessage(
          firstMessage,
          introDemo
            ? { fixtureAssistantResponse: INTRO_DEMO_ASSISTANT_REPLY, skipMemoryFetch: true }
            : undefined
        );
      }
    }
  }, [firstMessage, introDemo, isLoading, sendMessage, isSelectionReady]);

  const handleSend = useCallback(
    async (message: string, images?: AttachedImage[]) => {
      if (isCommitted) {
        pendingMessageRef.current = null;
        return;
      }
      if (!introDemo && !isSelectionReady) {
        pendingMessageRef.current = message;
        return;
      }

      sendMessage(
        message,
        introDemo
          ? { fixtureAssistantResponse: INTRO_DEMO_ASSISTANT_REPLY, skipMemoryFetch: true }
          : images
            ? { images }
            : undefined
      );
    },
    [sendMessage, introDemo, isSelectionReady, isCommitted]
  );

  const handleContextReferenceToggle = useCallback(
    async (pinId: string, included: boolean) => {
      if (!resolvedConversationId || !contextManifest || contextManifestUpdatingRef.current) return;

      const selectedPinIds = new Set(
        materialPinSourceItems(contextManifest).flatMap((item) =>
          item.included && item.pin_id ? [item.pin_id] : []
        )
      );
      if (included) {
        selectedPinIds.add(pinId);
      } else {
        selectedPinIds.delete(pinId);
      }

      const allReferencePinIds = materialPinSourceItems(contextManifest).flatMap((item) =>
        item.pin_id ? [item.pin_id] : []
      );
      const nextSelectedPinIds =
        allReferencePinIds.length > 0 &&
        allReferencePinIds.every((referencePinId) => selectedPinIds.has(referencePinId))
          ? null
          : Array.from(selectedPinIds);

      contextManifestUpdatingRef.current = true;
      setContextManifestUpdating(true);
      try {
        await updateContextSelectedPins(resolvedConversationId, nextSelectedPinIds);
        await reloadContextManifest();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to update context';
        toast.message(message);
      } finally {
        contextManifestUpdatingRef.current = false;
        setContextManifestUpdating(false);
      }
    },
    [contextManifest, reloadContextManifest, resolvedConversationId, updateContextSelectedPins]
  );

  const handleContextAssertionToggle = useCallback(
    async (pinId: string, assertionId: string, included: boolean) => {
      if (!contextManifest || contextManifestUpdatingRef.current) return;

      const selectedAssertionIds = new Set(selectedLessonAssertionIds(contextManifest, pinId));
      if (included) {
        selectedAssertionIds.add(assertionId);
      } else {
        selectedAssertionIds.delete(assertionId);
      }

      contextManifestUpdatingRef.current = true;
      setContextManifestUpdating(true);
      try {
        const updatedPin = await setAssertions(pinId, Array.from(selectedAssertionIds));
        if (!updatedPin) {
          toast.message('Failed to update feedback');
          return;
        }

        if (resolvedProjectId) {
          invalidatePins();
          await fetchPins(resolvedProjectId);
        }
        await reloadContextManifest();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Failed to update feedback';
        toast.message(message);
      } finally {
        contextManifestUpdatingRef.current = false;
        setContextManifestUpdating(false);
      }
    },
    [
      contextManifest,
      fetchPins,
      invalidatePins,
      reloadContextManifest,
      resolvedProjectId,
      setAssertions,
    ]
  );

  return (
    <div
      className={cn('flex flex-col h-full min-h-0 relative', className)}
      style={style}
      data-intro-target="chat-workspace"
    >
      {/* Header */}
      <div data-intro-target="chat-header">
        <ChatHeader
          conversationId={resolvedConversationId ?? null}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel ?? ''}
          onModelChange={handleModelChange}
          isChatLoading={isLoading}
          isChatStreaming={isStreaming}
          modelsLoading={modelsLoading}
        />
      </div>

      {showProjectContext && materialReaderSelection ? (
        <MaterialReader
          selection={materialReaderSelection}
          onBack={handleCloseMaterialReader}
          onAddToChat={handlePinMaterialForContext}
          onRemoveFromChat={(pinId) => handleContextReferenceToggle(pinId, false)}
          disabled={contextManifestUpdating}
        />
      ) : (
        <>
          {showProjectContext && (
            <div data-intro-target="chat-sources">
              <ContextManifestBar
                manifest={contextManifest}
                loading={contextManifestLoading}
                error={contextManifestError}
                open={contextManifestOpen}
                updating={contextManifestUpdating}
                baselineOverride={baselineForSourcePanel}
                sourcePicker={
                  isCommitted
                    ? undefined
                    : {
                        availableLeaves: projectLeaves,
                        availableLeavesLoading: projectLeavesLoading,
                        availableLeavesError: projectLeavesError,
                        availableMaterials: projectMaterials,
                        availableMaterialsLoading: projectMaterialsLoading,
                        availableMaterialsError: projectMaterialsError,
                        leafPinningIds: pinningLeafIds,
                        materialPinningIds: pinningMaterialIds,
                        materialArchivingIds: archivingMaterialIds,
                        materialUploading,
                        baseline: baselineForSourcePanel,
                        onPinLeaf: handlePinLeafForContext,
                        onPinMaterial: handlePinMaterialForContext,
                        onArchiveMaterial: handleArchiveMaterial,
                        onUploadMaterial: handleUploadMaterial,
                        onOpenMaterial: handleOpenMaterialReader,
                      }
                }
                onOpenChange={setContextManifestOpen}
                onReload={reloadContextManifest}
                onReferenceToggle={handleContextReferenceToggle}
                onAssertionToggle={handleContextAssertionToggle}
              />
            </div>
          )}

          {/* Coverage toggle — visible after extraction */}
          {sourceMapByTurn.size > 0 && (
            <button
              type="button"
              onClick={() => setCoverageMode((p) => !p)}
              className={cn(
                'absolute top-24 right-4 z-10 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border transition-colors',
                coverageMode
                  ? 'bg-[var(--status-warning)]/10 border-[var(--status-warning)]/30 text-[var(--status-warning)]'
                  : 'bg-[var(--surface-elevated)] border-[var(--stroke-default)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              )}
            >
              {coverageMode ? 'Hide coverage' : 'Show coverage'}
            </button>
          )}

          {/* Message list */}
          <div
            ref={chatContainerRef}
            data-testid="chat-message-scroll"
            data-intro-target="chat-thread"
            className="chat-scrollbar flex-1 overflow-y-auto overflow-x-hidden bg-[var(--chat-panel)]"
          >
            {/* Parent conversation banner */}
            {parentConversationId && (
              <div className="w-full py-2 bg-[var(--accent-commit)]/5 border-b border-[var(--accent-commit)]/10">
                <div className="mx-auto flex max-w-[620px] items-center gap-2 px-5 text-xs text-[var(--text-secondary)]">
                  <GitCommit size={12} className="text-[var(--accent-commit)]" />
                  <span>Continuing from previous commit</span>
                  <a
                    href={`/chat/${parentConversationId}`}
                    className="text-[var(--accent-commit)] hover:underline font-medium"
                  >
                    View parent conversation
                  </a>
                </div>
              </div>
            )}
            {isLoading ? (
              <div className="flex h-full flex-col items-center justify-center text-[var(--text-tertiary)] gap-2">
                <Loader2 size={40} strokeWidth={1} className="animate-spin" />
                <p className="text-sm font-medium">Loading conversation...</p>
              </div>
            ) : messages.length === 0 && !isStreaming ? (
              <div className="flex h-full flex-col items-center justify-center text-[var(--text-tertiary)] gap-2">
                {!modelsLoading && !hasConfiguredGenerationProvider && (
                  <div className="w-full max-w-[620px] px-5 pb-2">
                    <ProviderSetupBanner
                      variant={
                        availabilityError === 'api_unavailable' ? 'api-unavailable' : 'setup'
                      }
                    />
                  </div>
                )}
                <MessageSquarePlus size={40} strokeWidth={1} />
                <p className="text-sm font-medium text-[var(--text-primary)]">No messages yet</p>
                <span className="text-xs text-[var(--text-tertiary)]">
                  Type a message below to start the conversation
                </span>
              </div>
            ) : (
              <div className="space-y-1 py-2">
                {messages.map((msg, i) => {
                  const sourceDraft = sourceTextDrafts[msg.id];
                  return (
                    <ChatMessage
                      key={msg.id}
                      sender={msg.role}
                      content={sourceDraft?.content ?? msg.content}
                      projectId={msg.projectId}
                      conversationId={msg.conversationId}
                      turnHash={msg.id}
                      turnIndex={i + 1}
                      citations={
                        msg.role === 'assistant' && i === messages.length - 1
                          ? citations
                          : undefined
                      }
                      sourceMap={sourceMapByTurn.get(i + 1)}
                      committedHighlights={committedHighlightsByTurn.get(msg.id)}
                      inlineEditSpans={sourceDraft?.spans}
                      coverageMode={coverageMode}
                    />
                  );
                })}

                {/* Search indicator */}
                {searchQuery && (
                  <div className="mx-auto flex max-w-[620px] items-center gap-2 px-5 py-2 text-xs text-[var(--text-tertiary)]">
                    <span className="animate-spin h-3 w-3 border border-[var(--text-tertiary)] border-t-transparent rounded-full" />
                    Searching: {searchQuery}
                  </div>
                )}

                {/* Streaming response */}
                {isStreaming && streamingContent && (
                  <ChatMessage
                    sender="assistant"
                    content={streamingContent}
                    isStreaming
                    thinkingContent={thinkingContent}
                    isThinking={isThinking}
                  />
                )}

                {/* Waiting indicator */}
                {isStreaming && !streamingContent && (
                  <div className="w-full py-4">
                    <div className="mx-auto max-w-[620px] px-5">
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-conversation-soft)] text-xs font-medium text-[var(--accent-conversation)] ring-1 ring-[var(--accent-conversation)]/20">
                          T3
                        </div>
                        <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-sm pt-1">
                          <div className="flex gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:0ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:150ms]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="w-full py-3">
                    <div className="mx-auto max-w-[620px] px-5">
                      <div className="flex items-center gap-2 py-2.5 px-3.5 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-lg text-[var(--status-error)] text-xs">
                        <AlertCircle size={14} />
                        <span>{error}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Non-critical warning */}
                {warning && !error && (
                  <div className="w-full py-3">
                    <div className="mx-auto max-w-[620px] px-5">
                      <div className="flex items-center gap-2 py-2 px-3.5 bg-[var(--status-warning-muted)] border border-[var(--status-warning)]/20 rounded-lg text-[var(--status-warning)] text-xs">
                        <AlertCircle size={14} />
                        <span>{warning}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Inline source-text actions require an extracted/applied YOps context. */}
          {showAddForm && selection && (
            <ChatSpanActions selection={selection} onDone={clearSelection} />
          )}

          {/* Input area — committed conversations are read-only after commit */}
          {!isCommitted && (
            <div
              className="shrink-0 bg-[var(--chat-panel)] pb-3 pt-4"
              data-intro-target="chat-composer"
            >
              <div className="relative mx-auto max-w-[540px] px-5">
                <ChatInput
                  onSend={handleSend}
                  onStop={stopGenerating}
                  isStreaming={isStreaming}
                  draftKey={chatInputDraftKey}
                  disabled={
                    isLoading ||
                    isExtracting ||
                    (!introDemo && (modelsLoading || !selectedProvider || !selectedModel))
                  }
                  placeholder="Reply..."
                  conversationId={resolvedConversationId}
                  selectedProvider={selectedProvider ?? ''}
                  selectedModel={selectedModel ?? ''}
                  onModelChange={handleModelChange}
                  sendIntroTarget={introDemo ? 'chat-send-action' : undefined}
                />
              </div>
            </div>
          )}
        </>
      )}
      <FeatureTourOverlay
        open={tourOpen}
        title="Chat walkthrough"
        steps={CHAT_WORKSPACE_TOUR_STEPS}
        onClose={() => setTourOpen(false)}
        onDone={onIntroDemoDone ?? (() => setTourOpen(false))}
        onSkip={onIntroDemoSkip}
        doneLabel={introDemoDoneLabel}
        interactionMode={introDemo ? 'guided' : 'coach'}
      />
    </div>
  );
}
