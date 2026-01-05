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

// Unit commit status: staging (editable) or committed (read-only)
export type CommitStatus = 'staging' | 'committed';

// Leaf node types for output destinations
export type LeafType =
  | 'twitter'
  | 'weibo'
  | 'wechat'
  | 'article'
  | 'email'
  | 'slack'
  | 'deploy'
  | 'eval';

// Deploy status for leaf nodes connected to runner
export type DeployStatus = 'idle' | 'deploying' | 'running' | 'stopped' | 'error';

// Eval status for leaf nodes
export type EvalStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface LeafNodeConfig {
  leafType: LeafType;
  // Additional config can be added per leaf type
}

// Deploy leaf configuration
export interface DeployLeafConfig extends LeafNodeConfig {
  leafType: 'deploy';
  agentId?: string;
  agentName?: string;
  agentEndpoint?: string;
  status: DeployStatus;
  lastRunId?: string;
  lastRunAt?: string;
}

// Eval leaf configuration
export interface EvalLeafConfig extends LeafNodeConfig {
  leafType: 'eval';
  runId?: string;
  testStepsCount?: number;
  passedCount?: number;
  failedCount?: number;
  status: EvalStatus;
  suggestions?: Array<{
    type: string;
    description: string;
    confidence: number;
  }>;
}

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
  status?: DeployStatus | EvalStatus;
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

// Pending commit source data - replaces old clause-based system for pending commits
export interface PendingCommitSource {
  textBlocks: SourceTextBlock[]; // Multiple source text blocks
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
  highlightMode?: 'main' | 'branch';

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
  // Leaf node specific (for standalone LeafNode - deprecated)
  // ============================================
  leafType?: LeafType;
  leafConfig?: LeafNodeConfig;

  // ============================================
  // Deprecated fields (keep for migration)
  // ============================================
  sourceConversationId?: string; // Replaced by sourceUnitId
}
