/**
 * Canvas Node Types
 *
 * @see display-spec.ts for visual display rules
 */

/**
 * Node kind determines the visual treatment and available fields
 * - unit: Conversation + Commit combined card (288px wide)
 * - leaf: Output destination card (160px wide)
 */
export type NodeKind = 'unit' | 'leaf';

// Unit commit status: staging (editable), committed (read-only), or draft (workbench)
export type CommitStatus = 'staging' | 'committed' | 'draft';

// Leaf node types for output destinations
// Must match @t3x-dev/core AnyLeafType from V4 schema
export type LeafType =
  | 'tweet'
  | 'weibo'
  | 'wechat'
  | 'email'
  | 'article'
  | 'slack'
  | 'deploy_agent';

export interface LeafNodeConfig {
  leafType: LeafType;
  // Additional config can be added per leaf type
}

// ============================================
// Commit Display Types
// Re-export from @t3x-dev/core contract types
// ============================================

// Import contract types from @t3x-dev/core (single source of truth)
import type { CommitAuthor, CommitSourceRef } from '@t3x-dev/core';
import type { ApiCommit } from '@/lib/api/commits';

// Legacy node types — kept locally for web components still using node-based display.
// Core has moved to tree-native SemanticContent; web migration is a separate effort.
export interface NodeSourceRef {
  conversation_id: string;
  turn_hash: string;
  start_char: number;
  end_char: number;
}

export interface ContentNode {
  id: string;
  text: string;
  source_ref?: NodeSourceRef;
}

// Re-export contract types for convenience
export type { CommitAuthor, CommitSourceRef };

/**
 * Commit display data for canvas nodes.
 * Based on ApiCommit (tree-based), with backward-compat fields for components
 * that still read node-derived data.
 *
 * Note: parents field is intentionally omitted as it's not needed for display.
 */
export type CommitDisplay = Pick<
  ApiCommit,
  'hash' | 'schema' | 'author' | 'committed_at' | 'content' | 'message' | 'branch' | 'sources'
> & {
  position_x?: number;
  position_y?: number;
  /** Backward-compat: node-based view derived from trees (used by older canvas components) */
  source_refs?: Array<{ type: string; id: string; title?: string }> | null;
  merge_summary?: {
    kept_identical: number;
    resolved_conflicts: number;
    kept_from_source: number;
    kept_from_target: number;
    discarded: number;
    total_nodes: number;
    release_note?: {
      title: string;
      summary: string;
      sections: Array<{ heading: string; items: string[] }>;
      timestamp?: string;
      source_branch?: string;
      target_branch?: string;
    };
  } | null;
  semantic?: import('@t3x-dev/core').SemanticContent;
};

// ============================================
// Embedded Leaf (inside UnitNode)
// ============================================

/**
 * Embedded leaf output within a UnitNode
 * These are displayed as a collapsible list in the Leaves section
 */
export interface EmbeddedLeaf {
  id: string;
  type: LeafType;
  title: string;
  status?:
    | 'idle'
    | 'pending'
    | 'running'
    | 'passed'
    | 'failed'
    | 'deploying'
    | 'stopped'
    | 'error'
    | 'skipped';
  /** For eval leaves: pass/fail counts */
  passedCount?: number;
  failedCount?: number;
  /** When this leaf was created */
  createdAt?: string;
}

// ============================================
// Source Reference (for Sources section)
// ============================================

/**
 * Reference to a source that contributed to this commit
 */
export type SourceType = 'conversation' | 'meeting' | 'file' | 'evidence';

export interface SourceReference {
  id: string;
  type: SourceType;
  /** Short display label (e.g., "conv#34", "meeting#7") */
  label: string;
  /** Full title for tooltip */
  title?: string;
}
export type BranchType = 'main' | 'branch';

export type ValidationCheckStatus = 'pass' | 'fail' | 'warn';

export interface DraftValidationCheck {
  id: string;
  label: string;
  status: ValidationCheckStatus;
}

export interface MergeConfig {
  targetCommitId: string;
  targetCommitTitle: string;
  targetContent: string;
  targetCommitHash: string; // Full commit hash for API calls
  sourceCommitId: string;
  sourceCommitTitle: string;
  sourceContent: string;
  sourceCommitHash: string; // Full commit hash for API calls
  baseCommitId?: string;
  baseCommitTitle?: string;
  baseContent?: string;
  baseCommitHash?: string; // Full commit hash for API calls
}

// Clause (node) status in Manage mode
export type ClauseStatus = 'neutral' | 'keep' | 'discard';

// Keyword constraint type
export type KeywordConstraintType = 'must_have' | 'mustnt_have' | 'neutral';

// ============================================
// Anchor Types (P2 Implementation)
// ============================================

/**
 * Anchor type - categorizes the semantic meaning of an anchor candidate
 * Matches API's anchor candidate types from Ring 1 extraction
 */
export type AnchorType =
  | 'number' // Pure numbers: "100", "2025"
  | 'money' // Currency: "$5000", "100 USD"
  | 'duration' // Time periods: "30 days", "2 weeks"
  | 'percent' // Percentages: "15%", "3.5%"
  | 'date' // Dates: "November", "2025-01-08"
  | 'entity' // Named entities: "Bangkok", "Google"
  | 'term' // Important terms/keywords
  | 'phrase'; // Multi-token phrases

/**
 * Anchor constraint - user's choice for how this anchor should be treated
 * in downstream processing (generation, validation, etc.)
 * Accepts both camelCase (UI) and snake_case (API v1.1) formats.
 */
export type AnchorConstraint =
  | 'mustHave'
  | 'must_have' // Must include this anchor
  | 'mustntHave'
  | 'mustnt_have' // Must exclude this anchor
  | 'preferred'; // Prefer to include (soft constraint)

/**
 * Anchor candidate for UI display (camelCase version of ApiAnchorCandidate)
 * These are the candidates extracted from Ring 1 that can be confirmed by users
 */
export interface AnchorCandidate {
  text: string;
  type: AnchorType;
  startChar: number; // Global position in source text
  endChar: number;
  source: 'token' | 'entity' | 'phrase';
}

/**
 * Confirmed anchor - user has clicked and confirmed this anchor
 * Stored within a node context for precise auditing
 *
 * Position fields have different semantics depending on context:
 *
 * **API storage (after commit):**
 * - start/end: Relative position within node
 * - globalStart/globalEnd: Computed from node.startChar + start/end
 *
 * **UI layer (during staging, before commit):**
 * - start/end: May temporarily hold GLOBAL positions (same as globalStart/globalEnd)
 * - globalStart/globalEnd: Global positions for UI rendering
 * - When committing, handleCommit converts to node-relative positions
 *
 * When rendering, always use globalStart/globalEnd if present.
 * The start/end fields are authoritative only after API round-trip.
 */
export interface ConfirmedAnchor {
  id: string;
  text: string;
  /** Position within node (relative after API storage, may be global during staging) */
  start: number;
  /** Position within node (relative after API storage, may be global during staging) */
  end: number;
  type: AnchorType;
  constraint: AnchorConstraint;
  /** Global start position (for UI rendering) - authoritative for positioning */
  globalStart?: number;
  /** Global end position (for UI rendering) - authoritative for positioning */
  globalEnd?: number;
}

/**
 * ContentNode with its confirmed anchors
 * Provides the node context for anchor display and auditing
 */
export interface NodeWithAnchors {
  nodeId: string; // Ring 3 segment ID
  text: string; // ContentNode original text
  startChar: number; // Position in source text (global)
  endChar: number;
  anchors: ConfirmedAnchor[];
}

/**
 * Commit-level anchor storage
 * Persisted in commit for auditing and playback
 */
export interface CommitAnchors {
  inputTextHash: string; // SHA-256 of source text for validation
  nodes: NodeWithAnchors[];
}

// Individual clause/node with its status
export interface Clause {
  id: string;
  text: string;
  status: ClauseStatus;
  keywords: Keyword[];
}

// Individual keyword with constraint info
export interface Keyword {
  id: string;
  text: string;
  constraint: KeywordConstraintType;
}

// Conversation constraints (output of Manage mode)
export interface ConversationConstraints {
  clauses: Clause[];
  must_have: string[];
  mustnt_have: string[];
}

// ============================================
// New: Free-form text selection types
// ============================================

// A single token (word/punctuation) in the source text
export interface TextToken {
  id: string;
  text: string;
  index: number; // Position in the token array
  charStart: number; // Character offset in original text (inclusive)
  charEnd: number; // Character offset in original text (exclusive)
}

// A selected range - defined by start and end token indices
export interface TextSelection {
  id: string;
  startIndex: number; // Inclusive
  endIndex: number; // Inclusive
  type: 'include' | 'exclude'; // include = light green, exclude = light red
}

// A keyword marker within a selection (dark green)
export interface KeywordMarker {
  id: string;
  tokenIndex: number; // Which token is marked as keyword
  constraint: 'must_have' | 'mustnt_have';
}

// Turn boundary for conversation source (UI display only)
export interface TurnBoundary {
  role: 'user' | 'assistant';
  startTokenIndex: number; // Start token index of this turn (inclusive)
  endTokenIndex: number; // End token index of this turn (inclusive)
}

// Source text block with all user selections
export interface SourceTextBlock {
  id: string;
  originalText: string; // The full original text
  tokens: TextToken[]; // Tokenized text
  selections: TextSelection[]; // User-selected ranges (light green)
  keywords: KeywordMarker[]; // Marked keywords within selections (dark green)

  // Source node information
  sourceNodeId?: string; // Source node ID (unit ID)
  sourceNodeType?: 'unit'; // Source node type (always unit now)
  sourceNodeTitle?: string; // Display title

  // Turn boundaries for conversation type (UI display only)
  // Defines which token ranges belong to which role
  turnBoundaries?: TurnBoundary[];
}

// ContentNode info for building CommitAnchors (from curate preview chunks)
export interface PendingCommitContentNode {
  id: string; // ContentNode/chunk ID
  text: string; // ContentNode text
  start: number; // Global start char position (in source_text)
  end: number; // Global end char position (in source_text)
  /** v1.3: Turn hash this node belongs to (for source context display) */
  turn_hash?: string;
  /** v1.3: Start position relative to turn.content (without [role]: prefix) */
  turn_start?: number;
  /** v1.3: End position relative to turn.content (without [role]: prefix) */
  turn_end?: number;
}

// Pending commit source data - replaces old clause-based system for pending commits
export interface PendingCommitSource {
  textBlocks: SourceTextBlock[]; // Multiple source text blocks
  confirmedAnchors?: ConfirmedAnchor[]; // User-confirmed anchors during staging
  // v1.1: Data for building CommitAnchors on commit
  inputTextHash?: string; // SHA-256 hash of source text
  nodes?: PendingCommitContentNode[]; // Ring3 nodes from curate preview
}

// Draft-level constraint overrides
export interface DraftConstraintOverrides {
  disabledClauseIds: string[];
  additionalMustHave: string[];
  additionalMustntHave: string[];
  removedMustHave: string[];
  removedMustntHave: string[];
}

/**
 * Canvas Node Data
 *
 * This interface defines all data fields for canvas nodes.
 * Display rules are defined in display-spec.ts.
 *
 * @see UnitNodeDisplaySpec for unit node display rules
 * @see LeafNodeDisplaySpec for leaf node display rules
 */
export interface CanvasNodeData {
  // Index signature for React Flow v12 compatibility
  [key: string]: unknown;

  // ============================================
  // Common fields (always displayed)
  // ============================================

  /**
   * Display ID - shown in commit badge
   * @display UnitNode: Commit section badge
   * @format Truncated, uppercase, monospace-style
   */
  entryId: string;

  /**
   * Node title - primary display text
   * @display UnitNode: Conversation section, largest text
   * @display LeafNode: Below type label
   * @format Truncate at 50 chars
   */
  title: string;

  /**
   * Summary text - shown on expand or in secondary position
   * @display UnitNode: Expanded state, or secondary info (committed)
   * @format Max 3 lines before scroll
   */
  summary: string;

  /**
   * Status text - brief current state
   * @display UnitNode: Conversation section, next to timestamp
   * @example "Active", "3 turns"
   */
  status: string;

  /**
   * Timestamp - when created
   * @display UnitNode: Conversation section, pill badge
   * @format Relative time or date
   */
  timestamp: string;

  /**
   * Tags - not currently displayed on cards
   * @display Reserved for future use
   */
  tags: string[];

  /**
   * Node kind - determines card layout
   * @display Implicit (different component renders)
   */
  kind: NodeKind;

  /**
   * Highlight mode - visual emphasis during operations
   * @display Box shadow color (blue=main, amber=branch)
   */
  highlightMode?: 'main' | 'branch' | 'node';

  /**
   * Whether the node should appear faded (not part of current highlight)
   * @display Reduced opacity when true
   */
  dimmed?: boolean;

  // ============================================
  // Unit node: Sources section (top of card)
  // ============================================

  /**
   * Source references that contributed to this commit
   * @display Sources section at top of card
   * @format Inline badges: "conv#34 · meeting#7 · file#2"
   */
  sources?: SourceReference[];

  // ============================================
  // Unit node: Conversation part
  // ============================================
  conversationId?: string; // Full conversation_id

  /** Import source metadata (for imported conversations) */
  importSource?: {
    source_type: 'url' | 'document' | 'platform';
    platform?: string;
  };

  // ============================================
  // Unit node: Commit part
  // ============================================
  commitStatus?: CommitStatus; // 'staging' | 'committed'
  commitHash?: string; // Full commit_hash (only when committed)
  branchType?: BranchType; // 'main' | 'branch'
  branchName?: string; // Branch name for branch commits
  pendingBranch?: 'main' | 'branch'; // Branch selection for staging
  pendingBranchName?: string; // Branch name for staging

  // Staging commit: source data with free-form text selection
  pendingSource?: PendingCommitSource;
  // Source unit ID for staging commits created from another unit
  sourceUnitId?: string;
  // Source commit hash (parent commit for new commits)
  sourceCommitHash?: string;
  // Parent commit hash to inherit trees from (cleared after hydration)
  inheritFromCommitHash?: string;
  sourceTurnWindow?: {
    start_turn_hash: string;
    end_turn_hash: string;
  };

  // Staging commit: anchor candidates and confirmed anchors
  /** Anchor candidates from Ring 1 (for inline highlighting during curation) */
  anchorCandidates?: AnchorCandidate[];
  /** User-confirmed anchors during staging (will be persisted on commit) */
  pendingAnchors?: CommitAnchors;
  /** SHA-256 hash of source text for anchor validation */
  inputTextHash?: string;

  // Committed commit data (from database)
  sourceExcerpt?: string[]; // User-selected source excerpts
  mustHave?: string[]; // Must-have keywords
  mustntHave?: string[]; // Must-not-have keywords
  facetSnapshot?: Array<{
    facet: string;
    text?: string;
    key?: string;
    value?: unknown;
    entity_type?: string;
    polarity?: -1 | 0 | 1;
    polarity_label?: 'positive' | 'negative' | 'neutral';
    pos?: string;
    start_char?: number;
    end_char?: number;
    turn_hash?: string;
  }>;
  facets?: string[]; // Legacy facets field

  /**
   * Confirmed anchors for this commit
   * @display ContentNode-level inline highlights in commit detail view
   * @format NodeWithAnchors[] with confirmed anchor spans
   */
  anchors?: CommitAnchors;

  /**
   * Commit display data (nodes only, no constraints)
   * @display UnitNode: ContentNodes list with info about Leaf constraints
   */
  commit?: CommitDisplay;

  // Merge commit configuration
  mergeConfig?: MergeConfig;
  isMergeCommit?: boolean;

  // Validation and generation
  validationChecks?: DraftValidationCheck[];
  baselineSummary?: string;
  draftInstructions?: string;
  draftDiff?: string;
  bridgePrompt?: string;
  isGenerated?: boolean;

  // Conversation constraints
  constraints?: ConversationConstraints;
  constraintOverrides?: DraftConstraintOverrides;

  // ============================================
  // Unit node: Leaves section (bottom of card)
  // ============================================

  /**
   * Embedded leaf outputs from this commit
   * @display Leaves section at bottom of card
   * @format Expandable list with icons and status
   */
  leaves?: EmbeddedLeaf[];

  // ============================================
  // Leaf node specific (for standalone LeafNode)
  // ============================================
  leafType?: LeafType;
  leafConfig?: LeafNodeConfig;
  /** Backend leaf ID (from API) */
  leafId?: string;

  // ============================================
  // Draft workbench link
  // ============================================
  /** Link to drafts record (when commitStatus === 'draft') */
  draftId?: string;
  /** Auto-draft ID available for this conversation (status === 'auto') */
  autoDraftId?: string;

  // ============================================
  // Deprecated fields (keep for migration)
  // ============================================
  sourceConversationId?: string; // Replaced by sourceUnitId
}
