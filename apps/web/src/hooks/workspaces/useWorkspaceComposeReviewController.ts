import type { ChangeProjectionV1, ReviewSnapshotV1 } from '@t3x-dev/api-client';
import type { TransitionViewV1 } from '@t3x-dev/core';
import * as yaml from 'js-yaml';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { providerSupports } from '@/domain/providerCapabilities';
import { useMaterialUpload } from '@/hooks/materials/useMaterialUpload';
import { usePinsCrud } from '@/hooks/pins/usePinsCrud';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useSourceThreadGeneration } from '@/hooks/sourceThreads/useSourceThreadGeneration';
import { validateWorkspaceCandidateYOps } from '@/hooks/workspaces/useWorkspaceYOps';
import type {
  WorkspaceDraftCommand,
  WorkspaceTransitionCommandResults,
  WorkspaceTransitionContent,
  WorkspaceTransitionOutcome,
  WorkspaceTransitionPrecondition,
} from '@/infrastructure/workspaces';
import { decideWorkspaceTransition, reviewWorkspaceTransition } from '@/queries/workspaces';
import { useChatSessionStore } from '@/store/chatSessionStore';
import { usePinsStore } from '@/store/pinsStore';
import type { Material } from '@/types/api';
import type {
  SourceBundleItem,
  SourceConversationTurn,
  WorkspaceCandidate,
} from '@/types/workspaces';
import type { WorkspaceYOpsValidationResult } from '@/types/workspaceYops';

export interface WorkspacePreparationOptions {
  instruction?: string;
  provider?: string;
  model?: string;
}

export type WorkspaceDraftCommandName = WorkspaceDraftCommand;

export interface WorkspaceComposeReviewMessage {
  author: string;
  content: string;
  id: string;
  role: 'assistant' | 'user';
}

export interface WorkspaceReviewSessionState {
  changeProjection: ChangeProjectionV1 | null;
  commands: WorkspaceTransitionCommandResults | null;
  content: WorkspaceTransitionContent | null;
  deterministicValidation: WorkspaceYOpsValidationResult | null;
  precondition: WorkspaceTransitionPrecondition | null;
  reviewSnapshot: ReviewSnapshotV1 | null;
  transitionId: string | null;
  view: TransitionViewV1 | null;
}

export interface WorkspaceComposeReviewControllerOptions {
  candidate: WorkspaceCandidate;
  flowError?: string;
  onApplyAfterRefresh?: (workspace: WorkspaceCandidate) => Promise<WorkspaceCandidate>;
  onChatSourceEvidenceChange?: (sourceId: string, source: SourceBundleItem | null) => void;
  onDraftCommand?: (
    workspace: WorkspaceCandidate,
    command: WorkspaceDraftCommand
  ) => Promise<WorkspaceCandidate>;
  onPrepareDraft?: (
    workspace: WorkspaceCandidate,
    options: WorkspacePreparationOptions
  ) => Promise<WorkspaceCandidate>;
  onScenarioArchive?: () => Promise<void>;
  onScenarioCreate?: (name: string, duplicate: boolean) => Promise<void>;
  onScenarioRename?: (name: string) => Promise<void>;
  onScenarioSelect?: (workspaceId: string) => void;
  onSourceMaterialUploaded?: () => Promise<void> | void;
  onViewCommitInState?: (commitHash: string, branch: string) => void;
  onYOpsCommitted?: (commitHash: string, branch: string, workspace: WorkspaceCandidate) => void;
  sourceConversationId?: string;
  sourceParentCommitHash?: string;
  scenarioOptions?: WorkspaceCandidate[];
}

const EMPTY_REVIEW: WorkspaceReviewSessionState = {
  changeProjection: null,
  commands: null,
  content: null,
  deterministicValidation: null,
  precondition: null,
  reviewSnapshot: null,
  transitionId: null,
  view: null,
};

export function useWorkspaceComposeReviewController({
  candidate,
  flowError,
  onApplyAfterRefresh,
  onChatSourceEvidenceChange,
  onDraftCommand,
  onPrepareDraft,
  onScenarioArchive,
  onScenarioCreate,
  onScenarioRename,
  onScenarioSelect,
  onSourceMaterialUploaded,
  onViewCommitInState,
  onYOpsCommitted,
  sourceConversationId: sourceConversationIdProp,
  sourceParentCommitHash,
  scenarioOptions = [],
}: WorkspaceComposeReviewControllerOptions) {
  const [workingCandidate, setWorkingCandidate] = useState(candidate);
  const [sourceConversationId, setSourceConversationId] = useState(
    sourceConversationIdProp ?? findSourceConversationId(candidate)
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<WorkspaceReviewSessionState>(EMPTY_REVIEW);
  const [decisionReason, setDecisionReason] = useState('');
  const [hasCollaborationConflict, setHasCollaborationConflict] = useState(false);
  const reviewGenerationRef = useRef(0);
  const activeCandidateIdRef = useRef(candidate.id);

  const modelSelection = useChatModelSelection({});
  const thinkingEnabled = useChatSessionStore((state) => state.thinkingEnabled);
  const setThinking = useChatSessionStore((state) => state.setThinking);
  const supportsThinking = providerSupports(modelSelection.selectedProvider ?? '', 'thinking');
  const materialUpload = useMaterialUpload();
  const pinsCrud = usePinsCrud();
  const pins = usePinsStore((state) => state.pins);

  useEffect(() => {
    if (!supportsThinking && thinkingEnabled) setThinking(false);
  }, [supportsThinking, thinkingEnabled, setThinking]);

  useEffect(() => {
    const candidateChanged = activeCandidateIdRef.current !== candidate.id;
    activeCandidateIdRef.current = candidate.id;
    if (candidateChanged) {
      reviewGenerationRef.current += 1;
      setWorkingCandidate(candidate);
      setSourceConversationId(sourceConversationIdProp ?? findSourceConversationId(candidate));
      setReview(EMPTY_REVIEW);
      setDecisionReason('');
      setHasCollaborationConflict(false);
      setLocalError(null);
      setNotice(null);
      return;
    }
    setWorkingCandidate((current) =>
      candidate.revision === undefined || (current.revision ?? -1) <= candidate.revision
        ? candidate
        : current
    );
  }, [candidate, sourceConversationIdProp]);

  useEffect(() => {
    if (sourceConversationIdProp) setSourceConversationId(sourceConversationIdProp);
  }, [sourceConversationIdProp]);

  useEffect(() => {
    void pinsCrud.fetch(candidate.projectId);
  }, [candidate.projectId, pinsCrud.fetch]);

  const chat = useSourceThreadGeneration({
    projectId: candidate.projectId,
    conversationId: sourceConversationId,
    title: `${candidate.title} source chat`,
    provider: modelSelection.selectedProvider ?? undefined,
    model: modelSelection.selectedModel ?? undefined,
    parentCommitHash: sourceParentCommitHash,
    onConversationCreated: setSourceConversationId,
  });

  const rawMessages = useMemo(() => {
    if (chat.messages.length > 0) return chat.messages;
    const source = workingCandidate.sourceBundle.find(
      (item) =>
        item.type === 'chat' &&
        (!sourceConversationId || item.conversationId === sourceConversationId)
    );
    return (source?.previewTurns ?? []).map((turn) => ({
      id: turn.id,
      role: turn.role,
      content: turn.content,
      conversationId: turn.conversationId,
      projectId: turn.projectId,
      rings: turn.rings,
    }));
  }, [chat.messages, sourceConversationId, workingCandidate.sourceBundle]);

  const materialSources = useMemo(
    () =>
      workingCandidate.sourceBundle
        .filter((source) => Boolean(source.materialId))
        .map((source) => ({
          id: source.id,
          included: pins.some((pin) => pin.type === 'import' && pin.ref_id === source.materialId),
          materialId: source.materialId as string,
          title: source.title,
        })),
    [pins, workingCandidate.sourceBundle]
  );

  const persistedSourceTurns = useMemo(
    () => rawMessages.filter((message) => isPersistedTurnId(message.id)).map(messageToSourceTurn),
    [rawMessages]
  );

  const messages = useMemo<WorkspaceComposeReviewMessage[]>(() => {
    const persisted = rawMessages.map((message) => ({
      author: message.role === 'user' ? 'You' : 'Assistant',
      content: message.content,
      id: message.id,
      role: message.role,
    }));
    if (chat.streamingContent.trim()) {
      persisted.push({
        author: 'Assistant',
        content: chat.streamingContent,
        id: `${sourceConversationId ?? candidate.id}:streaming`,
        role: 'assistant',
      });
    }
    return persisted;
  }, [candidate.id, chat.streamingContent, rawMessages, sourceConversationId]);

  const persistCandidate = useCallback(
    async (nextCandidate: WorkspaceCandidate, command: WorkspaceDraftCommand) => {
      setWorkingCandidate(nextCandidate);
      if (command !== 'review.prepare') setReview(EMPTY_REVIEW);
      if (!onDraftCommand) return nextCandidate;
      try {
        const saved = await onDraftCommand(nextCandidate, command);
        setWorkingCandidate(saved);
        setHasCollaborationConflict(false);
        return saved;
      } catch (error) {
        if (/changed since it was loaded|revision|conflict/i.test(String(error))) {
          setHasCollaborationConflict(true);
        }
        throw error;
      }
    },
    [onDraftCommand]
  );

  const resolveCollaborationConflict = useCallback(async () => {
    if (!onApplyAfterRefresh || busyAction) return false;
    setBusyAction('collaboration.apply_after_refresh');
    setLocalError(null);
    try {
      const saved = await onApplyAfterRefresh(workingCandidate);
      setWorkingCandidate(saved);
      setHasCollaborationConflict(false);
      setNotice('Remote revision refreshed and the local draft was applied with CAS.');
      return true;
    } catch (error) {
      setLocalError(formatUserFacingError(error, 'Unable to apply after refresh.'));
      return false;
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, onApplyAfterRefresh, workingCandidate]);

  const runScenarioAction = useCallback(
    async (action: string, callback: () => Promise<void>) => {
      if (busyAction) return false;
      setBusyAction(action);
      setLocalError(null);
      try {
        await callback();
        setNotice('Scenario updated.');
        return true;
      } catch (error) {
        setLocalError(formatUserFacingError(error, 'Scenario update failed.'));
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction]
  );

  const chatSourceSyncInFlightRef = useRef<{
    promise: Promise<WorkspaceCandidate>;
    signature: string;
  } | null>(null);
  const scheduledAutoChatSourceSyncRef = useRef<string | null>(null);
  const failedAutoChatSourceSyncRef = useRef<string | null>(null);

  const syncChatSource = useCallback(
    async (turns: readonly SourceConversationTurn[]) => {
      const sourceId = getSourceChatSourceId(workingCandidate.id, sourceConversationId);
      const source = buildChatSourceBundle(
        sourceId,
        workingCandidate.title,
        sourceConversationId,
        turns
      );
      const existingSource = findChatSource(workingCandidate.sourceBundle, sourceId);
      if (chatSourceMatches(existingSource, source)) return workingCandidate;
      const signature = chatSourceSignature(source);
      if (chatSourceSyncInFlightRef.current?.signature === signature) {
        return chatSourceSyncInFlightRef.current.promise;
      }
      onChatSourceEvidenceChange?.(sourceId, source);
      const nextCandidate = invalidateWorkspaceProposal({
        ...workingCandidate,
        sourceBundle: upsertSource(workingCandidate.sourceBundle, sourceId, source),
      });
      const promise = persistCandidate(nextCandidate, 'source.include').finally(() => {
        if (chatSourceSyncInFlightRef.current?.signature === signature) {
          chatSourceSyncInFlightRef.current = null;
        }
      });
      chatSourceSyncInFlightRef.current = { promise, signature };
      return promise;
    },
    [onChatSourceEvidenceChange, persistCandidate, sourceConversationId, workingCandidate]
  );

  useEffect(() => {
    if (persistedSourceTurns.length === 0) return;
    const sourceId = getSourceChatSourceId(workingCandidate.id, sourceConversationId);
    const source = buildChatSourceBundle(
      sourceId,
      workingCandidate.title,
      sourceConversationId,
      persistedSourceTurns
    );
    if (chatSourceMatches(findChatSource(workingCandidate.sourceBundle, sourceId), source)) return;

    const signature = chatSourceSignature(source);
    if (scheduledAutoChatSourceSyncRef.current === signature) {
      return;
    }
    if (failedAutoChatSourceSyncRef.current === signature) {
      return;
    }

    scheduledAutoChatSourceSyncRef.current = signature;
    void syncChatSource(persistedSourceTurns)
      .then(() => {
        failedAutoChatSourceSyncRef.current = null;
      })
      .catch((error) => {
        scheduledAutoChatSourceSyncRef.current = null;
        failedAutoChatSourceSyncRef.current = signature;
        setLocalError(formatUserFacingError(error, 'Workspace chat source sync failed.'));
      });
  }, [
    persistedSourceTurns,
    sourceConversationId,
    syncChatSource,
    workingCandidate.id,
    workingCandidate.sourceBundle,
    workingCandidate.title,
  ]);

  const addMaterial = useCallback(
    async (material: Material) => {
      await pinsCrud.add(candidate.projectId, 'import', material.id);
      if (
        !usePinsStore
          .getState()
          .pins.some((pin) => pin.type === 'import' && pin.ref_id === material.id)
      ) {
        throw new Error('Uploaded material could not be included.');
      }
      const source = materialToSourceBundleItem(material);
      const nextCandidate = invalidateWorkspaceProposal({
        ...workingCandidate,
        sourceBundle: upsertSource(workingCandidate.sourceBundle, source.id, source),
      });
      await persistCandidate(nextCandidate, 'source.add');
      await onSourceMaterialUploaded?.();
      setNotice(`${material.title} added as source evidence.`);
    },
    [candidate.projectId, onSourceMaterialUploaded, persistCandidate, pinsCrud, workingCandidate]
  );

  const toggleMaterialSource = useCallback(
    async (materialId: string) => {
      if (busyAction) return;
      setBusyAction(`source:material:${materialId}`);
      setLocalError(null);
      try {
        const existing = usePinsStore
          .getState()
          .pins.find((pin) => pin.type === 'import' && pin.ref_id === materialId);
        if (existing) await pinsCrud.remove(existing.id);
        else await pinsCrud.add(candidate.projectId, 'import', materialId);
        const included = usePinsStore
          .getState()
          .pins.some((pin) => pin.type === 'import' && pin.ref_id === materialId);
        if ((!existing && !included) || (existing && included)) {
          throw new Error(
            existing ? 'Material could not be excluded.' : 'Material could not be included.'
          );
        }
        await persistCandidate(invalidateWorkspaceProposal(workingCandidate), 'source.include');
        setNotice(included ? 'Material included as source evidence.' : 'Material excluded.');
      } catch (error) {
        setLocalError(formatUserFacingError(error, 'Material source update failed.'));
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, candidate.projectId, persistCandidate, pinsCrud, workingCandidate]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const unsupported = unsupportedWorkspaceMaterialMessage(file);
      if (unsupported) {
        setLocalError(unsupported);
        return false;
      }
      setBusyAction('source:file');
      setLocalError(null);
      try {
        await addMaterial(await materialUpload.upload(candidate.projectId, file));
        return true;
      } catch (error) {
        setLocalError(formatUserFacingError(error, 'Material upload failed.'));
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [addMaterial, candidate.projectId, materialUpload]
  );

  const addUrl = useCallback(
    async (url: string, title?: string) => {
      if (!url.trim()) return false;
      setBusyAction('source:url');
      setLocalError(null);
      try {
        await addMaterial(
          await materialUpload.uploadUrl(candidate.projectId, url.trim(), title?.trim())
        );
        return true;
      } catch (error) {
        setLocalError(formatUserFacingError(error, 'URL source import failed.'));
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [addMaterial, candidate.projectId, materialUpload]
  );

  const addPaste = useCallback(
    async (title: string, text: string) => {
      const content = text.trim();
      if (!content) return false;
      const safeTitle = title.trim() || 'Pasted source note';
      const slug =
        safeTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 48) || 'pasted-source-note';
      return uploadFile(new File([content], `${slug}.txt`, { type: 'text/plain' }));
    },
    [uploadFile]
  );

  const prepareReview = useCallback(async () => {
    if (!onPrepareDraft || busyAction) return false;
    const generation = reviewGenerationRef.current + 1;
    reviewGenerationRef.current = generation;
    setReview(EMPTY_REVIEW);
    setBusyAction('review.prepare');
    setLocalError(null);
    setNotice('Preparing the exact deterministic result…');
    try {
      const sourceSyncedCandidate =
        persistedSourceTurns.length > 0
          ? await syncChatSource(persistedSourceTurns)
          : workingCandidate;
      const prepared = await onPrepareDraft(sourceSyncedCandidate, {
        instruction: chat.input.trim() || undefined,
        provider: modelSelection.selectedProvider ?? undefined,
        model: modelSelection.selectedModel ?? undefined,
      });
      if (generation !== reviewGenerationRef.current) return false;
      setWorkingCandidate(prepared);
      if (prepared.yopsDraft.operations.length === 0) {
        throw new Error('No YOps operations were generated from the selected source evidence.');
      }

      const deterministicValidation = await validateWorkspaceCandidateYOps(prepared);
      if (!deterministicValidation.ok) {
        throw new Error(
          deterministicValidation.error?.message ?? 'Deterministic YOps validation failed.'
        );
      }
      const content = {
        trees: deterministicValidation.previewTrees ?? deterministicValidation.baselineTrees,
        relations:
          deterministicValidation.previewRelations ?? deterministicValidation.baselineRelations,
      };
      const saved = await persistCandidate(prepared, 'review.prepare');
      if (saved.revision === undefined) {
        throw new Error('Saved Workspace did not return a review revision.');
      }
      const reviewed = await reviewWorkspaceTransition(
        saved.projectId,
        saved.id,
        content,
        `Review ${saved.yopsDraft.operations.length} structured Workspace changes.`,
        saved.revision
      );
      if (generation !== reviewGenerationRef.current) return false;
      setReview({
        changeProjection: reviewed.change_projection,
        commands: null,
        content,
        deterministicValidation,
        precondition: reviewed.precondition,
        reviewSnapshot: reviewed.review_snapshot,
        transitionId: reviewed.transition_id,
        view: reviewed.transition,
      });
      setNotice('Immutable review prepared from the current draft.');
      return true;
    } catch (error) {
      setReview(EMPTY_REVIEW);
      setLocalError(formatUserFacingError(error, 'Workspace review preparation failed.'));
      setNotice(null);
      return false;
    } finally {
      setBusyAction(null);
    }
  }, [
    busyAction,
    chat.input,
    modelSelection.selectedModel,
    modelSelection.selectedProvider,
    onPrepareDraft,
    persistCandidate,
    persistedSourceTurns,
    syncChatSource,
    workingCandidate,
  ]);

  const decide = useCallback(
    async (outcome: WorkspaceTransitionOutcome, reason?: string) => {
      if (!review.transitionId || !review.content || !review.precondition || busyAction) {
        setLocalError('Prepare the current draft for review before making a decision.');
        return null;
      }
      const normalizedReason = reason?.trim();
      if (outcome === 'overridden' && !normalizedReason) {
        setLocalError('Explain why this change should continue despite the failed check.');
        return null;
      }
      setBusyAction(`decision:${outcome}`);
      setLocalError(null);
      try {
        const decided = await decideWorkspaceTransition(candidate.projectId, candidate.id, {
          transitionId: review.transitionId,
          content: review.content,
          outcome,
          ...(normalizedReason ? { decisionReason: normalizedReason } : {}),
          precondition: review.precondition,
        });
        setReview((current) => ({
          ...current,
          changeProjection: decided.change_projection,
          commands: decided.commands ?? null,
          precondition: decided.precondition,
          reviewSnapshot: decided.review_snapshot,
          view: decided.transition,
        }));
        const commitId = committedTransitionId(decided.transition);
        if (commitId && decided.workspace) {
          setWorkingCandidate(decided.workspace);
          onYOpsCommitted?.(commitId, decided.workspace.targetBranch, decided.workspace);
          setNotice(`Committed ${decided.workspace.yopsDraft.operations.length} changes.`);
          return { commitId, workspace: decided.workspace };
        }
        setNotice('Decision recorded without advancing branch history.');
        return null;
      } catch (error) {
        setLocalError(formatUserFacingError(error, 'Workspace decision failed.'));
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, candidate.id, candidate.projectId, onYOpsCommitted, review]
  );

  const copyReceipt = useCallback(async () => {
    const receipt = review.commands ?? review.reviewSnapshot;
    if (!receipt) return false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
      setNotice('Receipt copied.');
      return true;
    } catch (error) {
      setLocalError(formatUserFacingError(error, 'Unable to copy the receipt.'));
      return false;
    }
  }, [review.commands, review.reviewSnapshot]);

  const viewCommit = useCallback(() => {
    const commitId =
      committedTransitionId(review.view) ??
      (workingCandidate.status === 'committed' ? workingCandidate.lastCommitHash : undefined);
    if (commitId) onViewCommitInState?.(commitId, workingCandidate.targetBranch);
  }, [onViewCommitInState, review.view, workingCandidate]);

  const renderedYaml = useMemo(() => {
    if (!review.content) return '';
    return yaml.dump(
      { trees: review.content.trees, relations: review.content.relations },
      { lineWidth: -1, noRefs: true, sortKeys: true }
    );
  }, [review.content]);

  const scenarioSummaries = useMemo(
    () =>
      scenarioOptions.map((workspace) => ({
        changedPaths: workspace.yopsDraft.operations.map((operation) => operation.path),
        id: workspace.id,
        label: workspace.scenario?.name ?? workspace.title,
        operationCount: workspace.yopsDraft.operations.length,
        operations: workspace.yopsDraft.operations,
      })),
    [scenarioOptions]
  );

  return {
    addPaste,
    addUrl,
    busyAction,
    candidate: workingCandidate,
    chat: {
      error: chat.error,
      input: chat.input,
      isLoading: chat.isLoading,
      isStreaming: chat.isStreaming,
      messages,
      send: () => chat.sendMessage(),
      setInput: chat.setInput,
      stop: chat.stopGenerating,
      warning: chat.warning,
    },
    copyReceipt,
    decide,
    decisionReason,
    error: localError ?? flowError ?? chat.error,
    hasCollaborationConflict,
    isBusy: Boolean(busyAction),
    model: {
      availabilityError: modelSelection.availabilityError,
      change: modelSelection.handleModelChange,
      loading: modelSelection.loading,
      ready: modelSelection.isSelectionReady,
      selectedModel: modelSelection.selectedModel ?? '',
      selectedProvider: modelSelection.selectedProvider ?? '',
      setThinking,
      supportsThinking,
      thinkingEnabled,
    },
    materialSources,
    notice,
    prepareReview,
    renderedYaml,
    review,
    resolveCollaborationConflict,
    scenarios: {
      archive: () =>
        runScenarioAction('scenario.archive', async () => {
          if (!onScenarioArchive) throw new Error('Scenario archive is unavailable.');
          await onScenarioArchive();
        }),
      create: (name: string) =>
        runScenarioAction('scenario.create', async () => {
          if (!onScenarioCreate) throw new Error('Scenario creation is unavailable.');
          await onScenarioCreate(name, false);
        }),
      duplicate: (name: string) =>
        runScenarioAction('scenario.duplicate', async () => {
          if (!onScenarioCreate) throw new Error('Scenario duplication is unavailable.');
          await onScenarioCreate(name, true);
        }),
      options: scenarioSummaries,
      rename: (name: string) =>
        runScenarioAction('scenario.rename', async () => {
          if (!onScenarioRename) throw new Error('Scenario rename is unavailable.');
          await onScenarioRename(name);
        }),
      select: (workspaceId: string) => onScenarioSelect?.(workspaceId),
      selectedId: workingCandidate.id,
    },
    setDecisionReason,
    sourceBusy: materialUpload.uploading || busyAction?.startsWith('source:') === true,
    toggleMaterialSource,
    uploadFile,
    viewCommit,
  };
}

export type WorkspaceComposeReviewController = ReturnType<
  typeof useWorkspaceComposeReviewController
>;

function findSourceConversationId(candidate: WorkspaceCandidate): string | undefined {
  return candidate.sourceBundle.find(
    (source) => source.type === 'chat' && Boolean(source.conversationId)
  )?.conversationId;
}

function isPersistedTurnId(id: string): boolean {
  return Boolean(id) && !id.startsWith('msg-') && !id.endsWith(':streaming');
}

function messageToSourceTurn(message: {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  conversationId?: string;
  projectId?: string;
  rings?: Record<string, unknown> | null;
}): SourceConversationTurn {
  return {
    id: message.id,
    role: message.role,
    author: message.role === 'user' ? 'You' : 'Assistant',
    content: message.content,
    conversationId: message.conversationId,
    projectId: message.projectId,
    pinnable: true,
    ...(message.rings ? { rings: message.rings } : {}),
  };
}

function getSourceChatSourceId(candidateId: string, conversationId?: string): string {
  return `source_chat:${conversationId ?? candidateId}`;
}

function buildChatSourceBundle(
  sourceId: string,
  candidateTitle: string,
  conversationId: string | undefined,
  turns: readonly SourceConversationTurn[]
): SourceBundleItem | null {
  if (turns.length === 0) return null;
  return {
    id: sourceId,
    type: 'chat',
    title: `${candidateTitle} source chat`,
    ...(conversationId ? { conversationId } : {}),
    previewTurns: [...turns],
  };
}

function findChatSource(sourceBundle: SourceBundleItem[], sourceId: string) {
  return sourceBundle.find((source) => source.id === sourceId && source.type === 'chat');
}

function chatSourceMatches(
  existing: SourceBundleItem | undefined,
  source: SourceBundleItem | null
) {
  if (!source) return existing === undefined;
  if (!existing) return false;
  if (existing.title !== source.title || existing.conversationId !== source.conversationId) {
    return false;
  }
  return sourceTurnsMatch(existing.previewTurns ?? [], source.previewTurns ?? []);
}

function sourceTurnsMatch(
  previousTurns: readonly SourceConversationTurn[],
  nextTurns: readonly SourceConversationTurn[]
) {
  if (previousTurns.length !== nextTurns.length) return false;
  return previousTurns.every((turn, index) => {
    const next = nextTurns[index];
    return (
      next !== undefined &&
      turn.id === next.id &&
      turn.role === next.role &&
      turn.author === next.author &&
      turn.content === next.content &&
      turn.conversationId === next.conversationId &&
      turn.projectId === next.projectId &&
      JSON.stringify(turn.rings ?? null) === JSON.stringify(next.rings ?? null)
    );
  });
}

function chatSourceSignature(source: SourceBundleItem | null): string {
  if (!source) return 'chat:none';
  return JSON.stringify({
    id: source.id,
    title: source.title,
    conversationId: source.conversationId ?? null,
    turns: source.previewTurns?.map((turn) => ({
      id: turn.id,
      role: turn.role,
      author: turn.author,
      content: turn.content,
      conversationId: turn.conversationId ?? null,
      projectId: turn.projectId ?? null,
      rings: turn.rings ?? null,
    })),
  });
}

function materialToSourceBundleItem(material: Material): SourceBundleItem {
  const filename = material.filename?.toLowerCase() ?? '';
  const mimeType = material.mime_type?.toLowerCase() ?? '';
  const format =
    filename.endsWith('.yaml') || filename.endsWith('.yml') || mimeType.includes('yaml')
      ? ('yaml' as const)
      : mimeType.startsWith('text/')
        ? ('text' as const)
        : undefined;
  return {
    id: `material:${material.id}`,
    type: material.source_type === 'url' ? 'import' : 'document',
    title: material.title,
    description: material.content_excerpt,
    materialId: material.id,
    contentHash: material.content_hash,
    tokenEstimate: material.token_estimate,
    fileName: material.filename ?? undefined,
    ...(format ? { format } : {}),
    previewText: material.content_excerpt,
  };
}

function upsertSource(
  sourceBundle: SourceBundleItem[],
  sourceId: string,
  source: SourceBundleItem | null
): SourceBundleItem[] {
  const existingIndex = sourceBundle.findIndex((item) => item.id === sourceId);
  if (!source) return sourceBundle.filter((item) => item.id !== sourceId);
  if (existingIndex < 0) return [...sourceBundle, source];
  return sourceBundle.map((item, index) => (index === existingIndex ? source : item));
}

function invalidateWorkspaceProposal(candidate: WorkspaceCandidate): WorkspaceCandidate {
  const {
    commitOverride: _commitOverride,
    lastCommitHash: _lastCommitHash,
    ...editableCandidate
  } = candidate;
  return {
    ...editableCandidate,
    status: 'draft',
    schemaCandidate: {
      summary: 'Source evidence changed. Generate a new candidate proposal.',
      fields: [],
    },
    schemaReview: {
      verdict: 'needs_review',
      summary: 'The candidate proposal must be regenerated after its source evidence changed.',
      gaps: ['Generate a candidate proposal from the current source evidence.'],
    },
    yopsDraft: { ...candidate.yopsDraft, operations: [] },
  };
}

function committedTransitionId(view: TransitionViewV1 | null): string | null {
  if (!view || view.mode !== 'transition' || view.history.observation !== 'committed') return null;
  return view.history.commit.id;
}

function unsupportedWorkspaceMaterialMessage(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) {
    return 'File is too large. Workspace chat materials support files up to 5MB.';
  }
  const extension = file.name.toLowerCase().split('.').at(-1) ?? '';
  if (extension === 'doc') return 'Legacy .doc files are not supported. Export as DOCX or PDF.';
  if (extension === 'xls') return 'Legacy .xls files are not supported. Export as XLSX or CSV.';
  return null;
}
