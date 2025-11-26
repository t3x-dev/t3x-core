export type SemanticStage = 'turn' | 'draft' | 'commit'

export interface SemanticEntry {
  id: string
  title: string
  summary: string
  author: string
  stage: SemanticStage
  status: 'drafting' | 'needs-review' | 'validated' | 'blocked'
  bridgePrompt: string
  updatedAt: string
  tags: string[]
  evidenceCount: number
  facets: string[]
  parent?: string
}
