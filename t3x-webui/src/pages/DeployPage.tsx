import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rocket, Plus, Play, Square, RefreshCw, ExternalLink, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import {
  checkRunnerHealth,
  registerAgent,
  listRuns,
  createEngineRun,
  listEngineRuns,
  type AgentConfig,
  type RunTrace,
  type EngineRun,
} from '../services/api'

interface Agent extends AgentConfig {
  status: 'idle' | 'running' | 'error'
  lastRunId?: string
  lastRunAt?: string
}

export default function DeployPage() {
  const navigate = useNavigate()
  const [runnerHealthy, setRunnerHealthy] = useState<boolean | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [runs, setRuns] = useState<EngineRun[]>([])
  const [legacyRuns, setLegacyRuns] = useState<RunTrace[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [newAgent, setNewAgent] = useState({
    id: '',
    name: '',
    endpoint: '',
  })

  // Check runner health and load data
  useEffect(() => {
    async function loadData() {
      try {
        const health = await checkRunnerHealth()
        setRunnerHealthy(health.status === 'ok')

        // Load Engine runs (new flow)
        try {
          const engineRunsData = await listEngineRuns()
          setRuns(engineRunsData.runs)
        } catch (err) {
          console.warn('Failed to load Engine runs:', err)
        }

        // Also load legacy Runner runs for backward compatibility
        try {
          const runsData = await listRuns()
          setLegacyRuns(runsData.runs)
        } catch (err) {
          console.warn('Failed to load Runner runs:', err)
        }
      } catch (err) {
        console.error('Failed to connect to runner:', err)
        setRunnerHealthy(false)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleAddAgent = async () => {
    if (!newAgent.id || !newAgent.name || !newAgent.endpoint) return

    try {
      await registerAgent({
        id: newAgent.id,
        name: newAgent.name,
        endpoint: newAgent.endpoint,
        type: 'http',
      })

      setAgents([
        ...agents,
        {
          id: newAgent.id,
          name: newAgent.name,
          endpoint: newAgent.endpoint,
          type: 'http',
          status: 'idle',
        },
      ])
      setNewAgent({ id: '', name: '', endpoint: '' })
      setShowAddAgent(false)
    } catch (err) {
      console.error('Failed to register agent:', err)
    }
  }

  const handleRunAgent = async (agent: Agent) => {
    try {
      setAgents(agents.map(a =>
        a.id === agent.id ? { ...a, status: 'running' as const } : a
      ))

      // Use Engine API to create run (triggers Runner -> n8n flow)
      const result = await createEngineRun({
        inputs: { agent_id: agent.id, test: true },
        workflow: { type: 'n8n', webhook_id: 'agent-run' },
      })

      setAgents(agents.map(a =>
        a.id === agent.id
          ? { ...a, status: 'idle' as const, lastRunId: result.run_id, lastRunAt: new Date().toISOString() }
          : a
      ))

      // Navigate to eval page with run
      navigate(`/eval/${result.run_id}`)
    } catch (err) {
      console.error('Failed to run agent:', err)
      setAgents(agents.map(a =>
        a.id === agent.id ? { ...a, status: 'error' as const } : a
      ))
    }
  }

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 size={14} className="deploy-page__icon--spin" style={{ color: '#0ea5e9' }} />
      case 'error':
        return <XCircle size={14} style={{ color: '#dc2626' }} />
      default:
        return <CheckCircle size={14} style={{ color: '#16a34a' }} />
    }
  }

  const getRunStatusBadge = (status: EngineRun['status'] | RunTrace['status']) => {
    const statusMap: Record<string, string> = {
      queued: 'deploy-page__badge--queued',
      running: 'deploy-page__badge--running',
      completed: 'deploy-page__badge--success',
      failed: 'deploy-page__badge--error',
      timeout: 'deploy-page__badge--warning',
    }
    return (
      <span className={`deploy-page__badge ${statusMap[status] || ''}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="deploy-page">
        <div className="deploy-page__loading">
          <Loader2 size={24} className="deploy-page__icon--spin" />
          <span>Connecting to runner...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="deploy-page">
      {/* Header */}
      <header className="deploy-page__header">
        <div className="deploy-page__header-left">
          <Rocket size={20} />
          <h1>Deploy</h1>
        </div>
        <div className="deploy-page__header-right">
          {runnerHealthy ? (
            <span className="deploy-page__status deploy-page__status--healthy">
              <CheckCircle size={14} /> Runner Connected
            </span>
          ) : (
            <span className="deploy-page__status deploy-page__status--error">
              <AlertCircle size={14} /> Runner Offline
            </span>
          )}
        </div>
      </header>

      {/* Alert */}
      {!runnerHealthy && (
        <div className="deploy-page__alert">
          <AlertCircle size={18} />
          <div>
            <strong>Runner not available</strong>
            <p>Start the runner with: <code>npm run docker:up</code> or <code>npm run runner:dev</code></p>
          </div>
        </div>
      )}

      {/* Agents Section */}
      <section className="deploy-page__section">
        <div className="deploy-page__section-header">
          <h2>Agents</h2>
          <button
            className="deploy-page__btn deploy-page__btn--primary"
            onClick={() => setShowAddAgent(true)}
            disabled={!runnerHealthy}
          >
            <Plus size={16} /> Add Agent
          </button>
        </div>

        {showAddAgent && (
          <div className="deploy-page__form">
            <input
              type="text"
              placeholder="Agent ID (e.g., my-agent)"
              value={newAgent.id}
              onChange={(e) => setNewAgent({ ...newAgent, id: e.target.value })}
            />
            <input
              type="text"
              placeholder="Agent Name"
              value={newAgent.name}
              onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
            />
            <input
              type="text"
              placeholder="Endpoint URL (e.g., http://localhost:3000/agent)"
              value={newAgent.endpoint}
              onChange={(e) => setNewAgent({ ...newAgent, endpoint: e.target.value })}
            />
            <div className="deploy-page__form-actions">
              <button className="deploy-page__btn deploy-page__btn--secondary" onClick={() => setShowAddAgent(false)}>
                Cancel
              </button>
              <button className="deploy-page__btn deploy-page__btn--primary" onClick={handleAddAgent}>
                Register
              </button>
            </div>
          </div>
        )}

        <div className="deploy-page__content">
          {agents.length === 0 ? (
            <div className="deploy-page__empty">
              <p>No agents registered yet. Add an agent to get started.</p>
            </div>
          ) : (
            <div className="deploy-page__grid">
              {agents.map((agent) => (
                <div key={agent.id} className="deploy-page__card">
                  <div className="deploy-page__card-header">
                    {getStatusIcon(agent.status)}
                    <div className="deploy-page__card-info">
                      <h3>{agent.name}</h3>
                      <span>{agent.id}</span>
                    </div>
                  </div>
                  <div className="deploy-page__card-endpoint">
                    <code>{agent.endpoint}</code>
                    <a href={agent.endpoint} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <div className="deploy-page__card-actions">
                    <button
                      className="deploy-page__btn deploy-page__btn--primary"
                      onClick={() => handleRunAgent(agent)}
                      disabled={agent.status === 'running' || !runnerHealthy}
                    >
                      {agent.status === 'running' ? (
                        <><Loader2 size={14} className="deploy-page__icon--spin" /> Running</>
                      ) : (
                        <><Play size={14} /> Run</>
                      )}
                    </button>
                    <button className="deploy-page__btn deploy-page__btn--secondary" disabled={agent.status !== 'running'}>
                      <Square size={14} /> Stop
                    </button>
                  </div>
                  {agent.lastRunId && (
                    <div className="deploy-page__card-meta">
                      Last run: <a href={`/eval/${agent.lastRunId}`}>{agent.lastRunId}</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Recent Runs Section */}
      <section className="deploy-page__section">
        <div className="deploy-page__section-header">
          <h2>Recent Runs</h2>
          <button className="deploy-page__btn deploy-page__btn--secondary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <div className="deploy-page__content">
          {runs.length === 0 && legacyRuns.length === 0 ? (
            <div className="deploy-page__empty">
              <p>No runs yet. Run an agent to see results here.</p>
            </div>
          ) : (
            <table className="deploy-page__table">
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Engine runs (new flow) */}
                {runs.slice(0, 10).map((run) => (
                  <tr key={run.run_id}>
                    <td><code>{run.run_id}</code></td>
                    <td>Engine</td>
                    <td>{getRunStatusBadge(run.status)}</td>
                    <td>{new Date(run.created_at).toLocaleString()}</td>
                    <td>
                      <button
                        className="deploy-page__btn deploy-page__btn--link"
                        onClick={() => navigate(`/eval/${run.run_id}`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Legacy Runner runs */}
                {legacyRuns.slice(0, 5).map((run) => (
                  <tr key={run.run_id} style={{ opacity: 0.7 }}>
                    <td><code>{run.run_id}</code></td>
                    <td>Runner</td>
                    <td>{getRunStatusBadge(run.status)}</td>
                    <td>{new Date(run.started_at).toLocaleString()}</td>
                    <td>
                      <button
                        className="deploy-page__btn deploy-page__btn--link"
                        onClick={() => navigate(`/eval/${run.run_id}?legacy=1`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
