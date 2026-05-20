'use client';

import { Pencil, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import type { CommittedHighlight } from '@/domain/commit/committedHighlights';
import { collectQuotesForTurn, computeUncoveredRanges } from '@/domain/commit/coverageRanges';
import { traceYamlToChat } from '@/domain/hoverTrace';
import type { SourceMapping } from '@/domain/sourceMap';
import type { SourceTextDraftSpan } from '@/domain/sourceTextDrafts';
import { useSlotActions } from '@/hooks/shared/useSlotActions';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { Citation } from '@/types/api';
import { cn } from '@/utils/cn';
import { CitationChips } from './CitationChips';
import { CodeBlock } from './CodeBlock';
import { CommittedHighlightTooltip } from './CommittedHighlightTooltip';
import { SourceHighlight } from './SourceHighlight';
import { ThinkingSection } from './ThinkingSection';

interface ChatMessageProps {
  sender: 'user' | 'assistant';
  content: string;
  projectId?: string;
  conversationId?: string;
  turnHash?: string;
  turnIndex?: number;
  isStreaming?: boolean;
  citations?: Citation[];
  thinkingContent?: string;
  isThinking?: boolean;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  sourceMap?: SourceMapping[];
  committedHighlights?: CommittedHighlight[];
  inlineEditSpans?: SourceTextDraftSpan[];
  coverageMode?: boolean;
}

/**
 * Render text content with character-range highlights (YAML → Chat direction).
 * Used when YAML hover triggers chat highlights (blue tint).
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

  const parts: Array<{ key: string; text: string; highlighted: boolean }> = [];
  let cursor = 0;
  for (const r of merged) {
    const start = Math.max(0, r.start);
    const end = Math.min(text.length, r.end);
    if (cursor < start) {
      parts.push({
        key: `plain-${cursor}-${start}`,
        text: text.slice(cursor, start),
        highlighted: false,
      });
    }
    parts.push({
      key: `highlight-${start}-${end}`,
      text: text.slice(start, end),
      highlighted: true,
    });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({
      key: `plain-${cursor}-${text.length}`,
      text: text.slice(cursor),
      highlighted: false,
    });
  }

  return (
    <>
      {parts.map((p) =>
        p.highlighted ? (
          <mark
            key={p.key}
            style={{
              background: 'color-mix(in srgb, var(--source) 25%, transparent)',
              borderBottom: '2px solid var(--source)',
              borderRadius: 3,
              padding: '2px 4px',
              color: 'inherit',
            }}
          >
            {p.text}
          </mark>
        ) : (
          <span key={p.key}>{p.text}</span>
        )
      )}
    </>
  );
}

function InlineEditedText({ text, spans }: { text: string; spans: SourceTextDraftSpan[] }) {
  const visibleSpans = spans
    .filter((span) => span.end > span.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (visibleSpans.length === 0) return <>{text}</>;

  const parts: Array<{ key: string; text: string; highlighted: boolean }> = [];
  let cursor = 0;
  for (const span of visibleSpans) {
    const start = Math.max(0, Math.min(text.length, span.start));
    const end = Math.max(start, Math.min(text.length, span.end));
    if (start < cursor) continue;
    if (cursor < start) {
      parts.push({
        key: `plain-${cursor}-${start}`,
        text: text.slice(cursor, start),
        highlighted: false,
      });
    }
    parts.push({
      key: `inline-${span.id}`,
      text: text.slice(start, end),
      highlighted: true,
    });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({
      key: `plain-${cursor}-${text.length}`,
      text: text.slice(cursor),
      highlighted: false,
    });
  }

  return (
    <>
      {parts.map((part) =>
        part.highlighted ? (
          <mark
            key={part.key}
            className="rounded px-1"
            title="Human inline edit"
            style={{
              background: 'color-mix(in srgb, var(--status-info) 18%, transparent)',
              color: 'inherit',
            }}
          >
            {part.text}
          </mark>
        ) : (
          <span key={part.key}>{part.text}</span>
        )
      )}
    </>
  );
}

// ── Source-mapped text rendering (Chat → YAML direction) ──

interface SourceSegment {
  key: string;
  text: string;
  mapping: SourceMapping | null;
}

/**
 * Split content into segments: normal text interleaved with source-mapped spans.
 * Handles overlapping mappings by merging them.
 */
function splitIntoSegments(content: string, mappings: SourceMapping[]): SourceSegment[] {
  if (mappings.length === 0) {
    return [{ key: `plain-0-${content.length}`, text: content, mapping: null }];
  }

  // Sort and deduplicate by position (multiple mappings at same position → pick first)
  const sorted = [...mappings].sort((a, b) => a.start - b.start || a.end - b.end);

  const segments: SourceSegment[] = [];
  let cursor = 0;

  for (const m of sorted) {
    const start = Math.max(0, m.start);
    const end = Math.min(content.length, m.end);
    if (start < cursor) continue; // skip overlapping

    if (cursor < start) {
      segments.push({
        key: `plain-${cursor}-${start}`,
        text: content.slice(cursor, start),
        mapping: null,
      });
    }
    segments.push({
      key: `mapped-${m.treePath}-${m.slotKey ?? 'slot'}-${start}-${end}`,
      text: content.slice(start, end),
      mapping: m,
    });
    cursor = end;
  }

  if (cursor < content.length) {
    segments.push({
      key: `plain-${cursor}-${content.length}`,
      text: content.slice(cursor),
      mapping: null,
    });
  }

  return segments;
}

/**
 * Render message content with source-mapped interactive spans.
 * Each extracted span gets a purple background (default) or green underline (review phase)
 * and click/hover handlers.
 */
function SourceMappedText({
  content,
  mappings,
  hoveredNodeId,
  onClickSlot,
  isReviewPhase,
  onDeleteSlot,
}: {
  content: string;
  mappings: SourceMapping[];
  hoveredNodeId: string | null;
  onClickSlot: (treePath: string, slotKey: string | null) => void;
  isReviewPhase: boolean;
  onDeleteSlot?: (nodeId: string, slotKey: string) => void;
}) {
  const segments = useMemo(() => splitIntoSegments(content, mappings), [content, mappings]);

  return (
    <>
      {segments.map((seg) => {
        if (!seg.mapping) {
          return <span key={seg.key}>{seg.text}</span>;
        }

        const m = seg.mapping;
        const isActive = hoveredNodeId === m.treePath;

        // For review phase: use SourceHighlight with tooltip + edit/delete
        if (isReviewPhase) {
          return (
            <SourceHighlight
              key={seg.key}
              text={seg.text}
              nodeId={m.treePath}
              slotKey={m.slotKey ?? ''}
              isActive={isActive}
              onEdit={(nid, sk) => onClickSlot(nid, sk)}
              onDelete={onDeleteSlot ? (nid, sk) => onDeleteSlot(nid, sk) : undefined}
            />
          );
        }

        // Non-review phase: green underline default, purple when active
        const spanStyle: React.CSSProperties = {
          background: isActive
            ? 'color-mix(in srgb, var(--source) 30%, transparent)'
            : 'color-mix(in srgb, var(--status-success) 12%, transparent)',
          borderBottom: isActive ? '2px solid var(--source)' : '2px solid var(--status-success)',
          borderRadius: 2,
          padding: '1px 0',
          color: 'inherit',
          cursor: 'pointer',
          transition: 'background 0.15s, border-bottom 0.15s',
        };

        return (
          <span
            key={seg.key}
            data-tree-path={m.treePath}
            data-slot-key={m.slotKey}
            data-source-highlight={isActive ? 'active' : 'default'}
            style={spanStyle}
            onClick={(e) => {
              e.stopPropagation();
              onClickSlot(m.treePath, m.slotKey);
            }}
          >
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

/**
 * Render text with persistent green underline highlights for committed knowledge.
 * Each highlighted span shows a tooltip on hover.
 */
function CommittedHighlightText({
  content,
  highlights,
}: {
  content: string;
  highlights: CommittedHighlight[];
}) {
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const parts: Array<{ key: string; text: string; highlight: CommittedHighlight | null }> = [];
  let cursor = 0;

  for (const h of sorted) {
    const start = Math.max(0, h.start);
    const end = Math.min(content.length, h.end);
    if (start < cursor) continue;

    if (cursor < start) {
      parts.push({
        key: `plain-${cursor}-${start}`,
        text: content.slice(cursor, start),
        highlight: null,
      });
    }
    parts.push({
      key: `highlight-${h.commitHash}-${h.nodeText}-${start}-${end}`,
      text: content.slice(start, end),
      highlight: h,
    });
    cursor = end;
  }

  if (cursor < content.length) {
    parts.push({
      key: `plain-${cursor}-${content.length}`,
      text: content.slice(cursor),
      highlight: null,
    });
  }

  return (
    <>
      {parts.map((p) =>
        p.highlight ? (
          <CommittedHighlightTooltip key={p.key} highlight={p.highlight}>
            <span
              style={{
                borderBottom:
                  '2px solid color-mix(in srgb, var(--status-success) 60%, transparent)',
                paddingBottom: 1,
                cursor: 'default',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--status-success)';
                e.currentTarget.style.background =
                  'color-mix(in srgb, var(--status-success) 8%, transparent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--status-success) 60%, transparent)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {p.text}
            </span>
          </CommittedHighlightTooltip>
        ) : (
          <span key={p.key}>{p.text}</span>
        )
      )}
    </>
  );
}

/**
 * Render text with uncovered ranges highlighted in gray dashed style.
 * Used in coverage mode to show what was NOT extracted.
 */
function CoverageText({
  text,
  uncoveredRanges,
}: {
  text: string;
  uncoveredRanges: Array<{ start: number; end: number }>;
}) {
  if (uncoveredRanges.length === 0) return <>{text}</>;

  const parts: Array<{ key: string; text: string; uncovered: boolean }> = [];
  let cursor = 0;
  for (const r of uncoveredRanges) {
    const start = Math.max(0, r.start);
    const end = Math.min(text.length, r.end);
    if (cursor < start) {
      parts.push({
        key: `covered-${cursor}-${start}`,
        text: text.slice(cursor, start),
        uncovered: false,
      });
    }
    parts.push({
      key: `uncovered-${start}-${end}`,
      text: text.slice(start, end),
      uncovered: true,
    });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({
      key: `covered-${cursor}-${text.length}`,
      text: text.slice(cursor),
      uncovered: false,
    });
  }

  return (
    <>
      {parts.map((p) =>
        p.uncovered ? (
          <span
            key={p.key}
            style={{
              background: 'color-mix(in srgb, var(--text-tertiary) 8%, transparent)',
              borderBottom: '1px dashed var(--text-tertiary)',
              borderRadius: 2,
              padding: '1px 0',
            }}
          >
            {p.text}
          </span>
        ) : (
          <span key={p.key}>{p.text}</span>
        )
      )}
    </>
  );
}

export function ChatMessage({
  sender,
  content,
  projectId,
  conversationId,
  turnHash,
  turnIndex,
  isStreaming,
  citations,
  thinkingContent,
  isThinking,
  onRegenerate,
  onEdit,
  sourceMap,
  committedHighlights,
  inlineEditSpans,
  coverageMode,
}: ChatMessageProps) {
  const isUser = sender === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const { deleteSlot } = useSlotActions();
  const hoveredNodeId = useWorkspaceStore((s) => s.selectedNodePath);
  const hoveredSlotKey = useWorkspaceStore((s) => s.selectedSlotKey);
  const scrollToCenter = useWorkspaceStore((s) => s.scrollToCenter);
  const hoverSourceIndex = useWorkspaceStore((s) => s.sourceIndex);
  const turns = useWorkspaceStore((s) => s.turns);
  const wsMode = useWorkspaceStore((s) => s.mode);
  const isReviewPhase = wsMode === 'executed' || wsMode === 'committing';
  const textRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  // ── YAML → Chat: trace hovered YAML node to this message ──
  const trace = useMemo(() => {
    if (!hoveredNodeId) return null;
    return traceYamlToChat(hoverSourceIndex, turns, hoveredNodeId, hoveredSlotKey);
  }, [hoveredNodeId, hoveredSlotKey, hoverSourceIndex, turns]);

  // Does the hovered YAML node come from THIS message?
  const isSourceMessage =
    trace?.sourceTurnIndex != null && turnIndex != null && trace.sourceTurnIndex === turnIndex;

  // Try to find quote text in this message for character-level highlighting (YAML → Chat)
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

  // ── Coverage mode: compute uncovered ranges ──
  const sourceIndex = useWorkspaceStore((s) => s.sourceIndex);
  const uncoveredRanges = useMemo(() => {
    if (!coverageMode || !content || !turnHash) return [];
    const quotes = collectQuotesForTurn(sourceIndex, turnHash);
    return computeUncoveredRanges(content, quotes);
  }, [coverageMode, content, turnHash, sourceIndex]);

  const hasCharHighlights = highlightRanges.length > 0;
  const hasSourceMappings = (sourceMap?.length ?? 0) > 0;
  const hasCommittedHighlights = (committedHighlights?.length ?? 0) > 0;
  const hasInlineEditSpans = inlineEditSpans?.some((span) => span.end > span.start) ?? false;
  // Whole-message tint: when this is the source message for hovered YAML
  const isWholeMessageHighlight = isSourceMessage && !hasCharHighlights;

  const handleClickSlot = useCallback((treePath: string, slotKey: string | null) => {
    useWorkspaceStore
      .getState()
      .select('chat', { nodePath: treePath, slotKey: slotKey ?? undefined });
  }, []);

  // Auto-scroll this message into view when it's the source of hovered YAML
  useEffect(() => {
    if (isSourceMessage && messageRef.current) {
      messageRef.current.scrollIntoView({
        behavior: 'smooth',
        block: scrollToCenter ? 'center' : 'nearest',
      });
    }
  }, [isSourceMessage, scrollToCenter]);

  // Rendering priority: YAML highlights > inline source edits > source-mapped spans > committed highlights > markdown
  // Source-mapped spans only render when a YAML node is actively selected (click-triggered)
  const useCoverageHighlights = coverageMode && uncoveredRanges.length > 0;
  const useYamlHighlights = hasCharHighlights && !useCoverageHighlights;
  const useInlineEditHighlights =
    hasInlineEditSpans && !useYamlHighlights && !useCoverageHighlights;
  const hasActiveSelection = !!hoveredNodeId;
  const useSourceMappedSpans =
    hasActiveSelection &&
    !useYamlHighlights &&
    !useInlineEditHighlights &&
    !useCoverageHighlights &&
    hasSourceMappings;
  const useCommittedHighlightSpans =
    !useYamlHighlights &&
    !useInlineEditHighlights &&
    !useSourceMappedSpans &&
    !useCoverageHighlights &&
    hasCommittedHighlights;

  const showSourceEditHint = !isUser && !isStreaming && Boolean(turnHash);

  return (
    <div
      ref={messageRef}
      data-project-id={projectId}
      data-conversation-id={conversationId}
      data-turn-hash={turnHash}
      data-turn-role={sender}
      className={cn(
        'group relative w-full py-5 transition-colors duration-200',
        'animate-in fade-in duration-200'
      )}
      style={{
        background: isWholeMessageHighlight
          ? 'color-mix(in srgb, var(--source) 10%, transparent)'
          : isSourceMessage && hasCharHighlights
            ? 'color-mix(in srgb, var(--source) 6%, transparent)'
            : 'transparent',
        borderLeft: isSourceMessage ? '3px solid var(--source)' : undefined,
      }}
    >
      <div className="mx-auto max-w-[620px] px-5">
        <div className={cn(isUser ? 'flex justify-end' : '')}>
          {/* Content */}
          <div
            className={cn(
              'min-w-0',
              isUser
                ? 'max-w-[82%] rounded-[14px] bg-[var(--hover-bg)]/80 px-4 py-2.5 ring-1 ring-[var(--stroke-divider)]/60'
                : 'flex-1'
            )}
          >
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
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
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
                      className="w-full p-2 rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent-commit)]"
                      rows={3}
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="px-2 py-1 text-xs rounded text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEdit?.(editContent);
                          setIsEditing(false);
                        }}
                        className="rounded bg-[var(--accent-commit)] px-2 py-1 text-xs text-[var(--on-accent)] hover:opacity-90"
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
                    {useCoverageHighlights ? (
                      <CoverageText text={content} uncoveredRanges={uncoveredRanges} />
                    ) : useYamlHighlights ? (
                      <HighlightedText text={content} ranges={highlightRanges} />
                    ) : useInlineEditHighlights ? (
                      <InlineEditedText text={content} spans={inlineEditSpans!} />
                    ) : useSourceMappedSpans ? (
                      <SourceMappedText
                        content={content}
                        mappings={sourceMap!}
                        hoveredNodeId={hoveredNodeId}
                        onClickSlot={handleClickSlot}
                        isReviewPhase={isReviewPhase}
                        onDeleteSlot={deleteSlot}
                      />
                    ) : useCommittedHighlightSpans ? (
                      <CommittedHighlightText content={content} highlights={committedHighlights!} />
                    ) : (
                      content
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                {showSourceEditHint && (
                  <button
                    type="button"
                    onClick={() =>
                      toast.message('Select source text to Insert after, Replace, or Delete.')
                    }
                    className="absolute right-0 top-0 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] opacity-0 transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-secondary)] hover:opacity-100 group-hover:opacity-55"
                    title="Select text to Insert after, Replace, or Delete"
                    aria-label="Source text edit hint"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {thinkingContent && (
                  <ThinkingSection content={thinkingContent} isStreaming={isThinking} />
                )}
                <div
                  ref={textRef}
                  className={cn(
                    'prose-chat text-[14px] leading-[1.7] text-[var(--text-primary)]',
                    showSourceEditHint && 'pr-9',
                    isStreaming && 'streaming-text'
                  )}
                >
                  {useCoverageHighlights ? (
                    <div className="whitespace-pre-wrap">
                      <CoverageText text={content} uncoveredRanges={uncoveredRanges} />
                    </div>
                  ) : useYamlHighlights ? (
                    // YAML→Chat highlights: render as plain text to preserve character offsets
                    <div className="whitespace-pre-wrap">
                      <HighlightedText text={content} ranges={highlightRanges} />
                    </div>
                  ) : useInlineEditHighlights ? (
                    <div className="whitespace-pre-wrap">
                      <InlineEditedText text={content} spans={inlineEditSpans!} />
                    </div>
                  ) : useSourceMappedSpans ? (
                    // Source-mapped spans: render as plain text with interactive purple highlights
                    <div className="whitespace-pre-wrap">
                      <SourceMappedText
                        content={content}
                        mappings={sourceMap!}
                        hoveredNodeId={hoveredNodeId}
                        onClickSlot={handleClickSlot}
                        isReviewPhase={isReviewPhase}
                        onDeleteSlot={deleteSlot}
                      />
                    </div>
                  ) : useCommittedHighlightSpans ? (
                    <div className="whitespace-pre-wrap">
                      <CommittedHighlightText content={content} highlights={committedHighlights!} />
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
                      className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] transition-colors"
                      title="Regenerate response"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
            background: 'var(--source)',
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}
    </div>
  );
}
