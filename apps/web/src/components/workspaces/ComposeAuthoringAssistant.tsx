'use client';

import { ArrowUp, Sparkles, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenerationModelSelector } from '@/components/generation/GenerationModelSelector';
import { providerSupports } from '@/domain/providerCapabilities';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useSourceThreadGeneration } from '@/hooks/sourceThreads/useSourceThreadGeneration';
import type { WorkspaceAssistantContext } from '@/hooks/workspaces/useWorkspaceAuthoring';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { useChatSessionStore } from '@/store/chatSessionStore';
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
    send: () => chat.sendMessage(),
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
    !chat.input.trim();

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
            if (!sendDisabled) chat.sendMessage();
          }}
          placeholder="Ask about this Draft…"
          rows={3}
          value={chat.input}
        />
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
            onClick={() => (chat.isStreaming ? chat.stopGenerating() : chat.sendMessage())}
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
