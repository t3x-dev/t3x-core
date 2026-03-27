// @ts-nocheck — tree-primary migration: needs rework
'use client';

import { Pencil, RefreshCw, User } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '@/lib/api/chat';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { CitationChips } from './CitationChips';
import { CodeBlock } from './CodeBlock';
import { ThinkingSection } from './ThinkingSection';
import { type Frame, contentToFrames, treesToFrames } from '@/lib/treeCompat';

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

  const hoveredFrameId = useExtractionPanelStore((s) => s.hoveredFrameId);
  const hoveredSlotKey = useExtractionPanelStore((s) => s.hoveredSlotKey);
  const draft = useExtractionPanelStore((s) => s.draft);
  const setHoveredTurn = useExtractionPanelStore((s) => s.setHoveredTurn);
  const textRef = useRef<HTMLDivElement>(null);

  // Compute character offset from mouse position (user and assistant messages)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!turnHash || !textRef.current) return;
      // caretRangeFromPoint returns a Range at the mouse cursor position
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range || !textRef.current.contains(range.startContainer)) {
        setHoveredTurn(turnHash);
        return;
      }
      // Walk text nodes to compute absolute character offset
      const walker = document.createTreeWalker(textRef.current, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node: Node | null = walker.nextNode();
      while (node) {
        if (node === range.startContainer) {
          offset += range.startOffset;
          break;
        }
        offset += node.textContent?.length ?? 0;
        node = walker.nextNode();
      }
      setHoveredTurn(turnHash, offset);
    },
    [turnHash, setHoveredTurn]
  );

  // Compute highlight ranges for this message based on hovered frame/slot
  const highlightRanges = useMemo(() => {
    if (!hoveredFrameId) return [];
    const frame = draft.trees.find((f) => f.id === hoveredFrameId);
    if (!frame) return [];

    // If slot_sources exist, use character-level highlighting per turn_hash
    if (frame.slot_sources) {
      if (hoveredSlotKey && frame.slot_sources[hoveredSlotKey]) {
        // Specific slot hovered — highlight just that span if turn matches
        const ref = frame.slot_sources[hoveredSlotKey];
        if (turnHash && ref.turn_hash && turnHash === ref.turn_hash) {
          return [{ start: ref.start_char, end: ref.end_char }];
        }
        // Fallback: match by turn tag (T1, T2, ...)
        if (turnIndex != null && ref.turn === `T${turnIndex}`) {
          return [{ start: ref.start_char, end: ref.end_char }];
        }
        return [];
      }
      // Frame header hovered — highlight ALL slots from this turn
      const ranges: Array<{ start: number; end: number }> = [];
      for (const ref of Object.values(frame.slot_sources)) {
        const hashMatch = turnHash && ref.turn_hash && turnHash === ref.turn_hash;
        const tagMatch = turnIndex != null && ref.turn === `T${turnIndex}`;
        if (hashMatch || tagMatch) {
          ranges.push({ start: ref.start_char, end: ref.end_char });
        }
      }
      return ranges;
    }

    // No slot_sources — check if this turn matches frame's source (whole-message tint fallback)
    const isSourceTurn = (() => {
      if (!frame.source) return false;
      if (turnIndex != null && frame.source === `T${turnIndex}`) return true;
      if (turnHash && frame.source.includes(':')) {
        const hashPart = frame.source.split(':')[1];
        return turnHash.includes(hashPart);
      }
      return false;
    })();

    // Return empty ranges — caller will check isSourceTurn via isWholeMessageHighlight
    return isSourceTurn ? [] : [];
  }, [hoveredFrameId, hoveredSlotKey, draft.trees, turnHash, turnIndex]);

  const hasCharHighlights = highlightRanges.length > 0;
  const isWholeMessageHighlight =
    hoveredFrameId &&
    !hasCharHighlights &&
    (() => {
      const frame = draft.trees.find((f) => f.id === hoveredFrameId);
      if (!frame) return false;
      // Check if any slot_source points to this turn
      if (frame.slot_sources) {
        for (const ref of Object.values(frame.slot_sources)) {
          if (turnHash && ref.turn_hash && turnHash === ref.turn_hash) return true;
          if (turnIndex != null && ref.turn === `T${turnIndex}`) return true;
        }
      }
      // Fallback: check frame.source
      if (!frame.source) return false;
      if (turnIndex != null && frame.source === `T${turnIndex}`) return true;
      if (turnHash && frame.source.includes(':')) {
        return turnHash.includes(frame.source.split(':')[1]);
      }
      return false;
    })();

  return (
    <div
      className={cn(
        'group w-full py-4 transition-colors duration-200 relative',
        'animate-in fade-in duration-200'
      )}
      style={{
        background: isWholeMessageHighlight ? 'rgba(96, 165, 250, 0.08)' : 'transparent',
      }}
      onMouseEnter={() => turnHash && setHoveredTurn(turnHash)}
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
                    onMouseMove={handleMouseMove}
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
                  onMouseMove={handleMouseMove}
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
