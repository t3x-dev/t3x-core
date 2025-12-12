import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import CanvasWorkspace from './CanvasWorkspace'
import { useProjectStore } from '../store/projectStore'
import { useCanvasStore } from '../store/canvasStore'
import { LoadingSpinner, ErrorMessage } from '../components/ApiStatus'

export default function ProjectDetailPage() {
  const { projectId } = useParams()
  const project = useProjectStore((state) =>
    state.projects.find((item) => item.id === projectId),
  )
  const [mode, setMode] = useState<'editor' | 'execution'>('editor')

  // Canvas store for loading project data
  const canvasLoading = useCanvasStore((state) => state.loading)
  const canvasError = useCanvasStore((state) => state.loadError)
  const loadedProjectId = useCanvasStore((state) => state.projectId)

  // Load project data when entering the page
  useEffect(() => {
    if (projectId && projectId !== loadedProjectId) {
      useCanvasStore.getState().loadProjectData(projectId)
    }
  }, [projectId, loadedProjectId])

  if (!project) {
    return <Navigate to="/" replace />
  }

  // Show loading state
  if (canvasLoading) {
    return (
      <div className="project-page">
        <LoadingSpinner message="Loading project data..." />
      </div>
    )
  }

  // Show error state
  if (canvasError) {
    return (
      <div className="project-page">
        <ErrorMessage
          error={canvasError}
          onRetry={() => projectId && useCanvasStore.getState().loadProjectData(projectId)}
        />
      </div>
    )
  }

  return (
    <div className="project-page">
      {mode === 'editor' ? (
        <CanvasWorkspace projectName={project.name} mode={mode} onModeChange={setMode} />
      ) : (
        <div className="project-page__execution">
          <header className="project-topbar">
            <div className="project-topbar__left">
              <h2 className="project-topbar__title">{project.name}</h2>
            </div>
            <div className="project-topbar__right" />
          </header>

          {/* Mode Switch - positioned at topbar/canvas boundary */}
          <div className="mode-switch-container">
            <div className="mode-switch">
              <div
                className="mode-switch__slider"
                style={{ transform: 'translateX(100%)' }}
              />
              <button
                className="mode-switch__btn"
                onClick={() => setMode('editor')}
              >
                Editor
              </button>
              <button
                className="mode-switch__btn mode-switch__btn--active"
                onClick={() => setMode('execution')}
              >
                Execution
              </button>
            </div>
          </div>

          <div className="execution-panel">
            <p>Execution log will surface here once the project runs.</p>
          </div>
        </div>
      )}
    </div>
  )
}
