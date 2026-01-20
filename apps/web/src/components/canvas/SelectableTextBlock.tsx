import { ChevronDown, ChevronRight, GitCommit } from 'lucide-react';
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
  isTokenInExcludeSelection,
  isTokenInIncludeSelection,
  toggleKeyword,
} from '@/utils/tokenizer';

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
   * - Otherwise, sentenceStartChar + start/end is used (requires sentence context)
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

type TokenState =
  | 'normal'
  | 'selected'
  | 'excluded'
  | 'keyword-must'
  | 'keyword-mustnt'
  | 'anchor-candidate'     // Dotted underline for unconfirmed candidates
  | 'anchor-must'          // Confirmed mustHave anchor
  | 'anchor-mustnt'        // Confirmed mustntHave anchor
  | 'anchor-preferred';    // Confirmed preferred anchor

/**
 * Check if a token falls within an anchor candidate's character range
 */
function isTokenInAnchorCandidate(
  token: TextToken,
  candidates: AnchorCandidate[],
  threshold: number
): AnchorCandidate | null {
  for (const candidate of candidates) {
    if (candidate.confidence < threshold) continue;
    // Check if token overlaps with candidate's character range
    if (token.charStart < candidate.endChar && token.charEnd > candidate.startChar) {
      return candidate;
    }
  }
  return null;
}

/**
 * Check if a token falls within a confirmed anchor's range
 *
 * Position resolution priority:
 * 1. Use globalStart/globalEnd if present (pre-computed for UI rendering)
 * 2. Fall back to sentenceStartChar + start/end (requires sentence context)
 */
function isTokenInConfirmedAnchor(
  token: TextToken,
  anchors: ConfirmedAnchor[],
  sentenceStartChar: number
): ConfirmedAnchor | null {
  for (const anchor of anchors) {
    // Use pre-computed global positions if available, otherwise convert from relative
    const anchorGlobalStart = anchor.globalStart ?? (sentenceStartChar + anchor.start);
    const anchorGlobalEnd = anchor.globalEnd ?? (sentenceStartChar + anchor.end);
    // Check if token overlaps with anchor's character range
    if (token.charStart < anchorGlobalEnd && token.charEnd > anchorGlobalStart) {
      return anchor;
    }
  }
  return null;
}

function getTokenState(
  token: TextToken,
  selections: TextSelection[],
  keywords: KeywordMarker[],
  anchorCandidates?: AnchorCandidate[],
  confirmedAnchors?: ConfirmedAnchor[],
  anchorThreshold: number = 0.5,
  sentenceStartChar: number = 0
): TokenState {
  // Check confirmed anchors first (highest priority)
  if (confirmedAnchors && confirmedAnchors.length > 0) {
    const anchor = isTokenInConfirmedAnchor(token, confirmedAnchors, sentenceStartChar);
    if (anchor) {
      // Handle both camelCase (UI) and snake_case (API v1.1) constraint values
      const constraint = anchor.constraint;
      if (constraint === 'mustHave' || constraint === 'must_have') {
        return 'anchor-must';
      }
      if (constraint === 'mustntHave' || constraint === 'mustnt_have') {
        return 'anchor-mustnt';
      }
      if (constraint === 'preferred') {
        return 'anchor-preferred';
      }
    }
  }

  // Check keywords (they override selection display)
  const keyword = keywords.find((kw) => kw.tokenIndex === token.index);
  if (keyword) {
    return keyword.constraint === 'must_have' ? 'keyword-must' : 'keyword-mustnt';
  }

  // Check if in exclude selection (浅红)
  if (isTokenInExcludeSelection(token.index, selections)) {
    return 'excluded';
  }

  // Check if in include selection (浅绿)
  if (isTokenInIncludeSelection(token.index, selections)) {
    return 'selected';
  }

  // Check anchor candidates (lowest priority, shown as dotted underline)
  if (anchorCandidates && anchorCandidates.length > 0) {
    const candidate = isTokenInAnchorCandidate(token, anchorCandidates, anchorThreshold);
    if (candidate) {
      return 'anchor-candidate';
    }
  }

  return 'normal';
}

// Check if a token is an English word (needs space after it)
function needsSpaceAfter(token: TextToken, nextToken: TextToken | undefined): boolean {
  if (!nextToken) return false;
  // If current token is English word and next token is also English word, add space
  const isEnglishWord = /^[a-zA-Z]+$/.test(token.text);
  const nextIsEnglishWord = /^[a-zA-Z]+$/.test(nextToken.text);
  // Also add space before punctuation that should have space before
  const nextNeedsSpace = nextIsEnglishWord || /^[a-zA-Z]/.test(nextToken.text);
  return isEnglishWord && nextNeedsSpace;
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
        // Right-drag: create exclude selection (浅红)
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
              // we don't have sentence boundary info here. When submitting to API,
              // these should be converted to sentence-relative positions if needed.
              const newAnchor: ConfirmedAnchor = {
                id: `anchor-${candidate.startChar}-${candidate.endChar}`,
                text: candidate.text,
                start: candidate.startChar,  // Global position (for now)
                end: candidate.endChar,      // Global position (for now)
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
            // Click on include (浅绿) -> cycle keyword states
            // Cycle: normal -> must_have (深绿) -> mustnt_have (深红) -> normal
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
          // Drag: Add new include selection (浅绿)
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

  // Token style helper
  const getTokenClasses = (state: TokenState, isDragging: boolean, isSeparator = false) => {
    if (isSeparator) {
      return 'inline py-0.5 rounded transition-colors mx-0.5 text-slate-400';
    }
    return cn(
      'inline py-0.5 rounded transition-colors cursor-pointer',
      state === 'normal' && 'hover:bg-slate-100',
      state === 'selected' && 'bg-green-100 hover:bg-green-200',
      state === 'excluded' && 'bg-red-100/60 hover:bg-red-200/60',
      state === 'keyword-must' && 'bg-green-500 text-white font-medium hover:bg-green-600',
      state === 'keyword-mustnt' && 'bg-red-500 text-white font-medium hover:bg-red-600',
      // Anchor candidate: dotted underline (unconfirmed)
      state === 'anchor-candidate' && 'underline decoration-dotted decoration-amber-500 underline-offset-2 hover:bg-amber-50',
      // Confirmed anchors: solid background with appropriate color
      state === 'anchor-must' && 'bg-emerald-100 text-emerald-800 font-medium underline decoration-emerald-500 underline-offset-2 hover:bg-emerald-200',
      state === 'anchor-mustnt' && 'bg-rose-100 text-rose-800 font-medium underline decoration-rose-500 underline-offset-2 hover:bg-rose-200',
      state === 'anchor-preferred' && 'bg-blue-100 text-blue-800 font-medium underline decoration-blue-500 underline-offset-2 hover:bg-blue-200',
      isDragging && state === 'normal' && 'bg-blue-100'
    );
  };

  return (
    <div
      ref={containerRef}
      className="p-4 bg-slate-50 rounded-lg border border-slate-200"
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
            0 // sentenceStartChar - assuming block starts at 0 for now
          );
          const isDragging = isInDragSelection(token.index);
          const nextToken = block.tokens[idx + 1];
          const addSpace = needsSpaceAfter(token, nextToken);

          // Skip interaction for pure punctuation (including | and │ separators)
          const isPunctuation = /^[，。！？、；：""''（）《》【】.,!?;:'"()[\]{}<>|│\s]+$/.test(
            token.text
          );

          // Render newline as <br /> element
          if (token.text === '\n') {
            return <br key={token.id} />;
          }

          // Render separator │ with special styling
          if (token.text === '│') {
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
        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 text-center">
          <span>左键拖拽选择(浅绿) · 右键拖拽排除(浅红) · 点击循环切换: 选中 → must → mustn't</span>
        </div>
      )}
    </div>
  );
}

// Container for multiple text blocks with Box UI
interface PendingSourceEditorProps {
  blocks: SourceTextBlock[];
  onChange: (blocks: SourceTextBlock[]) => void;
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

function SourceBox({
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
        'border border-slate-200 rounded-lg overflow-hidden',
        isExpanded && 'shadow-sm'
      )}
    >
      {/* Box Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-slate-400">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <span className="w-6 h-6 rounded flex items-center justify-center bg-blue-100 text-blue-600">
          {icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {typeLabel}:
        </span>
        <span className="text-sm font-medium text-slate-800 truncate">{title}</span>
      </div>

      {/* Box Content */}
      {isExpanded && (
        <div className="p-4 bg-white">
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

function ConversationTurnRenderer({
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
                start: candidate.startChar,  // Global position (for now)
                end: candidate.endChar,      // Global position (for now)
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

  // Token style helper
  const getTokenClasses = (state: TokenState, isDragging: boolean) => {
    return cn(
      'inline py-0.5 rounded transition-colors cursor-pointer',
      state === 'normal' && 'hover:bg-slate-100',
      state === 'selected' && 'bg-green-100 hover:bg-green-200',
      state === 'excluded' && 'bg-red-100/60 hover:bg-red-200/60',
      state === 'keyword-must' && 'bg-green-500 text-white font-medium hover:bg-green-600',
      state === 'keyword-mustnt' && 'bg-red-500 text-white font-medium hover:bg-red-600',
      // Anchor candidate: dotted underline (unconfirmed)
      state === 'anchor-candidate' && 'underline decoration-dotted decoration-amber-500 underline-offset-2 hover:bg-amber-50',
      // Confirmed anchors: solid background with appropriate color
      state === 'anchor-must' && 'bg-emerald-100 text-emerald-800 font-medium underline decoration-emerald-500 underline-offset-2 hover:bg-emerald-200',
      state === 'anchor-mustnt' && 'bg-rose-100 text-rose-800 font-medium underline decoration-rose-500 underline-offset-2 hover:bg-rose-200',
      state === 'anchor-preferred' && 'bg-blue-100 text-blue-800 font-medium underline decoration-blue-500 underline-offset-2 hover:bg-blue-200',
      isDragging && state === 'normal' && 'bg-blue-100'
    );
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

    const isPunctuation = /^[，。！？、；：""''（）《》【】.,!?;:'"()[\]{}<>|│\s]+$/.test(
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
            group.turn?.role === 'user' && 'border-blue-200 bg-blue-50/50',
            group.turn?.role === 'assistant' && 'border-emerald-200 bg-emerald-50/50',
            !group.turn && 'border-slate-200 bg-slate-50'
          )}
        >
{/* Turn header removed - [role]: prefix in content provides role info */}
          <div className="text-[0.95rem] leading-7 select-none">
            {group.tokens.map((token, idx) => renderToken(token, group.tokens[idx + 1]))}
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 text-center">
          <span>
            左键拖拽选择(浅绿) · 右键拖拽排除(浅红) · 点击切换: 选中 → must → mustn't
          </span>
        </div>
      )}
    </div>
  );
}

export function PendingSourceEditor({
  blocks,
  onChange,
  readOnly = false,
  anchorCandidates,
  confirmedAnchors,
  onAnchorChange,
  anchorThreshold,
}: PendingSourceEditorProps) {
  const handleBlockChange = useCallback(
    (updatedBlock: SourceTextBlock) => {
      const newBlocks = blocks.map((b) => (b.id === updatedBlock.id ? updatedBlock : b));
      onChange(newBlocks);
    },
    [blocks, onChange]
  );

  // Default to expanded if there's only one block
  const defaultExpanded = blocks.length === 1;

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <SourceBox
          key={block.id}
          block={block}
          onChange={handleBlockChange}
          readOnly={readOnly}
          defaultExpanded={defaultExpanded}
          anchorCandidates={anchorCandidates}
          confirmedAnchors={confirmedAnchors}
          onAnchorChange={onAnchorChange}
          anchorThreshold={anchorThreshold}
        />
      ))}
    </div>
  );
}

// Read-only viewer for committed commit's Source Excerpt
// Only shows included text (semantic selections), no keyword highlighting
interface SourceExcerptViewerProps {
  blocks: SourceTextBlock[];
}

export function SourceExcerptViewer({ blocks }: SourceExcerptViewerProps) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center text-sm text-slate-500 italic">
        <span>No source excerpt recorded</span>
      </div>
    );
  }

  // Extract only included text from all blocks
  const excerptText = blocks
    .map((block) => {
      // Get only include selections
      const includeSelections = block.selections.filter((sel) => sel.type === 'include');
      if (includeSelections.length === 0) return '';

      // Build text from included tokens with proper spacing
      let result = '';
      const includedTokens = block.tokens.filter((token) =>
        includeSelections.some(
          (sel) => token.index >= sel.startIndex && token.index <= sel.endIndex
        )
      );

      for (let i = 0; i < includedTokens.length; i++) {
        const token = includedTokens[i];
        const nextToken = includedTokens[i + 1];
        result += token.text;
        if (nextToken && needsSpaceAfter(token, nextToken)) {
          result += ' ';
        }
      }

      return result;
    })
    .filter(Boolean)
    .join('\n\n');

  if (!excerptText.trim()) {
    return (
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-center text-sm text-slate-500 italic">
        <span>No semantic content selected</span>
      </div>
    );
  }

  return (
    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {excerptText}
      </div>
    </div>
  );
}
