'use client';

import { ArrowUpRight, Check, Copy, Loader2, Search, Terminal } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
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
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messages = chat.messages ?? [];
  const citations = chat.citations ?? [];
  const latestAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant')?.id;

  const copyMessage = useCallback(async (messageId: string, content: string) => {
    if (!content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopyError(null);
    } catch {
      setCopyError('Could not copy. Select the response text to copy it.');
      return;
    }
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, 1200);
  }, []);

  return (
    <Conversation className="min-h-0 bg-[var(--surface-panel)] text-[var(--text-primary)]">
      <ConversationContent
        scrollClassName="chat-scrollbar"
        className="mx-auto min-h-full w-full max-w-[820px] gap-7 px-5 pb-8 pt-7 md:px-8"
      >
        {messages.length === 0 && !chat.isLoading ? (
          <ConversationEmptyState className="my-auto min-h-[260px] items-start gap-5 px-0 py-10 text-left">
            <span className="flex size-10 items-center justify-center rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-app)]">
              <Terminal className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                What would you like to change?
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                Describe the outcome, add your sources, and shape the next version together.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-3">
              {[
                [
                  'Explore',
                  'Understand this workspace',
                  'Explain the current workspace and the changes it contains.',
                ],
                [
                  'Refine',
                  'Make a focused change',
                  'Help me refine this workspace. Ask me what I want to change first.',
                ],
                [
                  'Review',
                  'Find gaps and next steps',
                  'Review the current proposal for missing requirements and open questions.',
                ],
              ].map(([label, title, prompt]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    chat.setInput(prompt!);
                    document
                      .querySelector<HTMLTextAreaElement>('[aria-label="Workspace instruction"]')
                      ?.focus();
                  }}
                  className="group rounded-xl border border-[var(--stroke-divider)] p-3 text-left transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  <span className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                    {label}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="mt-2 block text-[13px] font-medium leading-5">{title}</span>
                </button>
              ))}
            </div>
          </ConversationEmptyState>
        ) : null}
        {copyError ? (
          <p role="alert" className="text-xs text-[var(--status-error)]">
            {copyError}
          </p>
        ) : null}
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
        <MessageContent className="max-w-[85%] rounded-[18px] border border-[var(--stroke-divider)] bg-[var(--surface-app)] px-4 py-2.5 text-[14px] leading-6 text-[var(--text-primary)] shadow-none">
          <p className="break-words whitespace-pre-wrap">{message.content}</p>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message className="w-full max-w-full gap-3" from="assistant">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
        <span className="flex size-6 items-center justify-center rounded-md bg-[var(--text-primary)] text-[var(--surface-panel)]">
          <Terminal className="size-3.5" aria-hidden="true" />
        </span>
        T3X{' '}
        <span className="font-normal text-[var(--text-tertiary)]">
          {isStreaming ? 'Working' : 'Assistant'}
        </span>
      </div>
      <MessageContent className="w-full max-w-full overflow-visible bg-transparent p-0">
        {children}
        <MessageResponse
          isAnimating={isStreaming}
          mode={isStreaming ? 'streaming' : 'static'}
          parseIncompleteMarkdown={isStreaming}
          skipHtml
        >
          {message.content}
        </MessageResponse>
        {!isStreaming ? (
          <MessageActions className="mt-3 gap-1 text-[var(--text-tertiary)] opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
        <output className="inline-flex items-center gap-2 py-2 text-[13px] text-[var(--text-secondary)]">
          <Loader2 className="size-3.5 animate-spin text-[var(--accent-commit)]" />
          Working…
        </output>
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
            Thinking
          </summary>
          {thinkingContent ? (
            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-[var(--text-tertiary)]">
              {thinkingContent}
            </p>
          ) : (
            <p className="mt-1 text-[12px] leading-5 text-[var(--text-tertiary)]">
              Thinking through your request…
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
