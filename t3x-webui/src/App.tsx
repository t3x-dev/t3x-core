import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Toast, useToast } from './components/Toast'
import { useProjectStore } from './store/projectStore'
import SemanticLedgerPage from './pages/SemanticLedgerPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import AgentDemoChatPage from './pages/AgentDemoChatPage'
import AgentDemoOptimiserPage from './pages/AgentDemoOptimiserPage'
import InsightsPage from './pages/InsightsPage'
import DeployPage from './pages/DeployPage'
import EvalPage from './pages/EvalPage'

function App() {
  const { messages, addToast, dismissToast } = useToast()
  const setNotifyCallback = useProjectStore((state) => state.setNotifyCallback)

  // Register toast callback with project store
  useEffect(() => {
    setNotifyCallback(addToast)
    return () => setNotifyCallback(null)
  }, [setNotifyCallback, addToast])

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<SemanticLedgerPage />} />
          <Route path="/project/:projectId" element={<ProjectDetailPage />} />
          <Route path="/agent-demo/chat" element={<AgentDemoChatPage />} />
          <Route path="/agent-demo/optimiser" element={<AgentDemoOptimiserPage />} />
          <Route path="/deploy" element={<DeployPage />} />
          <Route path="/eval/:runId" element={<EvalPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          {/* Redirect old route */}
          <Route path="/agent-optimiser" element={<Navigate to="/agent-demo/chat" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toast messages={messages} onDismiss={dismissToast} />
    </div>
  )
}

export default App
