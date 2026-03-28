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
import { type CompatNode, contentToNodes, treesToNodes } from '@/lib/treeCompat';

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

  // Convert to compat trees for id-based lookup and source refs
  const nodes = useMemo(() => contentToNodes(draft), [draft]);

  // Find the hovered tree node — match by dot-path (compat) or slash-path (TreeNode)
  const hoveredNode = useMemo(() => {
    if (!hoveredNodeId) return null;
    // Try direct match, then convert separators
    return nodes.find((f) => f.id === hoveredNodeId)
      ?? nodes.find((f) => f.id === hoveredNodeId.replace(/\//g, '.'))
      ?? nodes.find((f) => f.id.replace(/\./g, '/') === hoveredNodeId)
      ?? null;
  }, [hoveredNodeId, nodes]);

  // Collect ALL slot_quotes from the entire draft tree (they may be on root with dot-path keys)
  const allQuotes = useMemo(() => {
    const quotes: Record<string, string> = {};
    function collectQuotes(node: import('@t3x-dev/core').TreeNode, prefix: string) {
      if (node.slot_quotes) {
        for (const [k, v] of Object.entries(node.slot_quotes)) {
          const fullKey = prefix ? `${prefix}.${k}` : k;
          quotes[fullKey] = v;
          quotes[k] = v; // also store without prefix for direct match
        }
      }
      for (const child of node.children) {
        collectQuotes(child, prefix ? `${prefix}.${child.key}` : child.key);
      }
    }
    for (const tree of draft.trees) {
      collectQuotes(tree, '');
    }
    return quotes;
  }, [draft.trees]);

  // Collect quotes to highlight based on what's hovered
  const quotesToHighlight = useMemo(() => {
    if (!hoveredNodeId) return [];

    // Normalize hovered path to dot-path
    const hoveredPath = hoveredNodeId.replace(/\//g, '.');

    if (hoveredSlotKey) {
      // Specific slot hovered — look for quote with various key formats
      const candidates = [
        hoveredSlotKey,
        `${hoveredPath}.${hoveredSlotKey}`,
        // Try parent path variants
        hoveredPath.includes('.') ? `${hoveredPath.split('.').slice(1).join('.')}.${hoveredSlotKey}` : null,
      ].filter(Boolean) as string[];

      for (const key of candidates) {
        if (allQuotes[key]) return [allQuotes[key]];
      }
      return [];
    }

    // Node header hovered — find all quotes that start with this node's path
    const matchingQuotes: string[] = [];
    for (const [key, value] of Object.entries(allQuotes)) {
      if (key.startsWith(hoveredPath + '.') || key.startsWith(hoveredPath.split('.').slice(1).join('.') + '.')) {
        matchingQuotes.push(value);
      }
    }
    return matchingQuotes;
  }, [hoveredNodeId, hoveredSlotKey, allQuotes]);

  // Find all quote texts in this message's content → highlight ranges
  const highlightRanges = useMemo(() => {
    if (quotesToHighlight.length === 0 || !content) return [];
    const lowerContent = content.toLowerCase();
    const ranges: Array<{ start: number; end: number }> = [];

    for (const quote of quotesToHighlight) {
      const lowerQuote = quote.toLowerCase();
      let searchFrom = 0;
      // Find all occurrences
      while (searchFrom < lowerContent.length) {
        const idx = lowerContent.indexOf(lowerQuote, searchFrom);
        if (idx === -1) break;
        ranges.push({ start: idx, end: idx + quote.length });
        searchFrom = idx + quote.length;
      }
    }

    // Sort and dedupe overlapping ranges
    ranges.sort((a, b) => a.start - b.start);
    return ranges;
  }, [quotesToHighlight, content]);

  const hasCharHighlights = highlightRanges.length > 0;
  // Whole-message tint: when hovering a YAML node, tint the source message
  // Use this as fallback when no character-level highlights were found
  const isWholeMessageHighlight =
    hoveredNode &&
    !hasCharHighlights &&
    (() => {
      // Check node.source (turn tag like "T2")
      const src = hoveredNode.source;
      if (src && turnIndex != null) {
        if (src === `T${turnIndex + 1}`) return true;
        // Hash-based match
        if (turnHash && src.includes(':') && turnHash.includes(src.split(':')[1])) return true;
      }
      // If no source on node, check if any of its quotes appear in this message
      if (hoveredNode.slot_quotes && content) {
        const lowerContent = content.toLowerCase();
        for (const quote of Object.values(hoveredNode.slot_quotes)) {
          if (lowerContent.includes(quote.toLowerCase())) return true;
        }
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
