'use client';

import type {
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
  WorkspaceAuthoringOutcome,
} from '@t3x-dev/api-client';
import { AlertTriangle, ArrowUp, FileText, Layers, Square, X } from 'lucide-react';
import NextImage from 'next/image';
import {
  type ClipboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  clipboardDocumentFiles,
  clipboardImageFiles,
  fileToAttachedImage,
} from '@/components/generation/attachedImageFile';
import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';
import { InferenceAvailabilityNotice } from '@/components/generation/InferenceAvailabilityNotice';
import { unsupportedChatMaterialSourceMessage } from '@/components/import/documentAcceptTypes';
import { providerSupports } from '@/domain/providerCapabilities';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import {
  useSourceThreadSessionRef,
  useSourceThreadSessionState,
  useWorkspaceAssistantSession,
} from '@/hooks/sourceThreads/sourceThreadSession';
import { useSourceThreadGeneration } from '@/hooks/sourceThreads/useSourceThreadGeneration';
import { useComposeProposalPosture } from '@/hooks/workspaces/useComposeProposalPosture';
import type { WorkspaceAssistantContext } from '@/hooks/workspaces/useWorkspaceAuthoring';
import { useChatSessionStore } from '@/store/chatSessionStore';
import type { AttachedImage } from '@/types/generation';
import type { WorkspaceProposalPosture } from '@/types/workspaces';
import { PROPOSAL_POSTURE_OPTIONS, proposalPostureOption } from './ProposalPostureSelector';
import type {
  AssistantActivityRecord,
  AssistantPublication,
  PublishedTurnChanges,
} from './WorkspaceAssistantActivity';
import {
  type SchemaReceipt,
  WorkspaceComposeChat,
  type WorkspaceComposeChatState,
  type WorkspaceComposeMessage,
} from './WorkspaceComposeChat';
import styles from './WorkspaceComposeSurface.module.css';

export function ComposeAuthoringAssistant({
  projectId,
  conversationId: initialConversationId,
  title,
  context,
  onCreateConversation,
  onPublishCandidate,
  initialPendingCandidate,
  activityActions,
  activityCards,
  prefill,
  onPrefillApplied,
  sourcesControl,
  allowProposal = true,
  proposalBlockedHint,
  contextLabel,
  onSchemaCandidateChange,
  onConversationChange,
  draftPreparation,
  beforeComposer,
  onOpenTurn,
  schemaReceipt,
}: {
  projectId: string;
  onSchemaCandidateChange?: (conversationId?: string) => void;
  onConversationChange?: (conversationId: string) => void;
  draftPreparation?: {
    start: () => void;
    busy: boolean;
    error?: string | null;
    importing: boolean;
    cancel: () => void;
  };
  beforeComposer?: ReactNode;
  schemaReceipt?: SchemaReceipt;
  onOpenTurn?: (changes: PublishedTurnChanges) => void;
  conversationId?: string;
  title?: string;
  context: WorkspaceAssistantContext;
  onCreateConversation: () => Promise<string>;
  onPublishCandidate: (
    transitionId: string,
    requestId: string
  ) => Promise<WorkspaceAuthoringOutcome>;
  initialPendingCandidate?: string;
  activityActions?: WorkspaceAuthoringAction[];
  activityCards?: Record<string, WorkspaceAuthoringCard[]>;
  prefill?: string | null;
  onPrefillApplied?: () => void;
  sourcesControl?: ReactNode;
  allowProposal?: boolean;
  proposalBlockedHint?: string;
  contextLabel?: string;
}) {
  const session = useWorkspaceAssistantSession(projectId, context.workspaceId);
  const [conversationId, setConversationId] = useSourceThreadSessionState(
    session,
    'compose.conversation',
    initialConversationId
  );
  const [pendingCandidate, setPendingCandidate] = useSourceThreadSessionState<string | null>(
    session,
    'compose.pendingCandidate',
    initialPendingCandidate ?? null
  );
  const [publishing, setPublishing] = useSourceThreadSessionState(
    session,
    'compose.publishing',
    false
  );
  const [publicationError, setPublicationError] = useSourceThreadSessionState<string | null>(
    session,
    'compose.publicationError',
    null
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [published, setPublished] = useSourceThreadSessionState<AssistantPublication | null>(
    session,
    'compose.published',
    null
  );
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const publication = useSourceThreadSessionRef<{
    transitionId: string;
    requestId: string;
    turnId?: string;
  } | null>(session, 'compose.publication', null);
  const composeDefaultApplied = useRef(false);
  const model = useChatModelSelection({});
  const thinkingEnabled = useChatSessionStore((state) => state.thinkingEnabled);
  const setThinking = useChatSessionStore((state) => state.setThinking);
  const supportsThinking = providerSupports(model.selectedProvider ?? '', 'thinking');
  const { posture, setPosture } = useComposeProposalPosture(context.workspaceId);

  useEffect(() => {
    if (composeDefaultApplied.current || model.loading || !model.isSelectionReady) return;
    composeDefaultApplied.current = true;
    if (model.selectedProvider === 'openai' && model.selectedModel === 'gpt-5.4') return;
    const openai = model.providers.find((provider) => provider.name === 'openai');
    if (openai?.models.some((entry) => entry.id === 'gpt-5.4')) {
      model.handleModelChange('openai', 'gpt-5.4');
    }
  }, [model]);

  useEffect(() => {
    if (initialPendingCandidate) setPendingCandidate(initialPendingCandidate);
  }, [initialPendingCandidate, setPendingCandidate]);
  useEffect(() => {
    setConversationId(initialConversationId);
  }, [initialConversationId, setConversationId]);
  const publishTransition = useCallback(
    async (transitionId: string, turnId?: string) => {
      const identity =
        publication.current?.transitionId === transitionId
          ? publication.current
          : { transitionId, requestId: crypto.randomUUID(), turnId };
      publication.current = identity;
      setPublishing(true);
      setLocalError(null);
      try {
        const outcome = await onPublishCandidate(identity.transitionId, identity.requestId);
        if (identity.turnId)
          setPublished({ turnId: identity.turnId, kind: outcome.kind, action: outcome.action });
        publication.current = null;
        setPendingCandidate(null);
        setPublicationError(null);
      } catch (error) {
        setPublicationError(
          error instanceof Error ? error.message : 'Could not publish this proposal.'
        );
      } finally {
        setPublishing(false);
      }
    },
    [
      onPublishCandidate,
      publication,
      setPublished,
      setPublishing,
      setPendingCandidate,
      setPublicationError,
    ]
  );
  const chat = useSourceThreadGeneration({
    projectId,
    conversationId,
    title,
    provider: model.selectedProvider ?? undefined,
    model: model.selectedModel ?? undefined,
    workspaceAssistant: {
      ...context,
      allowProposal,
      posture,
      onSchemaSettings: (id) => onSchemaCandidateChange?.(id ?? conversationId),
      onCandidate: (transitionId, turnId) => {
        if (!allowProposal) return;
        setPublicationError(null);
        setPendingCandidate(transitionId);
        void publishTransition(transitionId, turnId);
      },
    },
    onConversationCreated: (nextConversationId) => {
      setConversationId(nextConversationId);
      onConversationChange?.(nextConversationId);
    },
    createConversation: onCreateConversation,
  });
  const { setInput } = chat;
  useEffect(() => {
    if (!prefill) return;
    setInput(prefill);
    onPrefillApplied?.();
  }, [prefill, onPrefillApplied, setInput]);
  const messages = useMemo(() => {
    const persisted: WorkspaceComposeMessage[] = chat.messages.map((message) => ({
      author: message.role === 'user' ? 'You' : 'Assistant',
      content: message.content,
      id: message.id,
      role: message.role,
      ...(message.images?.length ? { images: message.images } : {}),
      ...(message.files?.length ? { files: message.files } : {}),
    }));
    if (chat.streamingContent.trim())
      persisted.push({
        author: 'Assistant',
        content: chat.streamingContent,
        id: `${conversationId ?? projectId}:streaming`,
        role: 'assistant',
      });
    return persisted;
  }, [chat.messages, chat.streamingContent, conversationId, projectId]);
  const chatView: WorkspaceComposeChatState = {
    error: chat.error,
    input: chat.input,
    isLoading: chat.isLoading,
    isStreaming: chat.isStreaming,
    citations: chat.citations,
    isThinking: chat.isThinking,
    messages,
    searchQuery: chat.searchQuery,
    send: () => chat.sendMessage(),
    setInput: chat.setInput,
    stop: chat.stopGenerating,
    thinkingContent: chat.thinkingContent,
    warning: chat.warning,
  };
  const assistantPublication = published?.action
    ? { ...published, cards: activityCards?.[published.action.actionId] }
    : published;
  const assistantRecords = useMemo(() => {
    const records: Record<string, AssistantActivityRecord> = {};
    for (const message of chat.messages) {
      if (message.role !== 'assistant') continue;
      const transcript = message.rings?.workspace_assistant;
      if (!transcript || typeof transcript !== 'object' || !('operations' in transcript)) continue;
      if (!Array.isArray(transcript.operations)) continue;
      const operations = transcript.operations.flatMap((event) => {
        if (!event || typeof event !== 'object' || event.type !== 'operation') return [];
        if (typeof event.operationId !== 'string' || typeof event.name !== 'string') return [];
        const result = event.result;
        return [
          {
            id: event.operationId,
            name: event.name,
            status: 'completed' as const,
            transitionId:
              result && typeof result === 'object' && typeof result.transitionId === 'string'
                ? result.transitionId
                : undefined,
          },
        ];
      });
      const transitionId = operations.find((operation) => operation.transitionId)?.transitionId;
      const action = transitionId
        ? activityActions?.find((entry) => entry.generation?.transitionId === transitionId)
        : undefined;
      records[message.id] = {
        activity: { turnId: message.id, phase: 'complete', operations },
        publication: action
          ? {
              turnId: message.id,
              kind: 'published',
              action,
              cards: activityCards?.[action.actionId],
            }
          : null,
      };
    }
    return records;
  }, [chat.messages, activityActions, activityCards]);
  const [firstMessage, setFirstMessage] = useState<{
    text: string;
    images: AttachedImage[];
    files: File[];
  } | null>(null);
  const sendDisabled =
    Boolean(firstMessage || draftPreparation?.busy || draftPreparation?.importing) ||
    chat.isLoading ||
    model.loading ||
    !model.isSelectionReady ||
    (!chat.input.trim() && attachedImages.length === 0 && attachedFiles.length === 0);

  const publish = async () => {
    if (!pendingCandidate) return;
    await publishTransition(pendingCandidate);
  };

  const removeImage = (id: string) => {
    setAttachedImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((image) => image.id !== id);
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = clipboardImageFiles(event.clipboardData);
    const documentFiles = clipboardDocumentFiles(event.clipboardData);
    if (!imageFiles.length && !documentFiles.length) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    const rejected = documentFiles
      .map((file) => unsupportedChatMaterialSourceMessage(file))
      .find(Boolean);
    setLocalError(rejected ?? null);
    const accepted = documentFiles.filter((file) => !unsupportedChatMaterialSourceMessage(file));
    if (accepted.length) setAttachedFiles((current) => [...current, ...accepted]);
    void Promise.all(imageFiles.map(fileToAttachedImage)).then((images) => {
      setAttachedImages((current) => [...current, ...images]);
    });
  };

  const dispatchMessage = useCallback(
    (text: string, images: AttachedImage[], files: File[]) => {
      chat.sendMessage(
        text || (images.length ? 'Attached image' : 'Attached file'),
        images.length || files.length
          ? { ...(images.length ? { images } : {}), ...(files.length ? { files } : {}) }
          : undefined
      );
      for (const image of images) URL.revokeObjectURL(image.preview);
      setAttachedImages([]);
      setAttachedFiles([]);
    },
    [chat.sendMessage]
  );

  useEffect(() => {
    if (draftPreparation?.error) setFirstMessage(null);
  }, [draftPreparation?.error]);

  useEffect(() => {
    if (draftPreparation || !firstMessage) return;
    setFirstMessage(null);
    dispatchMessage(firstMessage.text, firstMessage.images, firstMessage.files);
  }, [draftPreparation, firstMessage, dispatchMessage]);

  const sendComposer = () => {
    if (chat.isStreaming || sendDisabled) return;
    const text = chat.input.trim();
    if (draftPreparation) {
      setFirstMessage({ text, images: attachedImages, files: attachedFiles });
      draftPreparation.start();
      return;
    }
    dispatchMessage(text, attachedImages, attachedFiles);
  };

  return (
    <div className={styles.authoringAssistant}>
      <WorkspaceComposeChat
        assistantActivity={chat.workspaceActivity}
        assistantPublication={assistantPublication}
        assistantRecords={assistantRecords}
        onOpenTurn={onOpenTurn}
        schemaReceipt={schemaReceipt}
        assistantPublishing={
          publishing && publication.current?.turnId === chat.workspaceActivity?.turnId
        }
        chat={chatView}
        variant="discussion"
      />
      {pendingCandidate && publicationError ? (
        <section className={styles.candidateNotice} aria-label="Proposal publication failed">
          <div>
            <AlertTriangle aria-hidden="true" />
            <span>
              <strong>Proposal publication failed</strong>
              <small>Review the error below, then retry publication.</small>
            </span>
          </div>
          <button disabled={publishing} onClick={() => void publish()} type="button">
            {publishing ? 'Publishing…' : 'Retry publication'}
          </button>
        </section>
      ) : null}
      {!allowProposal && proposalBlockedHint ? (
        <output className={styles.authoringAssistantHint}>{proposalBlockedHint}</output>
      ) : null}
      {publicationError || localError || chat.error || chat.warning ? (
        <p
          className={styles.authoringAssistantNotice}
          role={publicationError || localError || chat.error ? 'alert' : 'status'}
        >
          {publicationError ?? localError ?? chat.error ?? chat.warning}
        </p>
      ) : null}
      {!model.isSelectionReady ? (
        <InferenceAvailabilityNotice
          loading={model.loading}
          ready={model.isSelectionReady}
          error={model.availabilityError}
          onRetry={model.refresh}
        />
      ) : null}
      {draftPreparation?.importing ? (
        <div className={styles.activityBootstrap}>
          <p>Import the existing draft to continue editing with its current changes.</p>
          <div>
            <button type="button" disabled={draftPreparation.busy} onClick={draftPreparation.start}>
              Import draft and continue
            </button>
            <button
              type="button"
              disabled={draftPreparation.busy}
              onClick={() => {
                setFirstMessage(null);
                draftPreparation.cancel();
              }}
            >
              Cancel import
            </button>
          </div>
        </div>
      ) : firstMessage && !draftPreparation?.error ? (
        <output className={styles.authoringAssistantHint}>Preparing your draft…</output>
      ) : null}
      {draftPreparation?.error ? (
        <p role="alert" className={styles.authoringAssistantNotice}>
          {draftPreparation.error}
        </p>
      ) : null}
      {beforeComposer}
      <fieldset
        className={styles.discussionComposer}
        aria-label="Message composer"
        disabled={Boolean(firstMessage)}
      >
        {contextLabel ? (
          <div className={styles.chatContext}>
            <Layers aria-hidden="true" /> <span title={contextLabel}>{contextLabel}</span>
            {context.selectedNodeId ? <small>Selected field</small> : null}
          </div>
        ) : null}
        <textarea
          aria-label="Workspace instruction"
          disabled={chat.isLoading}
          onChange={(event) => chat.setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            sendComposer();
          }}
          onPaste={handlePaste}
          placeholder={
            messages.length
              ? 'Reply, or ask the assistant to change this node…'
              : 'Describe what you’d like to change…'
          }
          rows={3}
          value={chat.input}
        />
        {attachedImages.length > 0 ? (
          <div className={styles.imagePreview}>
            {attachedImages.map((image) => (
              <span className={styles.imagePreviewItem} key={image.id}>
                <NextImage alt="" height={48} src={image.preview} unoptimized width={48} />
                <button
                  aria-label="Remove image"
                  onClick={() => removeImage(image.id)}
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {attachedFiles.length > 0 ? (
          <div className={styles.imagePreview}>
            {attachedFiles.map((file, index) => (
              <span className={styles.filePreviewItem} key={`${file.name}-${index}`}>
                <FileText aria-hidden="true" />
                <span>{file.name}</span>
                <button
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setAttachedFiles((current) => current.filter((_, at) => at !== index))
                  }
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className={styles.discussionComposerFooter}>
          {sourcesControl}
          <div className={styles.composerSubmit}>
            <GenerationModelSelector
              onModelChange={model.handleModelChange}
              onThinkingChange={setThinking}
              selectedModel={model.selectedModel ?? ''}
              selectedProvider={model.selectedProvider ?? ''}
              supportsThinking={supportsThinking}
              thinkingEnabled={thinkingEnabled}
            />
            <select
              aria-label="Proposal mode"
              className={styles.postureSelect}
              disabled={chat.isLoading}
              onChange={(event) =>
                setPosture(event.currentTarget.value as WorkspaceProposalPosture)
              }
              title={proposalPostureOption(posture).title}
              value={posture}
            >
              {PROPOSAL_POSTURE_OPTIONS.map((option) => (
                <option key={option.value} title={option.description} value={option.value}>
                  {option.shortLabel}
                </option>
              ))}
            </select>
            <button
              aria-label={chat.isStreaming ? 'Stop generating' : 'Send message'}
              className={styles.send}
              disabled={!chat.isStreaming && sendDisabled}
              onClick={() => (chat.isStreaming ? chat.stopGenerating() : sendComposer())}
              type="button"
            >
              {chat.isStreaming ? (
                <Square aria-hidden="true" className="size-4 fill-current text-current" />
              ) : (
                <ArrowUp aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
