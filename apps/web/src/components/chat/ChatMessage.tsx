'use client';

import { Pencil, RefreshCw, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '@/lib/api/chat';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { CitationChips } from './CitationChips';
import { CodeBlock } from './CodeBlock';
import { ThinkingSection } from './ThinkingSection';
import { traceYamlToChat, traceChatToYaml } from '@/lib/hoverTrace';

interface ChatMessageProps {
  sender: 'user' | 'assistant';
  content: string;
  turnHash?: string;
  turnIndex?: number;
  isStreaming?: boolean;
  citations?: Citation[];
  thinkingContent?: string;
  isThinking?: boolean;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
}

/**
 * Render text content with character-range highlights.
 * Splits the text into segments: normal text and highlighted spans.
 */
function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: Array<{ start: number; end: number }>;
}) {
  if (ranges.length === 0) return <>{text}</>;

  // Sort ranges and merge overlaps
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const parts: Array<{ text: string; highlighted: boolean }> = [];
  let cursor = 0;
  for (const r of merged) {
    const start = Math.max(0, r.start);
    const end = Math.min(text.length, r.end);
    if (cursor < start) {
      parts.push({ text: text.slice(cursor, start), highlighted: false });
    }
    parts.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlighted: false });
  }

  return (
    <>
      {parts.map((p, i) =>
        p.highlighted ? (
          <mark
            key={i}
            style={{
              background: 'rgba(96, 165, 250, 0.25)',
              borderRadius: 2,
              padding: '1px 0',
              color: 'inherit',
            }}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

export function ChatMessage({
  sender,
  content,
  turnHash,
  turnIndex,
  isStreaming,
  citations,
  thinkingContent,
  isThinking,
  onRegenerate,
  onEdit,
}: ChatMessageProps) {
  const isUser = sender === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const hoveredNodeId = useExtractionPanelStore((s) => s.hoveredNodeId);
  const hoveredSlotKey = useExtractionPanelStore((s) => s.hoveredSlotKey);
  const draft = useExtractionPanelStore((s) => s.draft);
  const setHoveredTurn = useExtractionPanelStore((s) => s.setHoveredTurn);
  const textRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  // ── YAML → Chat: trace hovered YAML node to this message ──
  const trace = useMemo(() => {
    if (!hoveredNodeId) return null;
    return traceYamlToChat(draft, hoveredNodeId, hoveredSlotKey);
  }, [hoveredNodeId, hoveredSlotKey, draft]);

  // Does the hovered YAML node come from THIS message?
  const isSourceMessage = trace?.sourceTurnIndex != null && turnIndex != null && trace.sourceTurnIndex === turnIndex;

  // Try to find quote text in this message for character-level highlighting
  const highlightRanges = useMemo(() => {
    if (!isSourceMessage || !trace) return [];
    const quotes = trace.allQuotes;
    if (quotes.length === 0 || !content) return [];

    const lowerContent = content.toLowerCase();
    const ranges: Array<{ start: number; end: number }> = [];

    for (const quote of quotes) {
      const lowerQuote = quote.toLowerCase();
      let searchFrom = 0;
      while (searchFrom < lowerContent.length) {
        const idx = lowerContent.indexOf(lowerQuote, searchFrom);
        if (idx === -1) break;
        ranges.push({ start: idx, end: idx + quote.length });
        searchFrom = idx + quote.length;
      }
    }
    ranges.sort((a, b) => a.start - b.start);
    return ranges;
  }, [isSourceMessage, trace, content]);

  const hasCharHighlights = highlightRanges.length > 0;
  // Whole-message tint: when this is the source message for hovered YAML
  const isWholeMessageHighlight = isSourceMessage && !hasCharHighlights;

  // Debug: log hover state
  if (hoveredNodeId && trace) {
    console.log(`[hover-trace] msg turnIndex=${turnIndex} | hovered=${hoveredNodeId} | trace.sourceTurn=${trace.sourceTurnIndex} | isSource=${isSourceMessage} | quotes=${trace.allQuotes.length} | charHighlights=${highlightRanges.length} | wholeTint=${isWholeMessageHighlight}`);
  }

  // Auto-scroll this message into view when it's the source of hovered YAML
  useEffect(() => {
    if (isSourceMessage && messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSourceMessage]);

  return (
    <div
      ref={messageRef}
      className={cn(
        'group w-full py-4 transition-colors duration-200 relative',
        'animate-in fade-in duration-200'
      )}
      style={{
        background: isWholeMessageHighlight
          ? 'rgba(96, 165, 250, 0.15)'
          : isSourceMessage && hasCharHighlights
            ? 'rgba(96, 165, 250, 0.06)'
            : 'transparent',
        borderLeft: isSourceMessage ? '3px solid rgba(96, 165, 250, 0.5)' : undefined,
      }}
      onMouseEnter={() => turnIndex != null && setHoveredTurn(String(turnIndex))}
      onMouseLeave={() => setHoveredTurn(null)}
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
            <div className="mb-1 text-xs font-semibold text-[var(--text-primary)]">
              {isUser ? 'You' : 'T3X'}
            </div>

            {isUser ? (
              <div className="relative">
                {/* Edit button - top right on hover */}
                {!isStreaming && onEdit && !isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-1 right-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditContent(content);
                        setIsEditing(true);
                      }}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      title="Edit message"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-2 rounded border border-[var(--border-primary)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-commit)]"
                      rows={3}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="px-2 py-1 text-xs rounded text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEdit?.(editContent);
                          setIsEditing(false);
                        }}
                        className="px-2 py-1 text-xs rounded bg-[var(--accent-commit)] text-white hover:opacity-90"
                      >
                        Save & Resend
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={textRef}
                                        className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap"
                  >
                    {hasCharHighlights ? (
                      <HighlightedText text={content} ranges={highlightRanges} />
                    ) : (
                      content
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {thinkingContent && (
                  <ThinkingSection content={thinkingContent} isStreaming={isThinking} />
                )}
                <div
                  ref={textRef}
                                    className={cn(
                    'prose-chat text-sm leading-relaxed text-[var(--text-primary)]',
                    isStreaming && 'streaming-text'
                  )}
                >
                  {hasCharHighlights ? (
                    // For assistant messages with highlights, render as plain text with highlights
                    // (Markdown rendering would change character offsets)
                    <div className="whitespace-pre-wrap">
                      <HighlightedText text={content} ranges={highlightRanges} />
                    </div>
                  ) : (
                    <>
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children }) {
                            const lang = className?.replace('language-', '');
                            const codeStr = String(children);
                            if (lang || codeStr.includes('\n')) {
                              return <CodeBlock language={lang}>{codeStr}</CodeBlock>;
                            }
                            return (
                              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-[0.8125rem] font-mono">
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {content}
                      </Markdown>
                      {isStreaming && (
                        <span
                          className="inline-block w-0.5 h-[1.1em] ml-0.5 -mb-0.5 rounded-sm"
                          style={{
                            background: 'var(--accent-commit)',
                            animation: 'blink 1s step-end infinite',
                          }}
                        />
                      )}
                    </>
                  )}
                  {!isUser && !isStreaming && citations && citations.length > 0 && (
                    <CitationChips citations={citations} />
                  )}
                </div>
                {!isUser && !isStreaming && onRegenerate && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    <button
                      type="button"
                      onClick={onRegenerate}
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                      title="Regenerate response"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Highlight indicator bar on left edge */}
      {(isWholeMessageHighlight || hasCharHighlights) && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: 'rgb(96, 165, 250)',
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}
    </div>
  );
}
