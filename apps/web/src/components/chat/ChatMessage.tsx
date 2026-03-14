'use client';

import { User } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

interface ChatMessageProps {
  sender: 'user' | 'assistant';
  content: string;
  turnHash?: string;
  turnIndex?: number; // 1-based turn index for matching "T3" source tags
  isStreaming?: boolean;
}

export function ChatMessage({ sender, content, turnHash, turnIndex, isStreaming }: ChatMessageProps) {
  const isUser = sender === 'user';

  // Check if this message should be highlighted (a YAML frame sourced from this turn is hovered)
  const hoveredFrameId = useExtractionPanelStore((s) => s.hoveredFrameId);
  const draft = useExtractionPanelStore((s) => s.draft);
  const setHoveredTurnHash = useExtractionPanelStore((s) => s.setHoveredTurnHash);

  // Determine if this turn is the source of the currently hovered frame
  const isHighlighted = (() => {
    if (!hoveredFrameId) return false;
    const frame = draft.frames.find((f) => f.id === hoveredFrameId);
    if (!frame?.source) return false;

    // Match "T3" against turnIndex, or "T3:abc12345" against turnHash prefix
    const source = frame.source;
    if (turnIndex && source === `T${turnIndex}`) return true;
    if (turnHash && source.includes(':')) {
      const hashPart = source.split(':')[1];
      return turnHash.includes(hashPart);
    }
    return false;
  })();

  return (
    <div
      className={cn('group w-full py-4 transition-colors duration-200', 'animate-in fade-in duration-200')}
      style={{
        background: isHighlighted ? 'rgba(96, 165, 250, 0.08)' : 'transparent',
      }}
      onMouseEnter={() => turnHash && setHoveredTurnHash(turnHash)}
      onMouseLeave={() => setHoveredTurnHash(null)}
    >
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

      {/* Highlight indicator bar on the left edge */}
      {isHighlighted && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: 'rgb(96, 165, 250)',
          borderRadius: '0 2px 2px 0',
        }} />
      )}
    </div>
  );
}
