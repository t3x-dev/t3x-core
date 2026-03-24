'use client';

import { User } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { cn } from '@/lib/utils';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

interface ChatMessageProps {
  sender: 'user' | 'assistant';
  content: string;
  turnHash?: string;
  turnIndex?: number;
  isStreaming?: boolean;
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
}: ChatMessageProps) {
  const isUser = sender === 'user';

  const hoveredFrameId = useExtractionPanelStore((s) => s.hoveredFrameId);
  const hoveredSlotKey = useExtractionPanelStore((s) => s.hoveredSlotKey);
  const draft = useExtractionPanelStore((s) => s.draft);
  const setHoveredTurn = useExtractionPanelStore((s) => s.setHoveredTurn);
  const userTextRef = useRef<HTMLDivElement>(null);

  // Compute character offset from mouse position (user messages only)
  const handleUserMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!turnHash || !userTextRef.current) return;
      // caretRangeFromPoint returns a Range at the mouse cursor position
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range || !userTextRef.current.contains(range.startContainer)) {
        setHoveredTurn(turnHash);
        return;
      }
      // Walk text nodes to compute absolute character offset
      const walker = document.createTreeWalker(userTextRef.current, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node: Node | null = walker.nextNode();
      while (node) {
        if (node === range.startContainer) {
          offset += range.startOffset;
          break;
        }
        offset += (node.textContent?.length ?? 0);
        node = walker.nextNode();
      }
      setHoveredTurn(turnHash, offset);
    },
    [turnHash, setHoveredTurn]
  );

  // Compute highlight ranges for this message based on hovered frame/slot
  const highlightRanges = useMemo(() => {
    if (!hoveredFrameId) return [];
    const frame = draft.frames.find((f) => f.id === hoveredFrameId);
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
  }, [hoveredFrameId, hoveredSlotKey, draft.frames, turnHash, turnIndex]);

  const hasCharHighlights = highlightRanges.length > 0;
  const isWholeMessageHighlight =
    hoveredFrameId &&
    !hasCharHighlights &&
    (() => {
      const frame = draft.frames.find((f) => f.id === hoveredFrameId);
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
              <div
                ref={userTextRef}
                onMouseMove={handleUserMouseMove}
                className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap"
              >
                {hasCharHighlights ? (
                  <HighlightedText text={content} ranges={highlightRanges} />
                ) : (
                  content
                )}
              </div>
            ) : (
              <div
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
                      <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-[var(--accent-commit)] rounded-sm animate-pulse" />
                    )}
                  </>
                )}
              </div>
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
