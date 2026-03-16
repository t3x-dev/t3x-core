import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  AnchorCandidate,
  ConfirmedAnchor,
  KeywordMarker,
  SourceTextBlock,
  TextSelection,
  TextToken,
} from '@/types/nodes';
import {
  addSelection,
  cleanupKeywords,
  isTokenInIncludeSelection,
  toggleKeyword,
} from '@/utils/tokenizer';
import {
  type TokenState,
  getTokenClasses,
  getTokenState,
  isTokenInAnchorCandidate,
  isTokenInConfirmedAnchor,
  needsSpaceAfter,
} from './SelectableTextBlockUtils';

// Render conversation content with turn groups
interface ConversationTurnRendererProps {
  block: SourceTextBlock;
  onChange: (block: SourceTextBlock) => void;
  readOnly?: boolean;
  /** Anchor candidates from Ring 1 (global positions) */
  anchorCandidates?: AnchorCandidate[];
  /** Confirmed anchors (user-confirmed) */
  confirmedAnchors?: ConfirmedAnchor[];
  /** Callback when user confirms/changes an anchor */
  onAnchorChange?: (anchor: ConfirmedAnchor, action: 'add' | 'remove' | 'update') => void;
  /** Confidence threshold for showing anchor candidates (0-1) */
  anchorThreshold?: number;
}

export function ConversationTurnRenderer({
  block,
  onChange,
  readOnly = false,
  anchorCandidates,
  confirmedAnchors,
  onAnchorChange,
  anchorThreshold = 0.5,
}: ConversationTurnRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isRightDragging, setIsRightDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  // Group tokens by turn
  const turnGroups = useMemo(() => {
    if (!block.turnBoundaries || block.turnBoundaries.length === 0) {
      return [{ turn: null, tokens: block.tokens }];
    }

    return block.turnBoundaries.map((turn) => ({
      turn,
      tokens: block.tokens.filter(
        (token) => token.index >= turn.startTokenIndex && token.index <= turn.endTokenIndex
      ),
    }));
  }, [block.tokens, block.turnBoundaries]);

  // Handle mouse down on a token
  const handleTokenMouseDown = useCallback(
    (tokenIndex: number, e: React.MouseEvent) => {
      if (readOnly) return;
      if (e.button !== 0) return;
      e.preventDefault();

      setIsSelecting(true);
      setIsRightDragging(false);
      setSelectionStart(tokenIndex);
      setSelectionEnd(tokenIndex);
    },
    [readOnly]
  );

  // Handle right mouse down
  const handleTokenRightMouseDown = useCallback(
    (tokenIndex: number, e: React.MouseEvent) => {
      if (readOnly) return;
      e.preventDefault();

      setIsSelecting(true);
      setIsRightDragging(true);
      setSelectionStart(tokenIndex);
      setSelectionEnd(tokenIndex);
    },
    [readOnly]
  );

  // Handle mouse move
  const handleTokenMouseEnter = useCallback(
    (tokenIndex: number) => {
      if (!isSelecting || readOnly) return;
      setSelectionEnd(tokenIndex);
    },
    [isSelecting, readOnly]
  );

  // Helper: Remove tokens from selections of opposite type
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
          result.push(sel);
          continue;
        }

        if (sel.endIndex < start || sel.startIndex > end) {
          result.push(sel);
        } else if (sel.startIndex >= start && sel.endIndex <= end) {
          // Fully contained, remove
        } else if (sel.startIndex < start && sel.endIndex > end) {
          result.push({ ...sel, id: `${sel.id}-left`, endIndex: start - 1 });
          result.push({ ...sel, id: `${sel.id}-right`, startIndex: end + 1 });
        } else if (sel.startIndex < start) {
          result.push({ ...sel, endIndex: start - 1 });
        } else {
          result.push({ ...sel, startIndex: end + 1 });
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
        let newSelections = removeFromOppositeSelections(block.selections, start, end, 'exclude');
        newSelections = addSelection(newSelections, start, end, block.id, 'exclude');
        const newKeywords = cleanupKeywords(block.keywords, newSelections);
        onChange({ ...block, selections: newSelections, keywords: newKeywords });
      } else {
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
                onAnchorChange({ ...existingAnchor, constraint: 'mustHave' }, 'update');
              } else if (constraint === 'mustHave' || constraint === 'must_have') {
                onAnchorChange({ ...existingAnchor, constraint: 'mustntHave' }, 'update');
              } else {
                onAnchorChange(existingAnchor, 'remove');
              }
              setIsSelecting(false);
              setIsRightDragging(false);
              setSelectionStart(null);
              setSelectionEnd(null);
              return;
            }

            // Check anchor candidates
            const candidate = anchorCandidates
              ? isTokenInAnchorCandidate(token, anchorCandidates, anchorThreshold ?? 0.5)
              : null;

            if (candidate) {
              // Click on anchor candidate -> confirm as 'preferred'
              // Note: start/end use global positions (same as globalStart/globalEnd) because
              // we don't have sentence boundary info here. When submitting to API,
              // these should be converted to sentence-relative positions if needed.
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
            const existingKeyword = block.keywords.find((kw) => kw.tokenIndex === start);
            let newKeywords: KeywordMarker[];

            if (!existingKeyword) {
              newKeywords = toggleKeyword(block.keywords, start, 'must_have', block.id);
            } else if (existingKeyword.constraint === 'must_have') {
              newKeywords = block.keywords.map((kw) =>
                kw.tokenIndex === start ? { ...kw, constraint: 'mustnt_have' as const } : kw
              );
            } else {
              newKeywords = block.keywords.filter((kw) => kw.tokenIndex !== start);
            }

            onChange({ ...block, keywords: newKeywords });
          } else {
            let newSelections = removeFromOppositeSelections(
              block.selections,
              start,
              end,
              'include'
            );
            newSelections = addSelection(newSelections, start, end, block.id, 'include');
            onChange({ ...block, selections: newSelections });
          }
        } else {
          let newSelections = removeFromOppositeSelections(block.selections, start, end, 'include');
          newSelections = addSelection(newSelections, start, end, block.id, 'include');
          const newKeywords = cleanupKeywords(block.keywords, newSelections);
          onChange({ ...block, selections: newSelections, keywords: newKeywords });
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

  // Check if token is in drag selection
  const isInDragSelection = (tokenIndex: number): boolean => {
    if (!isSelecting || selectionStart === null || selectionEnd === null) return false;
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);
    return tokenIndex >= start && tokenIndex <= end;
  };

  // Render a single token
  const renderToken = (token: TextToken, nextToken: TextToken | undefined) => {
    const state = getTokenState(
      token,
      block.selections,
      block.keywords,
      anchorCandidates,
      confirmedAnchors,
      anchorThreshold,
      0 // sentenceStartChar
    );
    const isDragging = isInDragSelection(token.index);
    const addSpace = needsSpaceAfter(token, nextToken);

    const isPunctuation = /^[,.\u3002\uff01\uff1f\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\u300a\u300b\u3010\u3011!?;:'"()[\]{}<>|\u2502\s]+$/.test(
      token.text
    );

    if (token.text === '\n') {
      return <br key={token.id} />;
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
  };

  return (
    <div
      ref={containerRef}
      className="space-y-3"
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={() => {
        if (isSelecting) {
          setIsSelecting(false);
          setIsRightDragging(false);
          setSelectionStart(null);
          setSelectionEnd(null);
        }
      }}
    >
      {turnGroups.map((group, groupIdx) => (
        <div
          key={group.turn ? `turn-${group.turn.startTokenIndex}` : `ungrouped-${groupIdx}`}
          className={cn(
            'rounded-lg border p-3',
            group.turn?.role === 'user' &&
              'border-[var(--status-info)]/20 bg-[var(--status-info-muted)]',
            group.turn?.role === 'assistant' &&
              'border-[var(--status-success)]/20 bg-[var(--status-success-muted)]',
            !group.turn && 'border-[var(--color-border)] bg-[var(--color-bg-subtle)]'
          )}
        >
          {/* Turn header removed - [role]: prefix in content provides role info */}
          <div className="text-[0.95rem] leading-7 select-none">
            {group.tokens.map((token, idx) => renderToken(token, group.tokens[idx + 1]))}
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] text-center">
          <span>左键拖拽选择(浅绿) · 右键拖拽排除(浅红) · 点击切换: 选中 → must → mustn't</span>
        </div>
      )}
    </div>
  );
}
