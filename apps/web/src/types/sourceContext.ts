/**
 * Source Context Types
 *
 * Unified type definitions for commit source context presentation.
 * Used across CommitSourceContext, TruncatedCommitView, TurnBubble,
 * DiffDisplayView, and merge components.
 *
 * @see docs/specification/commit-source-context-presentation.md
 */

// ═══════════════════════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Source reference pointing to a position within a conversation turn.
 * Uses character offsets relative to turn.content (not including role prefix).
 */
export interface SourceRef {
  /** Hash of the source turn */
  turn_hash: string;
  /** Start character position (0-indexed, inclusive) */
  start_char: number;
  /** End character position (0-indexed, exclusive) */
  end_char: number;
}

/**
 * Sentence with optional source reference.
 * Source may be absent for legacy data.
 */
export interface SentenceWithSource {
  /** Sentence ID (e.g., "s1", "s_abc123") */
  id: string;
  /** Sentence text content */
  text: string;
  /** Source reference (optional for legacy data) */
  source?: SourceRef;
}

/**
 * Highlight range within text content.
 * Uses character offsets.
 */
export interface HighlightRange {
  /** Start position (0-indexed, inclusive) */
  start: number;
  /** End position (0-indexed, exclusive) */
  end: number;
}

/**
 * Highlight range with per-range color.
 * Used when a single turn needs highlights in multiple colors
 * (e.g., green for sentences, deepGreen/deepRed for constraints).
 */
export interface ColoredHighlightRange {
  /** Start position (0-indexed, inclusive) */
  start: number;
  /** End position (0-indexed, exclusive) */
  end: number;
  /** Highlight color for this specific range */
  color: HighlightColor;
}

// ═══════════════════════════════════════════════════════════════════════════
// Truncation Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Segment type for truncated text rendering.
 */
export type TruncatedSegmentType = 'text' | 'highlight' | 'ellipsis';

/**
 * A segment of truncated text for rendering.
 */
export interface TruncatedSegment {
  /** Segment type */
  type: TruncatedSegmentType;
  /** Text content of the segment */
  content: string;
}

/**
 * Options for text truncation.
 */
export interface TruncationOptions {
  /** Maximum content length before truncation (default: 2000) */
  maxLength?: number;
  /** Context characters to show around highlights (default: 100) */
  contextChars?: number;
  /** Whether to preserve word boundaries when truncating (default: true) */
  preserveWordBoundary?: boolean;
  /** Maximum number of highlights to show (default: all) */
  maxHighlights?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Turn Display Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Role types for conversation turns.
 */
export type TurnRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Turn data for TurnBubble rendering.
 */
export interface TurnBubbleData {
  /** Turn hash identifier */
  turn_hash: string;
  /** Role of the turn */
  role: TurnRole;
  /** Turn content */
  content: string;
  /** Creation timestamp (ISO 8601) */
  created_at: string;
  /** Whether this is the target turn (for context display) */
  is_target?: boolean;
  /** Single highlight (legacy support) */
  highlight?: HighlightRange;
  /** Multiple highlights (for multiple sentences from same turn) */
  highlights?: HighlightRange[];
  /** Multi-color highlights (each range has its own color, overrides highlightColor) */
  coloredHighlights?: ColoredHighlightRange[];
}

/**
 * Highlight color options.
 */
export type HighlightColor = 'yellow' | 'green' | 'deepGreen' | 'deepRed';

// ═══════════════════════════════════════════════════════════════════════════
// Context Data Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Turn with context information (from API).
 */
export interface TurnWithContext {
  /** Turn hash */
  turn_hash: string;
  /** Role */
  role: TurnRole;
  /** Content */
  content: string;
  /** Creation timestamp */
  created_at: string;
  /** Whether this is the target turn */
  is_target?: boolean;
  /** Optional highlight range (set by API for target turn) */
  highlight?: HighlightRange;
}

/**
 * Content integrity status for source validation.
 */
export type ContentIntegrityStatus = 'valid' | 'mismatch' | 'unknown';

// ═══════════════════════════════════════════════════════════════════════════
// Component Props Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Props for CommitSourceContext component.
 */
export interface CommitSourceContextProps {
  /** Sentences from commit content */
  sentences: SentenceWithSource[];
  /** Compact mode for canvas preview (show first 2 turns only) */
  compact?: boolean;
  /** Default expanded state for turns (default: first turn expanded) */
  defaultExpanded?: boolean;
}

/**
 * Props for TruncatedCommitView component.
 */
export interface TruncatedCommitViewProps {
  /** Sentences from commit content */
  sentences: SentenceWithSource[];
  /** Maximum number of highlights to show fully (default: 2) */
  maxHighlights?: number;
  /** Context chars around each highlight (default: 50) */
  contextChars?: number;
  /** Callback when "View full" is clicked */
  onViewFull?: () => void;
  /** Show loading state */
  loading?: boolean;
}

/**
 * Props for TurnBubble component.
 */
export interface TurnBubbleProps {
  /** Turn data */
  turn: TurnBubbleData;
  /** Highlight color: 'yellow' for merge UI, 'green' for commit display */
  highlightColor?: HighlightColor;
  /** Whether to show ring around target turn */
  showTargetRing?: boolean;
}
