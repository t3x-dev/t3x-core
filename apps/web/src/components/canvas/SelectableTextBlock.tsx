import { ChevronDown, ChevronRight, GitCommit } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  AnchorCandidate,
  ConfirmedAnchor,
  KeywordMarker,
  SourceTextBlock,
  TextSelection,
} from '@/types/nodes';
import {
  addSelection,
  cleanupKeywords,
  isTokenInIncludeSelection,
  toggleKeyword,
} from '@/utils/tokenizer';
import { ConversationTurnRenderer } from './ConversationTurnRenderer';
import {
  getTokenClasses,
  getTokenState,
  isTokenInAnchorCandidate,
  isTokenInConfirmedAnchor,
  needsSpaceAfter,
} from './SelectableTextBlockUtils';

interface SelectableTextBlockProps {
  block: SourceTextBlock;
  onChange: (updatedBlock: SourceTextBlock) => void;
  readOnly?: boolean;
  /** Anchor candidates from Ring 1 (global character positions) */
  anchorCandidates?: AnchorCandidate[];
  /**
   * Confirmed anchors (user-confirmed)
   * Position handling:
   * - If anchor has globalStart/globalEnd, those are used directly (pre-computed)
   * - Otherwise, nodeStartChar + start/end is used (requires node context)
   * Note: API response anchors have globalStart/globalEnd pre-computed during parsing
   */
  confirmedAnchors?: ConfirmedAnchor[];
  /**
   * Callback when user confirms/changes an anchor
   * Click interaction:
   * - Click anchor candidate → confirm as 'preferred'
   * - Click confirmed anchor → cycle: preferred → mustHave → mustntHave → remove
   */
  onAnchorChange?: (anchor: ConfirmedAnchor, action: 'add' | 'remove' | 'update') => void;
  /** Confidence threshold for showing anchor candidates (0-1) */
  anchorThreshold?: number;
}

export function SelectableTextBlock({
  block,
  onChange,
  readOnly = false,
  anchorCandidates,
  confirmedAnchors,
  onAnchorChange,
  anchorThreshold = 0.5,
}: SelectableTextBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isRightDragging, setIsRightDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  // Handle mouse down on a token - start selection (left click for include)
  const handleTokenMouseDown = useCallback(
    (tokenIndex: number, e: React.MouseEvent) => {
      if (readOnly) return;
      // Only handle left click
      if (e.button !== 0) return;
      e.preventDefault();

      setIsSelecting(true);
      setIsRightDragging(false);
      setSelectionStart(tokenIndex);
      setSelectionEnd(tokenIndex);
    },
    [readOnly]
  );

  // Handle right mouse down - start exclude selection drag
  const handleTokenRightMouseDown = useCallback(
    (tokenIndex: number, e: React.MouseEvent) => {
      if (readOnly) return;
      e.preventDefault();

      // Start exclude selection drag
      setIsSelecting(true);
      setIsRightDragging(true);
      setSelectionStart(tokenIndex);
      setSelectionEnd(tokenIndex);
    },
    [readOnly]
  );

  // Handle mouse move - extend selection
  const handleTokenMouseEnter = useCallback(
    (tokenIndex: number) => {
      if (!isSelecting || readOnly) return;
      setSelectionEnd(tokenIndex);
    },
    [isSelecting, readOnly]
  );

  // Helper: Remove tokens from selections of opposite type in range
  const removeFromOppositeSelections = useCallback(
    (
      selections: TextSelection[],
      start: number,
      end: number,
      keepType: 'include' | 'exclude'
    ): TextSelection[] => {
      const oppositeType = keepType === 'include' ? 'exclude' : 'include';
      const result: TextSelection[] = [];

      for (const sel of selections) {
        if (sel.type !== oppositeType) {
          // Keep selections of the same type
          result.push(sel);
          continue;
        }

        // Check if this opposite-type selection overlaps with our range
        if (sel.endIndex < start || sel.startIndex > end) {
          // No overlap, keep it
          result.push(sel);
        } else if (sel.startIndex >= start && sel.endIndex <= end) {
          // Fully contained, remove entirely
          // Don't add to result
        } else if (sel.startIndex < start && sel.endIndex > end) {
          // Our range is in the middle, split into two
          result.push({
            ...sel,
            id: `${sel.id}-left`,
            endIndex: start - 1,
          });
          result.push({
            ...sel,
            id: `${sel.id}-right`,
            startIndex: end + 1,
          });
        } else if (sel.startIndex < start) {
          // Overlap on right side, trim
          result.push({
            ...sel,
            endIndex: start - 1,
          });
        } else {
          // Overlap on left side, trim
          result.push({
            ...sel,
            startIndex: end + 1,
          });
        }
      }

      return result;
    },
    []
  );

  // Handle mouse up - finalize selection or toggle keyword/anchor
  const handleMouseUp = useCallback(() => {
    if (readOnly) return;

    if (isSelecting && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);
      const isSingleClick = start === end;

      if (isRightDragging) {
        // Right-drag: create exclude selection
        // First remove any include selections in this range
        let newSelections = removeFromOppositeSelections(block.selections, start, end, 'exclude');
        newSelections = addSelection(newSelections, start, end, block.id, 'exclude');
        const newKeywords = cleanupKeywords(block.keywords, newSelections);
        onChange({
          ...block,
          selections: newSelections,
          keywords: newKeywords,
        });
      } else {
        // Left-drag or click
        if (isSingleClick) {
          // Single click on a token
          const token = block.tokens[start];

          // Check if clicking on an anchor (confirmed or candidate)
          if (token && onAnchorChange) {
            // Check confirmed anchors first
            const existingAnchor = confirmedAnchors
              ? isTokenInConfirmedAnchor(token, confirmedAnchors, 0)
              : null;

            if (existingAnchor) {
              // Click on confirmed anchor -> cycle: preferred -> mustHave -> mustntHave -> remove
              const constraint = existingAnchor.constraint;
              if (constraint === 'preferred') {
                // preferred -> mustHave
                onAnchorChange({ ...existingAnchor, constraint: 'mustHave' }, 'update');
              } else if (constraint === 'mustHave' || constraint === 'must_have') {
                // mustHave -> mustntHave
                onAnchorChange({ ...existingAnchor, constraint: 'mustntHave' }, 'update');
              } else {
                // mustntHave -> remove
                onAnchorChange(existingAnchor, 'remove');
              }
              // Anchor interaction handled, skip other logic
              setIsSelecting(false);
              setIsRightDragging(false);
              setSelectionStart(null);
              setSelectionEnd(null);
              return;
            }

            // Check anchor candidates
            const candidate = anchorCandidates
              ? isTokenInAnchorCandidate(token, anchorCandidates, anchorThreshold)
              : null;

            if (candidate) {
              // Click on anchor candidate -> confirm as 'preferred'
              // Note: start/end use global positions (same as globalStart/globalEnd) because
              // we don't have node boundary info here. When submitting to API,
              // these should be converted to node-relative positions if needed.
              const newAnchor: ConfirmedAnchor = {
                id: `anchor-${candidate.startChar}-${candidate.endChar}`,
                text: candidate.text,
                start: candidate.startChar, // Global position (for now)
                end: candidate.endChar, // Global position (for now)
                type: candidate.type,
                constraint: 'preferred',
                globalStart: candidate.startChar,
                globalEnd: candidate.endChar,
              };
              onAnchorChange(newAnchor, 'add');
              // Anchor interaction handled, skip other logic
              setIsSelecting(false);
              setIsRightDragging(false);
              setSelectionStart(null);
              setSelectionEnd(null);
              return;
            }
          }

          // Not an anchor click, continue with keyword/selection logic
          const isInInclude = isTokenInIncludeSelection(start, block.selections);

          if (isInInclude) {
            // Click on include -> cycle keyword states
            // Cycle: normal -> must_have -> mustnt_have -> normal
            const existingKeyword = block.keywords.find((kw) => kw.tokenIndex === start);
            let newKeywords: KeywordMarker[];

            if (!existingKeyword) {
              // No keyword -> add must_have
              newKeywords = toggleKeyword(block.keywords, start, 'must_have', block.id);
            } else if (existingKeyword.constraint === 'must_have') {
              // must_have -> mustnt_have
              newKeywords = block.keywords.map((kw) =>
                kw.tokenIndex === start ? { ...kw, constraint: 'mustnt_have' as const } : kw
              );
            } else {
              // mustnt_have -> remove (back to normal selected)
              newKeywords = block.keywords.filter((kw) => kw.tokenIndex !== start);
            }

            onChange({
              ...block,
              keywords: newKeywords,
            });
          } else {
            // Click on normal or exclude token -> create include selection
            // Remove any exclude selections in this range first
            let newSelections = removeFromOppositeSelections(
              block.selections,
              start,
              end,
              'include'
            );
            newSelections = addSelection(newSelections, start, end, block.id, 'include');
            onChange({
              ...block,
              selections: newSelections,
            });
          }
        } else {
          // Drag: Add new include selection
          // First remove any exclude selections in this range
          let newSelections = removeFromOppositeSelections(block.selections, start, end, 'include');
          newSelections = addSelection(newSelections, start, end, block.id, 'include');
          const newKeywords = cleanupKeywords(block.keywords, newSelections);
          onChange({
            ...block,
            selections: newSelections,
            keywords: newKeywords,
          });
        }
      }
    }

    setIsSelecting(false);
    setIsRightDragging(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [
    isSelecting,
    isRightDragging,
    selectionStart,
    selectionEnd,
    block,
    onChange,
    readOnly,
    removeFromOppositeSelections,
    onAnchorChange,
    confirmedAnchors,
    anchorCandidates,
    anchorThreshold,
  ]);

  // Prevent context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Determine if token is in current drag selection
  const isInDragSelection = (tokenIndex: number): boolean => {
    if (!isSelecting || selectionStart === null || selectionEnd === null) return false;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    return tokenIndex >= start && tokenIndex <= end;
  };

  return (
    <div
      ref={containerRef}
      className="p-[var(--space-group)] bg-[var(--color-bg-subtle)] rounded-lg border border-[var(--color-border)]"
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      onMouseLeave={() => {
        if (isSelecting) {
          setIsSelecting(false);
          setIsRightDragging(false);
          setSelectionStart(null);
          setSelectionEnd(null);
        }
      }}
    >
      <div className="text-[0.95rem] leading-8 select-none">
        {block.tokens.map((token, idx) => {
          const state = getTokenState(
            token,
            block.selections,
            block.keywords,
            anchorCandidates,
            confirmedAnchors,
            anchorThreshold,
            0 // nodeStartChar - assuming block starts at 0 for now
          );
          const isDragging = isInDragSelection(token.index);
          const nextToken = block.tokens[idx + 1];
          const addSpace = needsSpaceAfter(token, nextToken);

          // Skip interaction for pure punctuation (including | and separators)
          const isPunctuation =
            /^[,.\u3002\uff01\uff1f\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\u300a\u300b\u3010\u3011!?;:'"()[\]{}<>|\u2502\s]+$/.test(
              token.text
            );

          // Render newline as <br /> element
          if (token.text === '\n') {
            return <br key={token.id} />;
          }

          // Render separator with special styling
          if (token.text === '\u2502') {
            return (
              <span key={token.id} className={getTokenClasses(state, isDragging, true)}>
                {token.text}
              </span>
            );
          }

          return (
            <span
              key={token.id}
              className={getTokenClasses(state, isDragging)}
              onMouseDown={(e) => !isPunctuation && handleTokenMouseDown(token.index, e)}
              onMouseEnter={() => handleTokenMouseEnter(token.index)}
              onContextMenu={(e) => {
                if (!isPunctuation && !readOnly) {
                  handleTokenRightMouseDown(token.index, e);
                }
              }}
              data-index={token.index}
            >
              {token.text}
              {addSpace ? ' ' : ''}
            </span>
          );
        })}
      </div>

      {!readOnly && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] text-center">
          <span>左键拖拽选择(浅绿) · 右键拖拽排除(浅红) · 点击循环切换: 选中 → must → mustn't</span>
        </div>
      )}
    </div>
  );
}

// Collapsible Source Box component
interface SourceBoxProps {
  block: SourceTextBlock;
  onChange: (block: SourceTextBlock) => void;
  readOnly?: boolean;
  defaultExpanded?: boolean;
  /** Anchor candidates from Ring 1 (global positions) */
  anchorCandidates?: AnchorCandidate[];
  /** Confirmed anchors (user-confirmed) */
  confirmedAnchors?: ConfirmedAnchor[];
  /** Callback when user confirms/changes an anchor */
  onAnchorChange?: (anchor: ConfirmedAnchor, action: 'add' | 'remove' | 'update') => void;
  /** Confidence threshold for showing anchor candidates (0-1) */
  anchorThreshold?: number;
}

export function SourceBox({
  block,
  onChange,
  readOnly = false,
  defaultExpanded = false,
  anchorCandidates,
  confirmedAnchors,
  onAnchorChange,
  anchorThreshold,
}: SourceBoxProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Determine display info based on source type
  const _isUnit = block.sourceNodeType === 'unit';
  const icon = <GitCommit size={14} />;
  const typeLabel = 'Unit';
  const title = block.sourceNodeTitle || 'Unit';

  return (
    <div
      className={cn(
        'border border-[var(--color-border)] rounded-lg overflow-hidden',
        isExpanded && 'elevation-1'
      )}
    >
      {/* Box Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-[var(--color-bg-subtle)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-[var(--color-text-muted)]">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="w-6 h-6 rounded flex items-center justify-center bg-[var(--status-info-muted)] text-[var(--status-info)]">
          {icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {typeLabel}:
        </span>
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {title}
        </span>
      </div>

      {/* Box Content */}
      {isExpanded && (
        <div className="p-[var(--space-group)] bg-[var(--color-bg-white)]">
          {block.turnBoundaries && block.turnBoundaries.length > 0 ? (
            // Unit with turns: Render with turn groups
            <ConversationTurnRenderer
              block={block}
              onChange={onChange}
              readOnly={readOnly}
              anchorCandidates={anchorCandidates}
              confirmedAnchors={confirmedAnchors}
              onAnchorChange={onAnchorChange}
              anchorThreshold={anchorThreshold}
            />
          ) : (
            // Unit without turns: Render as simple block
            <SelectableTextBlock
              block={block}
              onChange={onChange}
              readOnly={readOnly}
              anchorCandidates={anchorCandidates}
              confirmedAnchors={confirmedAnchors}
              onAnchorChange={onAnchorChange}
              anchorThreshold={anchorThreshold}
            />
          )}
        </div>
      )}
    </div>
  );
}

