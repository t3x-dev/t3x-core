import { create } from 'zustand'
import type { WorkflowSummary } from '../data/workflows'
import { workflowSeed } from '../data/workflows'

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

type WorkflowStore = {
  workflows: WorkflowSummary[]
  addWorkflow: (name?: string) => WorkflowSummary
  deleteWorkflow: (id: string) => void
  getWorkflow: (id: string) => WorkflowSummary | undefined
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: workflowSeed,
  addWorkflow: (rawName = 'Untitled Workflow') => {
    const name = rawName.trim() || 'Untitled Workflow'
    const baseSlug = slugify(name) || 'workflow'
    const existing = new Set(get().workflows.map((wf) => wf.id))
    let uniqueSlug = baseSlug
    let suffix = 1
    while (existing.has(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${suffix++}`
    }
    const workflow: WorkflowSummary = {
      id: uniqueSlug,
      name,
      description: 'Fresh workflow awaiting conversations.',
      updatedAt: 'just now',
      owner: 'You',
      status: 'draft',
      nodes: 1,
      drafts: 0,
    }
    set((state) => ({
      workflows: [workflow, ...state.workflows],
    }))
    return workflow
  },
  deleteWorkflow: (id) =>
    set((state) => ({
      workflows: state.workflows.filter((workflow) => workflow.id !== id),
    })),
  getWorkflow: (id) => get().workflows.find((workflow) => workflow.id === id),
}))
