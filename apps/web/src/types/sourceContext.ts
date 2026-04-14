/**
 * Source Context Types
 *
 * Unified type definitions for commit source context presentation.
 * Used across CommitSourceContext, TruncatedCommitView, TurnBubble,
 * DiffDisplayView, and merge components.
 *
 * @see docs/specification/commit-source-context-presentation.md
 */

import type { ContentBlock } from '@/components/shared/ContentBlockRenderer';

// ═══════════════════════════════════════════════════════════════════════════
// Core Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Source reference pointing to a position within a conversation turn or leaf.
 * Uses character offsets relative to turn.content (not including role prefix).
 */
export interface SourceRef {
  /** Hash of the source turn (optional for leaf-originated nodes) */
  turn_hash?: string;
  /** Start character position (0-indexed, inclusive) */
  start_char: number;
  /** End character position (0-indexed, exclusive) */
  end_char: number;
  /** Leaf source identifier (for nodes originating from a leaf) */
  leaf_id?: string;
}

/**
 * ContentNode with optional source reference.
 * Source may be absent for legacy data.
 */
export interface NodeWithSource {
  /** ContentNode ID (e.g., "s1", "s_abc123") */
  id: string;
  /** ContentNode text content */
  text: string;
  /** Source reference (optional for legacy data) */
  source?: SourceRef;
  /**
   * The commit hash where this node was originally created.
   * Set when a node is inherited from a parent commit.
   * Undefined for nodes created directly in this commit.
   */
  inherited_from?: string;
  /** Anchor type for integrity checking threshold selection */
  anchor_type?: 'verbatim' | 'paraphrase' | 'inference';
}

/**
 * Highlight range within text content.
 * Uses character offsets.
 */
// Single source of truth is `@/domain/format/highlightUtils` so this
// type can be safely consumed from L2 (domain) utilities.
export type { HighlightRange } from '@/domain/format/highlightUtils';
import type { HighlightRange } from '@/domain/format/highlightUtils';

/**
 * Highlight range with per-range color.
 * Used when a single turn needs highlights in multiple colors
 * (e.g., green for nodes, deepGreen/deepRed for constraints).
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
  /** Multiple highlights (for multiple nodes from same turn) */
  highlights?: HighlightRange[];
  /** Multi-color highlights (each range has its own color, overrides highlightColor) */
  coloredHighlights?: ColoredHighlightRange[];
  /** Multimodal content blocks (images, audio, files) */
  content_blocks?: ContentBlock[];
}

/**
 * Highlight color options.
 */
export type HighlightColor = 'yellow' | 'green' | 'deepGreen' | 'deepRed' | 'amber' | 'blue';

// ═══════════════════════════════════════════════════════════════════════════
// Turn-with-highlights aggregates (moved from
// @/components/source-context/SourceConversationPanel so non-component
// consumers like useSourceContextData can import without breaching v2 §2.6)
// ═══════════════════════════════════════════════════════════════════════════

/** A node attached to a specific turn + character range. */
export interface NodeWithHighlight {
  node: NodeWithSource;
  turnHash: string;
  highlight: HighlightRange;
}

/** Turn-level aggregate with fetched context + per-turn highlights. */
export interface TurnWithHighlights {
  turnHash: string;
  context: import('@/types/api').TurnContextData | null;
  highlights: HighlightRange[];
  nodes: NodeWithHighlight[];
  loading: boolean;
  error: string | null;
  /** Content integrity check results per node */
  integrityStatus: Map<string, 'valid' | 'mismatch' | 'unknown'>;
}

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
  /** ContentNodes from commit content */
  nodes: NodeWithSource[];
  /** Compact mode for canvas preview (show first 2 turns only) */
  compact?: boolean;
  /** Default expanded state for turns (default: first turn expanded) */
  defaultExpanded?: boolean;
  /** Commit-level source refs (V4) for identifying leaf sources */
  sourceRefs?: Array<{ type: 'conversation' | 'leaf'; id: string; title?: string }>;
}

/**
 * Props for TruncatedCommitView component.
 */
export interface TruncatedCommitViewProps {
  /** ContentNodes from commit content */
  nodes: NodeWithSource[];
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
