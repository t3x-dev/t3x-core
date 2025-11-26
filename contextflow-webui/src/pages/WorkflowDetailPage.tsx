import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import CanvasWorkspace from './CanvasWorkspace'
import { useWorkflowStore } from '../store/workflowStore'

export default function WorkflowDetailPage() {
  const { workflowId } = useParams()
  const workflow = useWorkflowStore((state) =>
    state.workflows.find((item) => item.id === workflowId),
  )
  const [mode, setMode] = useState<'editor' | 'execution'>('editor')

  if (!workflow) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="workflow-page">
      <header className="workflow-header">
        <h2>{workflow.name}</h2>
      </header>

      <div className="workflow-mode-switch">
        <button
          className={mode === 'editor' ? 'mode-btn mode-btn--active' : 'mode-btn'}
          onClick={() => setMode('editor')}
        >
          Editor
        </button>
        <button
          className={mode === 'execution' ? 'mode-btn mode-btn--active' : 'mode-btn'}
          onClick={() => setMode('execution')}
        >
          Execution
        </button>
      </div>

      {mode === 'editor' ? (
        <CanvasWorkspace />
      ) : (
        <div className="execution-panel">
          <p>Execution log will surface here once the workflow runs.</p>
        </div>
      )}
    </div>
  )
}
