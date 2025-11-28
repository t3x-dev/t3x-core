import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { TopNav } from './components/TopNav'
import { Toast, useToast } from './components/Toast'
import { useWorkflowStore } from './store/workflowStore'
import SemanticLedgerPage from './pages/SemanticLedgerPage'
import WorkflowDetailPage from './pages/WorkflowDetailPage'

function App() {
  const { messages, addToast, dismissToast } = useToast()
  const setNotifyCallback = useWorkflowStore((state) => state.setNotifyCallback)

  // Register toast callback with workflow store
  useEffect(() => {
    setNotifyCallback(addToast)
    return () => setNotifyCallback(null)
  }, [setNotifyCallback, addToast])

  return (
    <div className="app-shell">
      <TopNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<SemanticLedgerPage />} />
          <Route path="/workflow/:workflowId" element={<WorkflowDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toast messages={messages} onDismiss={dismissToast} />
    </div>
  )
}

export default App
