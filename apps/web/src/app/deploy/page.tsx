'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Plus, Play, Square, RefreshCw, ExternalLink, AlertCircle, CheckCircle, XCircle, Loader2, Trash2 } from 'lucide-react';
import {
  checkRunnerHealth,
  listRuns,
  listDeployAgents,
  createDeployAgent,
  updateDeployAgent,
  deleteDeployAgent,
  createEngineRun,
  type DeployAgent,
  type RunTrace,
} from '@/lib/api';

export default function DeployPage() {
  const router = useRouter();
  const [runnerHealthy, setRunnerHealthy] = useState<boolean | null>(null);
  const [deployAgents, setDeployAgents] = useState<DeployAgent[]>([]);
  const [runs, setRuns] = useState<RunTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    id: '',
    name: '',
    endpoint: '',
  });

  // Load deploy agents from database
  const loadDeployAgents = useCallback(async () => {
    try {
      const data = await listDeployAgents();
      setDeployAgents(data.deploy_agents);
      return data.deploy_agents;
    } catch (err) {
      console.warn('Failed to load deploy agents from database:', err);
    }
    return [];
  }, []);

  // Check runner health and load data
  useEffect(() => {
    async function loadData() {
      try {
        const health = await checkRunnerHealth();
        setRunnerHealthy(health.status === 'ok');

        // Load deploy agents from database
        await loadDeployAgents();

        // Load Runner runs
        try {
          const runsData = await listRuns();
          setRuns(runsData.runs);
        } catch (err) {
          console.warn('Failed to load runs:', err);
        }
      } catch (err) {
        console.error('Failed to connect to runner:', err);
        setRunnerHealthy(false);
        // Still try to load deploy agents even if runner is offline
        await loadDeployAgents();
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [loadDeployAgents]);

  const handleAddAgent = async () => {
    if (!newAgent.id || !newAgent.name || !newAgent.endpoint) return;

    try {
      // Save to database for persistence
      // endpoint is used as n8n webhook ID for the workflow
      const agent = await createDeployAgent({
        id: newAgent.id,
        name: newAgent.name,
        endpoint: newAgent.endpoint,
        type: 'http',
      });

      setDeployAgents([...deployAgents, agent]);
      setNewAgent({ id: '', name: '', endpoint: '' });
      setShowAddAgent(false);
    } catch (err) {
      console.error('Failed to create deploy agent:', err);
      alert('Failed to create deploy agent. Please try again.');
    }
  };

  const handleRunAgent = async (agent: DeployAgent) => {
    try {
      // Update local state to show running
      setDeployAgents(deployAgents.map(a =>
        a.deploy_agent_id === agent.deploy_agent_id ? { ...a, status: 'running' as const } : a
      ));

      // Update database status
      await updateDeployAgent(agent.deploy_agent_id, { status: 'running' });

      // Use Engine API to trigger n8n workflow
      // agent.endpoint is used as the n8n webhook ID
      const result = await createEngineRun({
        leaf: {
          id: agent.deploy_agent_id,
          type: 'deploy',
        },
        inputs: { test: true },
        workflow: {
          type: 'n8n',
          webhook_id: agent.endpoint,
        },
      });

      const nowIso = new Date().toISOString();

      // Update database with run ID (status will be updated by callback)
      await updateDeployAgent(agent.deploy_agent_id, {
        status: 'running',
        last_run_id: result.run_id,
        last_run_at: nowIso,
      });

      // Update local state
      setDeployAgents(deployAgents.map(a =>
        a.deploy_agent_id === agent.deploy_agent_id
          ? { ...a, status: 'running' as const, last_run_id: result.run_id, last_run_at: nowIso }
          : a
      ));

      // Refresh runs list
      try {
        const runsData = await listRuns();
        setRuns(runsData.runs);
      } catch (err) {
        console.warn('Failed to refresh runs:', err);
      }

      // Show warning if any
      if (result.warning) {
        console.warn('Run warning:', result.warning);
      }

      // Navigate to eval page with run
      router.push(`/eval/${result.run_id}`);
    } catch (err) {
      console.error('Failed to run deploy agent:', err);

      // Update database status to error
      await updateDeployAgent(agent.deploy_agent_id, { status: 'error' });

      setDeployAgents(deployAgents.map(a =>
        a.deploy_agent_id === agent.deploy_agent_id ? { ...a, status: 'error' as const } : a
      ));
    }
  };

  const handleDeleteAgent = async (agent: DeployAgent) => {
    if (!confirm(`Are you sure you want to delete deploy agent "${agent.name}"?`)) {
      return;
    }

    try {
      // Delete from database
      await deleteDeployAgent(agent.deploy_agent_id);

      // Update local state
      setDeployAgents(deployAgents.filter(a => a.deploy_agent_id !== agent.deploy_agent_id));
    } catch (err) {
      console.error('Failed to delete deploy agent:', err);
      alert('Failed to delete deploy agent. Please try again.');
    }
  };

  const getStatusIcon = (status: DeployAgent['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 size={14} className="animate-spin text-blue-500" />;
      case 'error':
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <CheckCircle size={14} className="text-green-500" />;
    }
  };

  const getRunStatusBadge = (status: RunTrace['status']) => {
    const statusStyles: Record<string, string> = {
      queued: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      timeout: 'bg-yellow-100 text-yellow-800',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyles[status] || 'bg-gray-100'}`}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="deploy-page">
        <div className="deploy-page__loading">
          <Loader2 size={24} className="animate-spin" />
          <span>Connecting to runner...</span>
        </div>
      </div>
    );
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
            <p>Start the runner with: <code>pnpm docker:up:runner</code> or <code>pnpm dev:runner</code></p>
          </div>
        </div>
      )}

      {/* Deploy Agents Section */}
      <section className="deploy-page__section">
        <div className="deploy-page__section-header">
          <h2>Deploy Agents</h2>
          <button
            className="deploy-page__btn deploy-page__btn--primary"
            onClick={() => setShowAddAgent(true)}
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
          {deployAgents.length === 0 ? (
            <div className="deploy-page__empty">
              <p>No deploy agents registered yet. Add an agent to get started.</p>
            </div>
          ) : (
            <div className="deploy-page__grid">
              {deployAgents.map((agent) => (
                <div key={agent.deploy_agent_id} className="deploy-page__card">
                  <div className="deploy-page__card-header">
                    {getStatusIcon(agent.status)}
                    <div className="deploy-page__card-info">
                      <h3>{agent.name}</h3>
                      <span>{agent.deploy_agent_id}</span>
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
                        <><Loader2 size={14} className="animate-spin" /> Running</>
                      ) : (
                        <><Play size={14} /> Run</>
                      )}
                    </button>
                    <button className="deploy-page__btn deploy-page__btn--secondary" disabled={agent.status !== 'running'}>
                      <Square size={14} /> Stop
                    </button>
                    <button
                      className="deploy-page__btn deploy-page__btn--danger"
                      onClick={() => handleDeleteAgent(agent)}
                      disabled={agent.status === 'running'}
                      title="Delete deploy agent"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {agent.last_run_id && (
                    <div className="deploy-page__card-meta">
                      Last run: <a href={`/eval/${agent.last_run_id}`}>{agent.last_run_id}</a>
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
          {runs.length === 0 ? (
            <div className="deploy-page__empty">
              <p>No runs yet. Run an agent to see results here.</p>
            </div>
          ) : (
            <table className="deploy-page__table">
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 15).map((run) => (
                  <tr key={run.run_id}>
                    <td><code>{run.run_id}</code></td>
                    <td>{run.agent_id}</td>
                    <td>{getRunStatusBadge(run.status)}</td>
                    <td>{new Date(run.started_at).toLocaleString()}</td>
                    <td>
                      <button
                        className="text-blue-600 hover:underline text-sm"
                        onClick={() => router.push(`/eval/${run.run_id}`)}
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
  );
}
