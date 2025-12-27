'use client';

import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Square,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  type AgentConfig,
  checkRunnerHealth,
  createEngineRun,
  type EngineRun,
  listEngineRuns,
  listRuns,
  type RunTrace,
  registerAgent,
} from '@/lib/api';
import { cn } from '@/lib/utils';

interface Agent extends AgentConfig {
  status: 'idle' | 'running' | 'error';
  lastRunId?: string;
  lastRunAt?: string;
}

// LocalStorage key for persisting agents
const AGENTS_STORAGE_KEY = 't3x-agents';

// Load agents from localStorage (only call in useEffect)
function loadAgentsFromStorage(): Agent[] {
  try {
    const stored = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.warn('Failed to load agents from storage:', err);
  }
  return [];
}

// Save agents to localStorage
function saveAgentsToStorage(agents: Agent[]) {
  try {
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
  } catch (err) {
    console.warn('Failed to save agents to storage:', err);
  }
}

export default function DeployPage() {
  const router = useRouter();
  const [runnerHealthy, setRunnerHealthy] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [legacyRuns, setLegacyRuns] = useState<RunTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    id: '',
    name: '',
    endpoint: '',
  });

  // Load agents from localStorage on client-side mount
  useEffect(() => {
    setAgents(loadAgentsFromStorage());
  }, []);

  // Check runner health and load data
  useEffect(() => {
    async function loadData() {
      try {
        const health = await checkRunnerHealth();
        setRunnerHealthy(health.status === 'ok');

        // Load Engine runs (new flow)
        try {
          const engineRunsData = await listEngineRuns();
          setRuns(engineRunsData.runs);
        } catch (err) {
          console.warn('Failed to load Engine runs:', err);
        }

        // Also load legacy Runner runs for backward compatibility
        try {
          const runsData = await listRuns();
          setLegacyRuns(runsData.runs);
        } catch (err) {
          console.warn('Failed to load Runner runs:', err);
        }
      } catch (err) {
        console.error('Failed to connect to runner:', err);
        setRunnerHealthy(false);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Persist agents to localStorage when they change
  useEffect(() => {
    if (agents.length > 0) {
      saveAgentsToStorage(agents);
    }
  }, [agents]);

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
      setAgents(agents.map((a) => (a.id === agent.id ? { ...a, status: 'running' as const } : a)));

      // Use Engine API to create run (triggers Runner -> n8n flow)
      const result = await createEngineRun({
        inputs: { agent_id: agent.id, test: true },
        workflow: { type: 'n8n', webhook_id: 'agent-run' },
      });

      setAgents(
        agents.map((a) =>
          a.id === agent.id
            ? {
                ...a,
                status: 'idle' as const,
                lastRunId: result.run_id,
                lastRunAt: new Date().toISOString(),
              }
            : a
        )
      );

      // Navigate to eval page with run
      router.push(`/eval/${result.run_id}`);
    } catch (err) {
      console.error('Failed to run agent:', err);
      setAgents(agents.map((a) => (a.id === agent.id ? { ...a, status: 'error' as const } : a)));
    }
  };

  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getRunStatusBadge = (status: EngineRun['status'] | RunTrace['status']) => {
    const variants: Record<string, string> = {
      queued: 'bg-gray-100 text-gray-700 border-gray-200',
      running: 'bg-blue-100 text-blue-700 border-blue-200',
      completed: 'bg-green-100 text-green-700 border-green-200',
      failed: 'bg-red-100 text-red-700 border-red-200',
      timeout: 'bg-amber-100 text-amber-700 border-amber-200',
    };
    return (
      <Badge variant="outline" className={cn('text-xs', variants[status])}>
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Connecting to runner...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Rocket className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Deploy</h1>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'gap-1.5',
            runnerHealthy
              ? 'border-green-500/30 bg-green-500/10 text-green-600'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          )}
        >
          {runnerHealthy ? (
            <>
              <CheckCircle className="h-3 w-3" /> Runner Connected
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3" /> Runner Offline
            </>
          )}
        </Badge>
      </header>

      {/* Alert */}
      {!runnerHealthy && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Runner not available</p>
              <p className="text-sm text-muted-foreground">
                Start the runner with:{' '}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">pnpm docker:up:runner</code>{' '}
                or <code className="bg-muted px-1 py-0.5 rounded text-xs">pnpm dev:runner</code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agents Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Agents</h2>
          <Button onClick={() => setShowAddAgent(true)} disabled={!runnerHealthy}>
            <Plus className="h-4 w-4" /> Add Agent
          </Button>
        </div>

        {showAddAgent && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <Input
                placeholder="Agent ID (e.g., my-agent)"
                value={newAgent.id}
                onChange={(e) => setNewAgent({ ...newAgent, id: e.target.value })}
              />
              <Input
                placeholder="Agent Name"
                value={newAgent.name}
                onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
              />
              <Input
                placeholder="Endpoint URL (e.g., http://localhost:3000/agent)"
                value={newAgent.endpoint}
                onChange={(e) => setNewAgent({ ...newAgent, endpoint: e.target.value })}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAddAgent(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddAgent}>Register</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {agents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No agents registered yet. Add an agent to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Card key={agent.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(agent.status)}
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{agent.id}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    <code className="flex-1 truncate bg-muted px-2 py-1 rounded">
                      {agent.endpoint}
                    </code>
                    <a
                      href={agent.endpoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleRunAgent(agent)}
                      disabled={agent.status === 'running' || !runnerHealthy}
                    >
                      {agent.status === 'running' ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Running
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" /> Run
                        </>
                      )}
                    </Button>
                    <Button variant="outline" size="sm" disabled={agent.status !== 'running'}>
                      <Square className="h-3 w-3" /> Stop
                    </Button>
                  </div>
                  {agent.lastRunId && (
                    <p className="text-xs text-muted-foreground">
                      Last run:{' '}
                      <a href={`/eval/${agent.lastRunId}`} className="text-primary hover:underline">
                        {agent.lastRunId}
                      </a>
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent Runs Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Runs</h2>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {runs.length === 0 && legacyRuns.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No runs yet. Run an agent to see results here.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Engine runs (new flow) */}
                {runs.slice(0, 10).map((run) => (
                  <TableRow key={run.run_id}>
                    <TableCell>
                      <code className="text-xs">{run.run_id}</code>
                    </TableCell>
                    <TableCell>Engine</TableCell>
                    <TableCell>{getRunStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
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
                {/* Legacy Runner runs */}
                {legacyRuns.slice(0, 5).map((run) => (
                  <TableRow key={run.run_id} className="opacity-60">
                    <TableCell>
                      <code className="text-xs">{run.run_id}</code>
                    </TableCell>
                    <TableCell>Runner</TableCell>
                    <TableCell>{getRunStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => router.push(`/eval/${run.run_id}?legacy=1`)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}
