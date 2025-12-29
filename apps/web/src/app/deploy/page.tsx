'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Rocket,
  Plus,
  Play,
  Square,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
      setDeployAgents(
        deployAgents.map((a) =>
          a.deploy_agent_id === agent.deploy_agent_id ? { ...a, status: 'running' as const } : a
        )
      );

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
      setDeployAgents(
        deployAgents.map((a) =>
          a.deploy_agent_id === agent.deploy_agent_id
            ? { ...a, status: 'running' as const, last_run_id: result.run_id, last_run_at: nowIso }
            : a
        )
      );

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

      setDeployAgents(
        deployAgents.map((a) =>
          a.deploy_agent_id === agent.deploy_agent_id ? { ...a, status: 'error' as const } : a
        )
      );
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
      setDeployAgents(deployAgents.filter((a) => a.deploy_agent_id !== agent.deploy_agent_id));
    } catch (err) {
      console.error('Failed to delete deploy agent:', err);
      alert('Failed to delete deploy agent. Please try again.');
    }
  };

  const getStatusIcon = (status: DeployAgent['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getRunStatusBadge = (status: RunTrace['status']) => {
    const variants: Record<string, string> = {
      queued: 'border-gray-500/30 bg-gray-500/10 text-gray-600',
      running: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
      completed: 'border-green-500/30 bg-green-500/10 text-green-600',
      failed: 'border-red-500/30 bg-red-500/10 text-red-600',
      timeout: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600',
    };
    return (
      <Badge variant="outline" className={variants[status] || ''}>
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Connecting to runner...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Deploy</h1>
        </div>
        <div>
          {runnerHealthy ? (
            <Badge
              variant="outline"
              className="border-green-500/30 bg-green-500/10 text-green-600"
            >
              <CheckCircle className="h-3 w-3" />
              Runner Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600">
              <AlertCircle className="h-3 w-3" />
              Runner Offline
            </Badge>
          )}
        </div>
      </header>

      {/* Alert */}
      {!runnerHealthy && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium text-red-600">Runner not available</p>
              <p className="text-sm text-muted-foreground">
                Start the runner with: <code className="rounded bg-muted px-1">pnpm docker:up:runner</code> or{' '}
                <code className="rounded bg-muted px-1">pnpm dev:runner</code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deploy Agents Section */}
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b pb-4">
          <CardTitle>Deploy Agents</CardTitle>
          <Button size="sm" onClick={() => setShowAddAgent(true)}>
            <Plus className="h-4 w-4" />
            Add Agent
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {showAddAgent && (
            <div className="mb-6 rounded-lg border bg-muted/30 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  type="text"
                  placeholder="Agent ID (e.g., my-agent)"
                  value={newAgent.id}
                  onChange={(e) => setNewAgent({ ...newAgent, id: e.target.value })}
                />
                <Input
                  type="text"
                  placeholder="Agent Name"
                  value={newAgent.name}
                  onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                />
                <Input
                  type="text"
                  placeholder="Endpoint URL"
                  value={newAgent.endpoint}
                  onChange={(e) => setNewAgent({ ...newAgent, endpoint: e.target.value })}
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddAgent(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleAddAgent}>
                  Register
                </Button>
              </div>
            </div>
          )}

          {deployAgents.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="No deploy agents registered"
              description="Add an agent to get started with deployments."
              action={{
                label: 'Add Agent',
                onClick: () => setShowAddAgent(true),
              }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {deployAgents.map((agent) => (
                <Card key={agent.deploy_agent_id} className="py-4">
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-3">
                      {getStatusIcon(agent.status)}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{agent.name}</h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {agent.deploy_agent_id}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1.5">
                      <code className="flex-1 truncate text-xs">{agent.endpoint}</code>
                      <a
                        href={agent.endpoint}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleRunAgent(agent)}
                        disabled={agent.status === 'running' || !runnerHealthy}
                      >
                        {agent.status === 'running' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Running
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Run
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={agent.status !== 'running'}
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteAgent(agent)}
                        disabled={agent.status === 'running'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {agent.last_run_id && (
                      <p className="text-xs text-muted-foreground">
                        Last run:{' '}
                        <a
                          href={`/eval/${agent.last_run_id}`}
                          className="text-primary hover:underline"
                        >
                          {agent.last_run_id}
                        </a>
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Runs Section */}
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b pb-4">
          <CardTitle>Recent Runs</CardTitle>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {runs.length === 0 ? (
            <EmptyState
              icon={Play}
              title="No runs yet"
              description="Run an agent to see results here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.slice(0, 15).map((run) => (
                  <TableRow key={run.run_id}>
                    <TableCell>
                      <code className="text-xs">{run.run_id}</code>
                    </TableCell>
                    <TableCell>{run.agent_id}</TableCell>
                    <TableCell>{getRunStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => router.push(`/eval/${run.run_id}`)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
