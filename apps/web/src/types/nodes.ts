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
// Must match @t3x/core AnyLeafType from V4 schema
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
// CommitV3 Display Types
// ============================================

/**
 * CommitV3 display data for canvas nodes
 * Sentence-based semantic commits with constraints
 */
export interface CommitV3Display {
  hash: string;
  schema: 'commit/v3';
  author: {
    name: string;
    verification?: 'none' | 'device' | 'verified';
  };
  committed_at: string;
  sentences: SentenceDisplay[];
  constraints: ConstraintDisplay[];
  message?: string;
  branch?: string;
}

export interface SentenceDisplay {
  id: string;
  text: string;
  /** Source reference for tracing back to original turn */
  source?: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

export interface ConstraintDisplay {
  type: 'require' | 'exclude';
  id: string;
  value: string;
  match: 'exact' | 'semantic';
  source_sentence_id?: string;
}

// ============================================
// CommitV4 Display Types
// Re-export from @t3x/core contract types
// ============================================

// Import contract types from @t3x/core (single source of truth)
import type {
  CommitAuthorV4,
  CommitSourceRef,
  CommitV4,
  CommitV4Content,
  SentenceSourceRef,
  SentenceV4,
} from '@t3x/core';

// Re-export contract types for convenience
export type {
  CommitAuthorV4,
  CommitSourceRef,
  CommitV4,
  CommitV4Content,
  SentenceSourceRef,
  SentenceV4,
};

/**
 * CommitV4 display data for canvas nodes
 * Uses Pick to select only the fields needed for display from the contract type.
 * Maintains contract compliance while allowing UI-specific field selection.
 *
 * Note: parents field is intentionally omitted as it's not needed for display.
 */
export type CommitV4Display = Pick<
  CommitV4,
  | 'hash'
  | 'schema'
  | 'author'
  | 'committed_at'
  | 'content'
  | 'message'
  | 'branch'
  | 'source_refs'
  | 'merge_summary'
>;

/**
 * Union type for commit display - supports both V3 and V4
 */
export type CommitDisplay = CommitV3Display | CommitV4Display;

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

// Clause (sentence) status in Manage mode
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
  confidence: number; // 0-1 confidence/salience score
  source: 'token' | 'entity' | 'phrase';
}

/**
 * Confirmed anchor - user has clicked and confirmed this anchor
 * Stored within a sentence context for precise auditing
 *
 * Position fields have different semantics depending on context:
 *
 * **API storage (after commit):**
 * - start/end: Relative position within sentence
 * - globalStart/globalEnd: Computed from sentence.startChar + start/end
 *
 * **UI layer (during staging, before commit):**
 * - start/end: May temporarily hold GLOBAL positions (same as globalStart/globalEnd)
 * - globalStart/globalEnd: Global positions for UI rendering
 * - When committing, handleCommit converts to sentence-relative positions
 *
 * When rendering, always use globalStart/globalEnd if present.
 * The start/end fields are authoritative only after API round-trip.
 */
export interface ConfirmedAnchor {
  id: string;
  text: string;
  /** Position within sentence (relative after API storage, may be global during staging) */
  start: number;
  /** Position within sentence (relative after API storage, may be global during staging) */
  end: number;
  type: AnchorType;
  constraint: AnchorConstraint;
  /** Global start position (for UI rendering) - authoritative for positioning */
  globalStart?: number;
  /** Global end position (for UI rendering) - authoritative for positioning */
  globalEnd?: number;
}

/**
 * Sentence with its confirmed anchors
 * Provides the sentence context for anchor display and auditing
 */
export interface SentenceWithAnchors {
  sentenceId: string; // Ring 3 segment ID
  text: string; // Sentence original text
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
  sentences: SentenceWithAnchors[];
}

// Individual clause/sentence with its status
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
  type: 'include' | 'exclude'; // include = 浅绿, exclude = 浅红
}

// A keyword marker within a selection (深绿)
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
  selections: TextSelection[]; // User-selected ranges (浅绿)
  keywords: KeywordMarker[]; // Marked keywords within selections (深绿)

  // Source node information
  sourceNodeId?: string; // Source node ID (unit ID)
  sourceNodeType?: 'unit'; // Source node type (always unit now)
  sourceNodeTitle?: string; // Display title

  // Turn boundaries for conversation type (UI display only)
  // Defines which token ranges belong to which role
  turnBoundaries?: TurnBoundary[];
}

// Sentence info for building CommitAnchors (from curate preview chunks)
export interface PendingCommitSentence {
  id: string; // Sentence/chunk ID
  text: string; // Sentence text
  start: number; // Global start char position (in source_text)
  end: number; // Global end char position (in source_text)
  /** v1.3: Turn hash this sentence belongs to (for source context display) */
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
  sentences?: PendingCommitSentence[]; // Ring3 sentences from curate preview
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
    confidence?: number;
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
   * @display Sentence-level inline highlights in commit detail view
   * @format SentenceWithAnchors[] with confirmed anchor spans
   */
  anchors?: CommitAnchors;

  /**
   * CommitV3 data for sentence-based commits
   * @display UnitNode: Sentences list and constraint badges
   */
  commitV3?: CommitV3Display;

  /**
   * CommitV4 data for V4 architecture (sentences only, no constraints)
   * @display UnitNode: Sentences list with info about Leaf constraints
   */
  commitV4?: CommitV4Display;

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
  /** Link to drafts_v3 record (when commitStatus === 'draft') */
  draftId?: string;

  // ============================================
  // Deprecated fields (keep for migration)
  // ============================================
  sourceConversationId?: string; // Replaced by sourceUnitId
}
