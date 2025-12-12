export type NodeKind = 'conversation' | 'commit' | 'leaf'

// Commit status: pending (editable) or committed (read-only)
export type CommitStatus = 'pending' | 'committed'

// Leaf node types for output destinations
export type LeafType = 'twitter' | 'weibo' | 'wechat' | 'article' | 'email' | 'slack'

export interface LeafNodeConfig {
  leafType: LeafType
  // Additional config can be added per leaf type
}
export type BranchType = 'main' | 'branch'

export type ValidationCheckStatus = 'pass' | 'fail' | 'warn'

export interface DraftValidationCheck {
  id: string
  label: string
  status: ValidationCheckStatus
}

export interface MergeConfig {
  targetCommitId: string
  targetCommitTitle: string
  targetContent: string
  targetCommitHash: string  // Full commit hash for API calls
  sourceCommitId: string
  sourceCommitTitle: string
  sourceContent: string
  sourceCommitHash: string  // Full commit hash for API calls
  baseCommitId?: string
  baseCommitTitle?: string
  baseContent?: string
  baseCommitHash?: string   // Full commit hash for API calls
}

// Clause (sentence) status in Manage mode
export type ClauseStatus = 'neutral' | 'keep' | 'discard'

// Keyword constraint type
export type KeywordConstraintType = 'must_have' | 'mustnt_have' | 'neutral'

// Individual clause/sentence with its status
export interface Clause {
  id: string
  text: string
  status: ClauseStatus
  keywords: Keyword[]
}

// Individual keyword with constraint info
export interface Keyword {
  id: string
  text: string
  constraint: KeywordConstraintType
}

// Conversation constraints (output of Manage mode)
export interface ConversationConstraints {
  clauses: Clause[]
  must_have: string[]
  mustnt_have: string[]
}

// ============================================
// New: Free-form text selection types
// ============================================

// A single token (word/punctuation) in the source text
export interface TextToken {
  id: string
  text: string
  index: number  // Position in the token array
}

// A selected range - defined by start and end token indices
export interface TextSelection {
  id: string
  startIndex: number  // Inclusive
  endIndex: number    // Inclusive
  type: 'include' | 'exclude'  // include = 浅绿, exclude = 浅红
}

// A keyword marker within a selection (深绿)
export interface KeywordMarker {
  id: string
  tokenIndex: number  // Which token is marked as keyword
  constraint: 'must_have' | 'mustnt_have'
}

// Turn boundary for conversation source (UI display only)
export interface TurnBoundary {
  role: 'user' | 'assistant'
  startTokenIndex: number   // Start token index of this turn (inclusive)
  endTokenIndex: number     // End token index of this turn (inclusive)
}

// Source text block with all user selections
export interface SourceTextBlock {
  id: string
  originalText: string           // The full original text
  tokens: TextToken[]            // Tokenized text
  selections: TextSelection[]    // User-selected ranges (浅绿)
  keywords: KeywordMarker[]      // Marked keywords within selections (深绿)

  // Source node information
  sourceNodeId?: string                        // Source node ID
  sourceNodeType?: 'conversation' | 'commit'   // Source node type
  sourceNodeTitle?: string                     // Display title

  // Turn boundaries for conversation type (UI display only)
  // Defines which token ranges belong to which role
  turnBoundaries?: TurnBoundary[]
}

// Pending commit source data - replaces old clause-based system for pending commits
export interface PendingCommitSource {
  textBlocks: SourceTextBlock[]  // Multiple source text blocks
}

// Draft-level constraint overrides
export interface DraftConstraintOverrides {
  disabledClauseIds: string[]
  additionalMustHave: string[]
  additionalMustntHave: string[]
  removedMustHave: string[]
  removedMustntHave: string[]
}

export interface CanvasNodeData {
  entryId: string
  title: string
  summary: string
  status: string
  timestamp: string
  tags: string[]
  kind: NodeKind
  facets?: string[]
  bridgePrompt?: string
  branchType?: BranchType
  branchName?: string
  pendingBranch?: 'main' | 'branch'
  pendingBranchName?: string
  highlightMode?: 'main' | 'branch'
  validationChecks?: DraftValidationCheck[]
  baselineSummary?: string
  draftInstructions?: string
  draftDiff?: string
  mergeConfig?: MergeConfig
  isMergeCommit?: boolean
  // Conversation constraints from Manage mode
  constraints?: ConversationConstraints
  // Draft-level constraint overrides
  constraintOverrides?: DraftConstraintOverrides
  // Source conversation ID for draft inheritance
  sourceConversationId?: string
  // Draft generation state - true after Generate is clicked
  isGenerated?: boolean
  // Leaf node specific data
  leafType?: LeafType
  leafConfig?: LeafNodeConfig
  // Commit status: pending (editable) or committed (read-only)
  commitStatus?: CommitStatus
  // Full conversation_id for conversation nodes (entryId is truncated for display)
  conversationId?: string
  // Full commit_hash for commit nodes
  commitHash?: string
  // Pending commit source data with free-form text selection
  pendingSource?: PendingCommitSource
  // Committed commit data (from database)
  sourceExcerpt?: string[]  // User-selected source excerpts
  mustHave?: string[]       // Must-have keywords
  mustntHave?: string[]     // Must-not-have keywords
  // Facet snapshot from committed commit
  facetSnapshot?: Array<{
    facet: string
    text?: string
    key?: string
    value?: unknown
    entity_type?: string
    confidence?: number
  }>
  // Source commit info (for pending commits derived from committed commits)
  sourceCommitHash?: string  // Parent commit hash
  sourceTurnWindow?: {
    start_turn_hash: string
    end_turn_hash: string
  }  // Turn window inherited from source commit
}
