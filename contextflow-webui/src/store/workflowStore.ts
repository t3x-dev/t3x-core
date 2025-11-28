import { create } from 'zustand'
import * as api from '../services/api'

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

// Callback type for notifications
type NotifyCallback = (message: string, type: 'success' | 'error' | 'warning') => void

type WorkflowStore = {
  workflows: WorkflowSummary[]
  loading: boolean
  error: Error | null
  initialized: boolean
  notifyCallback: NotifyCallback | null
  setNotifyCallback: (cb: NotifyCallback | null) => void
  fetchWorkflows: () => Promise<void>
  addWorkflow: (name?: string) => Promise<WorkflowSummary>
  deleteWorkflow: (id: string) => Promise<void>
  getWorkflow: (id: string) => WorkflowSummary | undefined
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

const projectToWorkflow = (project: api.Project): WorkflowSummary => ({
  id: project.project_id,
  name: project.name,
  description: project.metadata?.description as string || 'Project created via API',
  updatedAt: formatDate(project.created_at),
  owner: 'You',
  status: 'active',
  nodes: project.turns_count || 0,
  drafts: project.conversations_count || 0,
})

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: [],
  loading: false,
  error: null,
  initialized: false,
  notifyCallback: null,

  setNotifyCallback: (cb) => set({ notifyCallback: cb }),

  fetchWorkflows: async () => {
    // Skip if already loading
    if (get().loading) return

    set({ loading: true, error: null })
    try {
      const response = await api.listProjects(50, 0)
      const workflows = response.data.map(projectToWorkflow)
      set({ workflows, loading: false, initialized: true })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      set({
        error,
        loading: false,
        initialized: true,
      })
      get().notifyCallback?.(`Failed to load workflows: ${error.message}`, 'error')
    }
  },

  addWorkflow: async (rawName = 'Untitled Workflow') => {
    const name = rawName.trim() || 'Untitled Workflow'
    const notify = get().notifyCallback

    try {
      // Create project via API
      const project = await api.createProject(name, {
        description: 'Fresh workflow awaiting conversations.',
      })

      const workflow = projectToWorkflow(project)

      set((state) => ({
        workflows: [workflow, ...state.workflows],
      }))

      notify?.(`Created workflow "${name}"`, 'success')
      return workflow
    } catch (err) {
      // Log error and notify user
      console.warn('Failed to create project via API:', err)
      notify?.(`API unavailable - created offline workflow "${name}"`, 'warning')

      const workflow: WorkflowSummary = {
        id: `local-${Date.now()}`,
        name: `${name} (offline)`,
        description: 'Created offline - will sync when API is available.',
        updatedAt: 'just now',
        owner: 'You',
        status: 'draft',
        nodes: 0,
        drafts: 0,
      }

      set((state) => ({
        workflows: [workflow, ...state.workflows],
      }))

      return workflow
    }
  },

  deleteWorkflow: async (id) => {
    const notify = get().notifyCallback
    const workflow = get().workflows.find((w) => w.id === id)

    // Optimistically remove from UI
    set((state) => ({
      workflows: state.workflows.filter((w) => w.id !== id),
    }))

    // Skip API call for local-only workflows
    if (id.startsWith('local-')) {
      notify?.(`Deleted offline workflow`, 'success')
      return
    }

    try {
      const result = await api.deleteProject(id)
      const { cascade_deleted } = result
      const deletedCount = cascade_deleted.turns + cascade_deleted.conversations + cascade_deleted.commits

      notify?.(
        `Deleted "${workflow?.name || id}"${deletedCount > 0 ? ` (${deletedCount} items removed)` : ''}`,
        'success'
      )
    } catch (err) {
      // Restore workflow on failure
      if (workflow) {
        set((state) => ({
          workflows: [workflow, ...state.workflows],
        }))
      }

      const error = err instanceof Error ? err : new Error(String(err))
      console.warn('Failed to delete project via API:', error)

      // Check if it's a 404 (already deleted) - don't restore in this case
      if (error.message.includes('404') || error.message.includes('not found')) {
        notify?.(`Workflow was already deleted from server`, 'warning')
      } else {
        notify?.(`Failed to delete: ${error.message}`, 'error')
      }
    }
  },

  getWorkflow: (id) => get().workflows.find((workflow) => workflow.id === id),
}))
