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
  sourceCommitId: string
  sourceCommitTitle: string
  sourceContent: string
  baseCommitId?: string
  baseCommitTitle?: string
  baseContent?: string
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
}
