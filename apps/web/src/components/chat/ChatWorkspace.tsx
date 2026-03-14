'use client';

import { AlertCircle, Loader2, MessageSquarePlus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoProject } from '@/hooks/useAutoProject';
import { useConversationChat } from '@/hooks/useConversationChat';
import { extractFrames, getSemanticDraft } from '@/lib/api/frames';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { useSessionStore } from '@/store/sessionStore';
import { ChatHeader } from './ChatHeader';
import { ChatInput } from './ChatInput';

interface ChatWorkspaceProps {
  conversationId: string;
  projectId?: string;
  firstMessage?: string;
  className?: string;
}

export function ChatWorkspace({
  conversationId,
  projectId,
  firstMessage,
  className,
}: ChatWorkspaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const firstMessageSentRef = useRef(false);
  const prevTurnsSavedRef = useRef(0);

  // For "/chat/new" routes: auto-create project + conversation
  const isNewChat = conversationId === 'new';
  const { ensureProject } = useAutoProject();
  const [resolvedProjectId, setResolvedProjectId] = useState(projectId ?? '');
  const [resolvedConversationId, setResolvedConversationId] = useState<string | undefined>(
    isNewChat ? undefined : conversationId
  );
  const pendingMessageRef = useRef<string | null>(null);

  const {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    streamingContent,
    error,
    warning,
    sendMessage,
    turnsSavedCounter,
  } = useConversationChat({
    projectId: resolvedProjectId,
    conversationId: resolvedConversationId,
    onConversationCreated: useCallback(
      (newConvId: string) => {
        setResolvedConversationId(newConvId);
        // Update URL without triggering Next.js navigation (avoids re-mount)
        window.history.replaceState(null, '', `/chat/${newConvId}`);
      },
      []
    ),
  });

  // Sync resolved IDs when props change (e.g. sidebar navigation between conversations)
  useEffect(() => {
    if (projectId) setResolvedProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!isNewChat) setResolvedConversationId(conversationId);
  }, [conversationId, isNewChat]);

  // Flush pending message once projectId is resolved and sendMessage is recreated
  useEffect(() => {
    if (resolvedProjectId && pendingMessageRef.current) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      sendMessage(msg);
    }
  }, [resolvedProjectId, sendMessage]);

  // Sync active conversation + session into stores; load existing draft
  useEffect(() => {
    const convId = resolvedConversationId ?? conversationId;
    useChatStore.getState().setActiveConversation(convId, resolvedProjectId || null);
    useExtractionPanelStore.getState().resetDraft();
    if (resolvedProjectId) {
      useSessionStore.getState().setLastSession(resolvedProjectId, convId);
    }

    // Load existing semantic draft for this conversation (like canvas does)
    if (convId && convId !== 'new') {
      getSemanticDraft(convId)
        .then((draft) => {
          if (draft && draft.frames.length > 0) {
            const store = useExtractionPanelStore.getState();
            store.setDraft(draft);
            if (store.panelMode === 'collapsed') {
              store.setPanelMode('default');
            }
          }
        })
        .catch(() => {
          // Draft load failed — non-critical
        });
    }
  }, [conversationId, resolvedConversationId, resolvedProjectId]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Extract frames after turns are saved
  useEffect(() => {
    const prev = prevTurnsSavedRef.current;
    prevTurnsSavedRef.current = turnsSavedCounter;

    if (turnsSavedCounter === 0 || turnsSavedCounter === prev) return;
    const convId = resolvedConversationId;
    if (!convId) return;

    const store = useExtractionPanelStore.getState();
    store.setExtracting(true);

    extractFrames(convId)
      .then((result) => {
        const s = useExtractionPanelStore.getState();
        s.applyDelta(result.delta, 'llm_extraction');
        if (result.snapshot.frames.length > 0 && s.panelMode === 'collapsed') {
          s.setPanelMode('default');
        }
      })
      .catch(() => {
        // Extraction failed silently — non-critical
      })
      .finally(() => {
        useExtractionPanelStore.getState().setExtracting(false);
      });
  }, [resolvedConversationId, turnsSavedCounter]);

  // Send firstMessage on mount (once only)
  useEffect(() => {
    if (firstMessage && !firstMessageSentRef.current && !isLoading) {
      firstMessageSentRef.current = true;

      if (isNewChat && !resolvedProjectId) {
        pendingMessageRef.current = firstMessage;
        ensureProject(firstMessage).then((projId) => {
          setResolvedProjectId(projId);
          // pendingMessageRef will be flushed by the effect above
        });
      } else {
        sendMessage(firstMessage);
      }
    }
  }, [firstMessage, isLoading, isNewChat, resolvedProjectId, ensureProject, sendMessage]);

  const handleSend = useCallback(
    async (message: string) => {
      if (!resolvedProjectId) {
        pendingMessageRef.current = message;
        const projId = await ensureProject(message);
        setResolvedProjectId(projId);
      } else {
        sendMessage(message);
      }
    },
    [resolvedProjectId, ensureProject, sendMessage]
  );

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {/* Header */}
      <ChatHeader />

      {/* Message list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 min-h-[200px]">
            <Loader2 size={40} strokeWidth={1} className="animate-spin" />
            <p className="text-sm font-medium">Loading conversation...</p>
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 min-h-[200px]">
            <MessageSquarePlus size={40} strokeWidth={1} />
            <p className="text-sm font-medium text-[var(--text-primary)]">No messages yet</p>
            <span className="text-xs text-[var(--text-tertiary)]">
              Type a message below to start the conversation
            </span>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[80%] py-2.5 px-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                  'animate-in fade-in slide-in-from-bottom-2 duration-200',
                  msg.role === 'user'
                    ? 'self-end bg-[var(--accent-commit)] text-white rounded-br-sm'
                    : 'self-start bg-[var(--surface-panel)] text-[var(--text-primary)] rounded-bl-sm border border-[var(--stroke-divider)]'
                )}
              >
                {msg.content}
              </div>
            ))}

            {/* Streaming response */}
            {isStreaming && streamingContent && (
              <div className="max-w-[80%] self-start py-2.5 px-3.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed whitespace-pre-wrap bg-[var(--surface-panel)] text-[var(--text-primary)] border border-[var(--stroke-divider)]">
                {streamingContent}
                <span className="animate-pulse text-[var(--accent-commit)]">{'\u2588'}</span>
              </div>
            )}

            {/* Waiting indicator (streaming started but no content yet) */}
            {isStreaming && !streamingContent && (
              <div className="max-w-[80%] self-start py-2.5 px-3.5 rounded-2xl rounded-bl-sm bg-[var(--surface-panel)] border border-[var(--stroke-divider)]">
                <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 py-2.5 px-3.5 mx-2 bg-[var(--status-error-muted)] border border-[var(--status-error)]/20 rounded-lg text-[var(--status-error)] text-xs">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Non-critical warning */}
            {warning && !error && (
              <div className="flex items-center gap-2 py-2 px-3.5 mx-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 dark:text-amber-400 text-xs">
                <AlertCircle size={14} />
                <span>{warning}</span>
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 border-t border-[var(--stroke-divider)] shrink-0">
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || isLoading}
          placeholder="Message... (Enter to send, Shift+Enter for new line)"
        />
      </div>
    </div>
  );
}
