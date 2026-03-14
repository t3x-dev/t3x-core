'use client';

import { User } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  sender: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ sender, content, isStreaming }: ChatMessageProps) {
  const isUser = sender === 'user';

  return (
    <div className={cn('group w-full py-4', 'animate-in fade-in duration-200')}>
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex gap-3">
          {/* Avatar */}
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium mt-0.5',
              isUser
                ? 'bg-[var(--accent-commit)] text-white'
                : 'bg-gradient-to-br from-[var(--accent-commit)]/20 to-indigo-500/20 text-[var(--accent-commit)] ring-1 ring-[var(--accent-commit)]/20'
            )}
          >
            {isUser ? <User className="h-3.5 w-3.5" /> : 'T3'}
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {/* Role label */}
            <div className="mb-1 text-xs font-semibold text-[var(--text-primary)]">
              {isUser ? 'You' : 'T3X'}
            </div>

            {/* Message body */}
            {isUser ? (
              <div className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                {content}
              </div>
            ) : (
              <div
                className={cn(
                  'prose-chat text-sm leading-relaxed text-[var(--text-primary)]',
                  isStreaming && 'streaming-text'
                )}
              >
                <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
                {isStreaming && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-[var(--accent-commit)] rounded-sm animate-pulse" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
