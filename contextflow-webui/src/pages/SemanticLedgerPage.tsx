import { useState, type MouseEvent } from 'react'
import { Clock3 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { SemanticCard } from '../components/SemanticCard'
import { boardColumns, semanticFeed, timeline } from '../data/sampleLedger'
import { useCanvasStore } from '../store/canvasStore'
import { useWorkflowStore } from '../store/workflowStore'

const overviewTabs = [
  { id: 'workflows', label: 'Workflows' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'latest', label: 'Latest Commits' },
  { id: 'manage', label: 'Manage' },
] as const

type OverviewTab = (typeof overviewTabs)[number]['id']

export default function SemanticLedgerPage() {
  const [activeTab, setActiveTab] = useState<OverviewTab>('workflows')
  const navigate = useNavigate()
  const resetCanvas = useCanvasStore((state) => state.resetToSingleConversation)
  const { workflows, addWorkflow, deleteWorkflow } = useWorkflowStore()

  const handleCreateWorkflow = () => {
    const name = window.prompt('Name this workflow', `Workflow ${workflows.length + 1}`)
    if (name === null) {
      return
    }
    const workflow = addWorkflow(name)
    resetCanvas()
    setActiveTab('workflows')
    navigate(`/workflow/${workflow.id}`)
  }

  const handleDeleteWorkflow = (event: MouseEvent, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    deleteWorkflow(id)
  }

  const renderSection = () => {
    switch (activeTab) {
      case 'ledger':
        return (
          <div className="page-section">
            <div className="section-header">
              <h2>Ledger</h2>
              <p>Semantic turns, drafts, and commits from the ledger.</p>
            </div>
            <div className="card-grid">
              {semanticFeed.map((entry) => (
                <SemanticCard key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )
      case 'latest':
        return (
          <div className="page-section">
            <div className="latest-grid">
              <div className="timeline">
                <header>
                  <h3>Latest Commits</h3>
                  <span>
                    <Clock3 size={14} /> Updated live
                  </span>
                </header>
                <ul>
                  {timeline.map((item) => (
                    <li key={item.id}>
                      <div className={['timeline-pill', `timeline-pill--${item.stage}`].join(' ')}>
                        {item.stage.toUpperCase()}
                      </div>
                      <div>
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </div>
                      <small>{item.time}</small>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="status-board">
                {Object.entries(boardColumns).map(([column, entries]) => (
                  <div key={column} className="status-column">
                    <header>
                      <h4>{column}</h4>
                      <span>{entries.length}</span>
                    </header>
                    <ul>
                      {entries.map((entry) => (
                        <li key={entry.id}>
                          <strong>{entry.title}</strong>
                          <p>{entry.summary}</p>
                          <span className={`badge badge--${entry.stage}`}>{entry.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      case 'manage':
        return (
          <div className="page-section manage-panel">
            <h2>Manage</h2>
            <p>Placeholder for upcoming admin tools (validators, bridge prompts, roles).</p>
          </div>
        )
      case 'workflows':
      default:
        return (
          <div className="page-section">
            <div className="section-header">
              <h2>Workflows</h2>
              <button className="secondary-btn" onClick={handleCreateWorkflow}>
                Create Workflow
              </button>
            </div>
            <div className="workflow-grid">
              {workflows.length === 0 && (
                <div className="workflow-card workflow-card--empty">
                  <strong>No workflows yet.</strong>
                  <p>Create one to start mapping conversations and drafts.</p>
                </div>
              )}
              {workflows.map((workflow) => (
                <Link key={workflow.id} to={`/workflow/${workflow.id}`} className="workflow-card">
                  <button
                    className="workflow-card__delete"
                    onClick={(event) => handleDeleteWorkflow(event, workflow.id)}
                    aria-label={`Delete ${workflow.name}`}
                  >
                    ×
                  </button>
                  <div className="workflow-card__head">
                    <strong>{workflow.name}</strong>
                    <span className={`status-dot status-dot--${workflow.status}`}>{workflow.status}</span>
                  </div>
                  <p>{workflow.description}</p>
                  <footer>
                    <span>
                      {workflow.nodes} nodes · {workflow.drafts} drafts
                    </span>
                    <small>{workflow.updatedAt}</small>
                  </footer>
                </Link>
              ))}
            </div>
          </div>
        )
    }
  }

  return (
    <div className="ledger-page">
      <div className="overview-tabs">
        {overviewTabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'overview-tab overview-tab--active' : 'overview-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {renderSection()}
    </div>
  )
}
