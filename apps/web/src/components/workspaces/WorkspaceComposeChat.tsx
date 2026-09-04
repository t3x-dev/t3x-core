'use client';

import { Check, Copy, Loader2, Search } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import type { WorkspaceComposeReviewController } from '@/hooks/workspaces/useWorkspaceComposeReviewController';
import { cn } from '@/utils/cn';

type WorkspaceComposeChatState = WorkspaceComposeReviewController['chat'];
type WorkspaceComposeCitation = NonNullable<WorkspaceComposeChatState['citations']>[number];

interface WorkspaceComposeChatProps {
  chat: WorkspaceComposeChatState;
}

export function WorkspaceComposeChat({ chat }: WorkspaceComposeChatProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messages = chat.messages ?? [];
  const citations = chat.citations ?? [];
  const latestAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant')?.id;

  const copyMessage = useCallback(async (messageId: string, content: string) => {
    if (!navigator.clipboard || !content.trim()) return;
    await navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, 1200);
  }, []);

  return (
    <Conversation className="min-h-0 bg-[var(--surface-app)] text-[var(--text-primary)]">
      <ConversationContent className="mx-auto min-h-full w-full max-w-[780px] gap-8 px-4 py-8 md:px-8">
        {messages.map((message) => {
          const isStreaming = message.id.endsWith(':streaming');
          const showCurrentStreamMeta = isStreaming && message.id === latestAssistantId;
          return (
            <ComposeChatMessage
              copied={copiedMessageId === message.id}
              isStreaming={isStreaming}
              key={message.id}
              message={message}
              onCopy={() => void copyMessage(message.id, message.content)}
            >
              {showCurrentStreamMeta ? (
                <CurrentStreamMeta
                  citations={citations}
                  isThinking={chat.isThinking}
                  searchQuery={chat.searchQuery}
                  thinkingContent={chat.thinkingContent}
                />
              ) : null}
            </ComposeChatMessage>
          );
        })}
        {chat.isLoading && !chat.isStreaming ? <PendingAssistantMessage /> : null}
        {!chat.isStreaming && citations.length > 0 && latestAssistantId ? (
          <CitationList citations={citations} />
        ) : null}
      </ConversationContent>
      <ConversationScrollButton aria-label="Scroll to latest message" />
    </Conversation>
  );
}

function ComposeChatMessage({
  message,
  isStreaming,
  copied,
  onCopy,
  children,
}: {
  message: WorkspaceComposeChatState['messages'][number];
  isStreaming: boolean;
  copied: boolean;
  onCopy: () => void;
  children?: ReactNode;
}) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <Message className="max-w-full" from="user">
        <MessageContent className="max-w-[72%] rounded-[var(--radius-workbench)] bg-[var(--hover-bg)] px-5 py-3 text-[15px] leading-6 text-[var(--text-primary)] shadow-none">
          <p className="break-words whitespace-pre-wrap">{message.content}</p>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent className="w-full max-w-[720px] overflow-visible bg-transparent p-0 text-[15px] leading-[1.7] text-[var(--text-primary)]">
        {children}
        <MessageResponse
          animated={false}
          caret={isStreaming ? 'block' : undefined}
          className={cn(
            'prose-chat max-w-none text-[15px] leading-[1.7] text-[var(--text-primary)]',
            '[&_pre]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto',
            isStreaming && 'streaming-text'
          )}
          codeBlockMaxHeight={420}
          isAnimating={isStreaming}
          lineNumbers={false}
          mode={isStreaming ? 'streaming' : 'static'}
          parseIncompleteMarkdown={isStreaming}
          skipHtml
          tableMaxHeight={360}
        >
          {message.content}
        </MessageResponse>
        {!isStreaming ? (
          <MessageActions className="mt-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <MessageAction
              aria-label={copied ? 'Message copied' : 'Copy message'}
              label={copied ? 'Copied' : 'Copy'}
              onClick={onCopy}
              tooltip={copied ? 'Copied' : 'Copy response'}
              variant="ghost"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </MessageAction>
          </MessageActions>
        ) : null}
      </MessageContent>
    </Message>
  );
}

function PendingAssistantMessage() {
  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent className="w-full max-w-[720px] bg-transparent p-0">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-1.5 text-[13px] text-[var(--text-secondary)] shadow-[var(--fx-shadow-sm)]">
          <Loader2 className="size-3.5 animate-spin text-[var(--accent-commit)]" />
          Preparing response
        </div>
      </MessageContent>
    </Message>
  );
}

function CurrentStreamMeta({
  isThinking,
  thinkingContent,
  searchQuery,
  citations,
}: {
  isThinking?: boolean;
  thinkingContent?: string;
  searchQuery?: string | null;
  citations?: WorkspaceComposeCitation[];
}) {
  if (!isThinking && !thinkingContent && !searchQuery && (!citations || citations.length === 0)) {
    return null;
  }

  return (
    <div className="mb-3 grid max-w-[560px] gap-2 text-[13px] text-[var(--text-secondary)]">
      {searchQuery ? (
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-1.5">
          <Search className="size-3.5 text-[var(--accent-commit)]" />
          <span className="min-w-0 truncate">Searching {searchQuery}</span>
        </div>
      ) : null}
      {isThinking || thinkingContent ? (
        <details className="group rounded-[var(--radius-workbench-group)] border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-3 py-2">
          <summary className="cursor-pointer list-none font-medium text-[var(--text-secondary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-commit)]/30">
            Reasoning signal
          </summary>
          {thinkingContent ? (
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[var(--text-tertiary)]">
              {thinkingContent}
            </p>
          ) : (
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-tertiary)]">
              Receiving reasoning events.
            </p>
          )}
        </details>
      ) : null}
      {citations && citations.length > 0 ? <CitationList citations={citations} compact /> : null}
    </div>
  );
}

function CitationList({
  citations,
  compact = false,
}: {
  citations: WorkspaceComposeCitation[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex max-w-[720px] flex-wrap gap-2 text-[12px] leading-5 text-[var(--text-secondary)]',
        compact ? 'mt-1' : '-mt-5 ml-0'
      )}
    >
      {citations.slice(0, 4).map((citation, index) => (
        <a
          className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-2.5 py-1 text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:text-[var(--accent-commit)]"
          href={citation.url}
          key={`${citation.url}-${index}`}
          rel="noreferrer"
          target="_blank"
        >
          <span className="font-medium">Source {index + 1}</span>
          <span className="truncate">{citation.title || citation.url}</span>
        </a>
      ))}
    </div>
  );
}
