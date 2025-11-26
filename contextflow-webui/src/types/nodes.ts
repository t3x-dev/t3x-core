export type NodeKind = 'conversation' | 'draft' | 'commit'
export type BranchType = 'main' | 'branch'

export type ValidationCheckStatus = 'pass' | 'fail' | 'warn'

export interface DraftValidationCheck {
  id: string
  label: string
  status: ValidationCheckStatus
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
}
