export interface WorkflowSummary {
  id: string
  name: string
  description: string
  updatedAt: string
  owner: string
  status: 'draft' | 'active' | 'paused'
  nodes: number
  drafts: number
}

export const workflowSeed: WorkflowSummary[] = [
  {
    id: 'osaka-weekend',
    name: 'Osaka Weekend Narrative',
    description: 'Tracks conversations, drafts, and commits for the Osaka trip story.',
    updatedAt: '2 hours ago',
    owner: 'Aya',
    status: 'active',
    nodes: 7,
    drafts: 2,
  },
  {
    id: 'kyoto-detour',
    name: 'Kyoto Detour Merge',
    description: 'Branch comparing Kyoto side-quests vs. budget limits.',
    updatedAt: '40 minutes ago',
    owner: 'Ledger Bot',
    status: 'draft',
    nodes: 4,
    drafts: 1,
  },
  {
    id: 'rail-pass-audit',
    name: 'Rail Pass Evidence',
    description: 'Tool workflows collecting validator evidence for Kansai rail pass.',
    updatedAt: '12 minutes ago',
    owner: 'Tooling',
    status: 'paused',
    nodes: 5,
    drafts: 3,
  },
]

export const workflows = workflowSeed
