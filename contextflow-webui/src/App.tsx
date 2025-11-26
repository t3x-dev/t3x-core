import { Navigate, Route, Routes } from 'react-router-dom'
import { TopNav } from './components/TopNav'
import SemanticLedgerPage from './pages/SemanticLedgerPage'
import WorkflowDetailPage from './pages/WorkflowDetailPage'

function App() {
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
    </div>
  )
}

export default App
