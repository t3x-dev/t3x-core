'use client';

import { ArrowUp, Sparkles, Square, X } from 'lucide-react';
import NextImage from 'next/image';
import { type ClipboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clipboardImageFiles,
  fileToAttachedImage,
} from '@/components/generation/attachedImageFile';
import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';
import { providerSupports } from '@/domain/providerCapabilities';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useSourceThreadGeneration } from '@/hooks/sourceThreads/useSourceThreadGeneration';
import type { WorkspaceAssistantContext } from '@/hooks/workspaces/useWorkspaceAuthoring';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { useChatSessionStore } from '@/store/chatSessionStore';
import type { AttachedImage } from '@/types/generation';
import { WorkspaceComposeChat } from './WorkspaceComposeChat';
import styles from './WorkspaceComposeSurface.module.css';

export function ComposeAuthoringAssistant({
  projectId,
  conversationId: initialConversationId,
  context,
  onCreateConversation,
  onPublishCandidate,
  initialPendingCandidate,
}: {
  projectId: string;
  conversationId?: string;
  context: WorkspaceAssistantContext;
  onCreateConversation: () => Promise<string>;
  onPublishCandidate: (transitionId: string, requestId: string) => Promise<unknown>;
  initialPendingCandidate?: string;
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [allowProposal, setAllowProposal] = useState(true);
  const [pendingCandidate, setPendingCandidate] = useState<string | null>(
    initialPendingCandidate ?? null
  );
  const [starting, setStarting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const publication = useRef<{ transitionId: string; requestId: string } | null>(null);
  const model = useChatModelSelection({});
  const thinkingEnabled = useChatSessionStore((state) => state.thinkingEnabled);
  const setThinking = useChatSessionStore((state) => state.setThinking);
  const supportsThinking = providerSupports(model.selectedProvider ?? '', 'thinking');

  useEffect(() => {
    if (initialPendingCandidate) setPendingCandidate(initialPendingCandidate);
  }, [initialPendingCandidate]);
  const publishTransition = useCallback(
    async (transitionId: string) => {
      const identity =
        publication.current?.transitionId === transitionId
          ? publication.current
          : { transitionId, requestId: crypto.randomUUID() };
      publication.current = identity;
      setPublishing(true);
      setLocalError(null);
      try {
        await onPublishCandidate(identity.transitionId, identity.requestId);
        publication.current = null;
        setPendingCandidate(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Could not publish this proposal.');
      } finally {
        setPublishing(false);
      }
    },
    [onPublishCandidate]
  );
  const chat = useSourceThreadGeneration({
    projectId,
    conversationId,
    provider: model.selectedProvider ?? undefined,
    model: model.selectedModel ?? undefined,
    workspaceAssistant: {
      ...context,
      allowProposal,
      onCandidate: (transitionId) => {
        setPendingCandidate(transitionId);
        void publishTransition(transitionId);
      },
    },
    onConversationCreated: setConversationId,
  });
  const messages = useMemo(() => {
    const persisted = chat.messages.map((message) => ({
      author: message.role === 'user' ? 'You' : 'Assistant',
      content: message.content,
      id: message.id,
      role: message.role,
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
  const chatView: WorkspaceComposeReviewController['chat'] = {
    error: chat.error,
    input: chat.input,
    isLoading: chat.isLoading,
    isStreaming: chat.isStreaming,
    citations: chat.citations,
    isThinking: chat.isThinking,
    messages,
    searchQuery: chat.searchQuery,
    send: (images?: AttachedImage[]) => {
      const text = chat.input.trim();
      if (!text && !images?.length) return;
      chat.sendMessage(text || 'Attached image', images?.length ? { images } : undefined);
    },
    setInput: chat.setInput,
    stop: chat.stopGenerating,
    thinkingContent: chat.thinkingContent,
    warning: chat.warning,
  };
  const sendDisabled =
    !conversationId ||
    chat.isLoading ||
    model.loading ||
    !model.isSelectionReady ||
    (!chat.input.trim() && attachedImages.length === 0);

  const startConversation = async () => {
    setStarting(true);
    setLocalError(null);
    try {
      setConversationId(await onCreateConversation());
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Cannot create source conversation.');
    } finally {
      setStarting(false);
    }
  };

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
    const files = clipboardImageFiles(event.clipboardData);
    if (!files.length) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    void Promise.all(files.map(fileToAttachedImage)).then((images) => {
      setAttachedImages((current) => [...current, ...images]);
    });
  };

  const sendComposer = () => {
    if (
      !conversationId ||
      chat.isLoading ||
      chat.isStreaming ||
      model.loading ||
      !model.isSelectionReady
    )
      return;
    const text = chat.input.trim();
    const images = attachedImages;
    if (!text && images.length === 0) return;
    chat.sendMessage(text || 'Attached image', images.length ? { images } : undefined);
    for (const image of images) URL.revokeObjectURL(image.preview);
    setAttachedImages([]);
  };

  return (
    <div className={styles.authoringAssistant}>
      <WorkspaceComposeChat chat={chatView} variant="discussion" />
      {pendingCandidate ? (
        <section className={styles.candidateNotice} aria-label="Generated proposal">
          <div>
            <Sparkles aria-hidden="true" />
            <span>
              <strong>Proposal ready</strong>
              <small>
                {publishing
                  ? 'Verifying and publishing this proposal to the Draft…'
                  : 'Publication needs attention. Retry after reviewing the error below.'}
              </small>
            </span>
          </div>
          <button disabled={publishing} onClick={() => void publish()} type="button">
            {publishing ? 'Publishing…' : 'Retry publication'}
          </button>
        </section>
      ) : null}
      {localError || chat.error || chat.warning ? (
        <p
          className={styles.authoringAssistantNotice}
          role={localError || chat.error ? 'alert' : 'status'}
        >
          {localError ?? chat.error ?? chat.warning}
        </p>
      ) : null}
      {!conversationId ? (
        <button
          className={styles.startConversation}
          disabled={starting}
          onClick={() => void startConversation()}
          type="button"
        >
          {starting ? 'Starting…' : 'Start workspace conversation'}
        </button>
      ) : null}
      <label className={styles.proposalPermission}>
        <input
          checked={allowProposal}
          onChange={(event) => setAllowProposal(event.target.checked)}
          type="checkbox"
        />
        Generate a proposal from change requests
      </label>
      <fieldset className={styles.discussionComposer} aria-label="Message composer">
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
          placeholder="Ask about this Draft…"
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
        <div className={styles.discussionComposerFooter}>
          <GenerationModelSelector
            onModelChange={model.handleModelChange}
            onThinkingChange={setThinking}
            selectedModel={model.selectedModel ?? ''}
            selectedProvider={model.selectedProvider ?? ''}
            supportsThinking={supportsThinking}
            thinkingEnabled={thinkingEnabled}
          />
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
      </fieldset>
    </div>
  );
}
