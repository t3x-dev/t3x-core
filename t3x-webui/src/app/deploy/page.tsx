'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Plus, Play, Square, RefreshCw, ExternalLink, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  checkRunnerHealth,
  registerAgent,
  listRuns,
  runAgent,
  type AgentConfig,
  type RunTrace,
} from '@/lib/api';

interface Agent extends AgentConfig {
  status: 'idle' | 'running' | 'error';
  lastRunId?: string;
  lastRunAt?: string;
}

export default function DeployPage() {
  const router = useRouter();
  const [runnerHealthy, setRunnerHealthy] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<RunTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    id: '',
    name: '',
    endpoint: '',
  });

  // Check runner health and load data
  useEffect(() => {
    async function loadData() {
      try {
        const health = await checkRunnerHealth();
        setRunnerHealthy(health.status === 'ok');

        const runsData = await listRuns();
        setRuns(runsData.runs);
      } catch (err) {
        console.error('Failed to connect to runner:', err);
        setRunnerHealthy(false);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleAddAgent = async () => {
    if (!newAgent.id || !newAgent.name || !newAgent.endpoint) return;

    try {
      await registerAgent({
        id: newAgent.id,
        name: newAgent.name,
        endpoint: newAgent.endpoint,
        type: 'http',
      });

      setAgents([
        ...agents,
        {
          id: newAgent.id,
          name: newAgent.name,
          endpoint: newAgent.endpoint,
          type: 'http',
          status: 'idle',
        },
      ]);
      setNewAgent({ id: '', name: '', endpoint: '' });
      setShowAddAgent(false);
    } catch (err) {
      console.error('Failed to register agent:', err);
    }
  };

  const handleRunAgent = async (agent: Agent) => {
    try {
      setAgents(agents.map(a =>
        a.id === agent.id ? { ...a, status: 'running' as const } : a
      ));

      const result = await runAgent(agent.id, { test: true });

      setAgents(agents.map(a =>
        a.id === agent.id
          ? { ...a, status: 'idle' as const, lastRunId: result.run_id, lastRunAt: new Date().toISOString() }
          : a
      ));

      // Navigate to eval page with run
      router.push(`/eval/${result.run_id}`);
    } catch (err) {
      console.error('Failed to run agent:', err);
      setAgents(agents.map(a =>
        a.id === agent.id ? { ...a, status: 'error' as const } : a
      ));
    }
  };

  const getStatusIcon = (status: Agent['status']) => {
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
    switch (status) {
      case 'running':
        return <span className="badge badge--running">Running</span>;
      case 'completed':
        return <span className="badge badge--success">Completed</span>;
      case 'failed':
        return <span className="badge badge--error">Failed</span>;
      case 'timeout':
        return <span className="badge badge--warning">Timeout</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="deploy-page">
        <div className="deploy-page__loading">
          <Loader2 size={32} className="animate-spin" />
          <span>Connecting to runner...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="deploy-page">
      <header className="deploy-page__header">
        <div className="deploy-page__title">
          <Rocket size={24} />
          <h1>Deploy</h1>
        </div>
        <div className="deploy-page__status">
          {runnerHealthy ? (
            <span className="status-badge status-badge--healthy">
              <CheckCircle size={14} /> Runner Connected
            </span>
          ) : (
            <span className="status-badge status-badge--error">
              <AlertCircle size={14} /> Runner Offline
            </span>
          )}
        </div>
      </header>

      {!runnerHealthy && (
        <div className="deploy-page__alert deploy-page__alert--warning">
          <AlertCircle size={20} />
          <div>
            <strong>Runner not available</strong>
            <p>Start the runner with: <code>npm run docker:up</code> or <code>npm run runner:dev</code></p>
          </div>
        </div>
      )}

      <section className="deploy-page__section">
        <div className="deploy-page__section-header">
          <h2>Agents</h2>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => setShowAddAgent(true)}
            disabled={!runnerHealthy}
          >
            <Plus size={16} /> Add Agent
          </button>
        </div>

        {showAddAgent && (
          <div className="deploy-page__add-agent">
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
            <div className="deploy-page__add-agent-actions">
              <button className="btn btn--secondary btn--sm" onClick={() => setShowAddAgent(false)}>
                Cancel
              </button>
              <button className="btn btn--primary btn--sm" onClick={handleAddAgent}>
                Register
              </button>
            </div>
          </div>
        )}

        <div className="deploy-page__agents">
          {agents.length === 0 ? (
            <div className="deploy-page__empty">
              <p>No agents registered yet. Add an agent to get started.</p>
            </div>
          ) : (
            agents.map((agent) => (
              <div key={agent.id} className="agent-card">
                <div className="agent-card__header">
                  <div className="agent-card__status">
                    {getStatusIcon(agent.status)}
                  </div>
                  <div className="agent-card__info">
                    <h3>{agent.name}</h3>
                    <span className="agent-card__id">{agent.id}</span>
                  </div>
                </div>
                <div className="agent-card__endpoint">
                  <code>{agent.endpoint}</code>
                  <a href={agent.endpoint} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={14} />
                  </a>
                </div>
                <div className="agent-card__actions">
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => handleRunAgent(agent)}
                    disabled={agent.status === 'running' || !runnerHealthy}
                  >
                    {agent.status === 'running' ? (
                      <><Loader2 size={14} className="animate-spin" /> Running</>
                    ) : (
                      <><Play size={14} /> Run</>
                    )}
                  </button>
                  <button className="btn btn--secondary btn--sm" disabled={agent.status !== 'running'}>
                    <Square size={14} /> Stop
                  </button>
                </div>
                {agent.lastRunId && (
                  <div className="agent-card__last-run">
                    Last run: <a href={`/eval/${agent.lastRunId}`}>{agent.lastRunId}</a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="deploy-page__section">
        <div className="deploy-page__section-header">
          <h2>Recent Runs</h2>
          <button className="btn btn--secondary btn--sm" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <div className="deploy-page__runs">
          {runs.length === 0 ? (
            <div className="deploy-page__empty">
              <p>No runs yet. Run an agent to see results here.</p>
            </div>
          ) : (
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 10).map((run) => (
                  <tr key={run.run_id}>
                    <td><code>{run.run_id}</code></td>
                    <td>{run.agent_id}</td>
                    <td>{getRunStatusBadge(run.status)}</td>
                    <td>{new Date(run.started_at).toLocaleString()}</td>
                    <td>{run.metrics?.total_latency_ms ? `${run.metrics.total_latency_ms}ms` : '-'}</td>
                    <td>
                      <button
                        className="btn btn--link btn--sm"
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
