import type {
  AnchorCandidate,
  ConfirmedAnchor,
  KeywordMarker,
  TextSelection,
  TextToken,
} from '@/types/nodes';
import { cn } from '@/utils/cn';
import { isTokenInExcludeSelection, isTokenInIncludeSelection } from '@/utils/tokenizer';

export type TokenState =
  | 'normal'
  | 'selected'
  | 'excluded'
  | 'keyword-must'
  | 'keyword-mustnt'
  | 'anchor-candidate' // Dotted underline for unconfirmed candidates
  | 'anchor-must' // Confirmed mustHave anchor
  | 'anchor-mustnt' // Confirmed mustntHave anchor
  | 'anchor-preferred'; // Confirmed preferred anchor

/**
 * Check if a token falls within an anchor candidate's character range
 */
export function isTokenInAnchorCandidate(
  token: TextToken,
  candidates: AnchorCandidate[],
  _threshold: number
): AnchorCandidate | null {
  for (const candidate of candidates) {
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
 * 2. Fall back to nodeStartChar + start/end (requires node context)
 */
export function isTokenInConfirmedAnchor(
  token: TextToken,
  anchors: ConfirmedAnchor[],
  nodeStartChar: number
): ConfirmedAnchor | null {
  for (const anchor of anchors) {
    // Use pre-computed global positions if available, otherwise convert from relative
    const anchorGlobalStart = anchor.globalStart ?? nodeStartChar + anchor.start;
    const anchorGlobalEnd = anchor.globalEnd ?? nodeStartChar + anchor.end;
    // Check if token overlaps with anchor's character range
    if (token.charStart < anchorGlobalEnd && token.charEnd > anchorGlobalStart) {
      return anchor;
    }
  }
  return null;
}

export function getTokenState(
  token: TextToken,
  selections: TextSelection[],
  keywords: KeywordMarker[],
  anchorCandidates?: AnchorCandidate[],
  confirmedAnchors?: ConfirmedAnchor[],
  anchorThreshold: number = 0.5,
  nodeStartChar: number = 0
): TokenState {
  // Check confirmed anchors first (highest priority)
  if (confirmedAnchors && confirmedAnchors.length > 0) {
    const anchor = isTokenInConfirmedAnchor(token, confirmedAnchors, nodeStartChar);
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

  // Check if in exclude selection
  if (isTokenInExcludeSelection(token.index, selections)) {
    return 'excluded';
  }

  // Check if in include selection
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
export function needsSpaceAfter(token: TextToken, nextToken: TextToken | undefined): boolean {
  if (!nextToken) return false;
  // If current token is English word and next token is also English word, add space
  const isEnglishWord = /^[a-zA-Z]+$/.test(token.text);
  const nextIsEnglishWord = /^[a-zA-Z]+$/.test(nextToken.text);
  // Also add space before punctuation that should have space before
  const nextNeedsSpace = nextIsEnglishWord || /^[a-zA-Z]/.test(nextToken.text);
  return isEnglishWord && nextNeedsSpace;
}

// Token style helper
export function getTokenClasses(state: TokenState, isDragging: boolean, isSeparator = false) {
  if (isSeparator) {
    return 'inline py-0.5 rounded transition-colors mx-0.5 text-[var(--color-text-muted)]';
  }
  return cn(
    'inline py-0.5 rounded transition-colors cursor-pointer',
    state === 'normal' && 'hover:bg-[var(--hover-bg)]',
    state === 'selected' && 'bg-[var(--status-success-muted)] hover:bg-[var(--status-success)]/20',
    state === 'excluded' && 'bg-[var(--status-error-muted)] hover:bg-[var(--status-error)]/15',
    state === 'keyword-must' &&
      'bg-[var(--status-success)] text-white font-medium hover:bg-[var(--status-success)]',
    state === 'keyword-mustnt' &&
      'bg-[var(--status-error)] text-white font-medium hover:bg-[var(--status-error)]',
    // Anchor candidate: dotted underline (unconfirmed)
    state === 'anchor-candidate' &&
      'underline decoration-dotted decoration-amber-500 underline-offset-2 hover:bg-amber-50 dark:hover:bg-amber-800',
    // Confirmed anchors: solid background with appropriate color
    state === 'anchor-must' &&
      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 font-medium underline decoration-emerald-500 underline-offset-2 hover:bg-emerald-200 dark:hover:bg-emerald-700',
    state === 'anchor-mustnt' &&
      'bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 font-medium underline decoration-rose-500 underline-offset-2 hover:bg-rose-200 dark:hover:bg-rose-700',
    state === 'anchor-preferred' &&
      'bg-[var(--status-info-muted)] text-[var(--status-info)] font-medium underline decoration-[var(--status-info)] underline-offset-2 hover:bg-[var(--status-info)]/20',
    isDragging && state === 'normal' && 'bg-[var(--status-info-muted)]'
  );
}
