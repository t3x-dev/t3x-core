'use client';

import { AlertCircle, Loader2, MessageSquarePlus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useConversationChat } from '@/hooks/useConversationChat';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
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
  } = useConversationChat({
    projectId: projectId ?? '',
    conversationId,
  });

  // Sync active conversation + session into stores
  useEffect(() => {
    useChatStore.getState().setActiveConversation(conversationId, projectId ?? null);
    if (projectId) {
      useSessionStore.getState().setLastSession(projectId, conversationId);
    }
  }, [conversationId, projectId]);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Send firstMessage on mount (once only)
  useEffect(() => {
    if (firstMessage && !firstMessageSentRef.current && !isLoading) {
      firstMessageSentRef.current = true;
      sendMessage(firstMessage);
    }
  }, [firstMessage, isLoading, sendMessage]);

  const handleSend = (message: string) => {
    sendMessage(message);
  };

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
