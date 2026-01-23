'use client';

import {
  AlertCircle,
  ExternalLink,
  GitCompare,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { E2ETestCard } from '@/components/optimiser/E2ETestCard';
import { QuickStatsBar } from '@/components/optimiser/metrics/QuickStatsBar';
import { RunsTable } from '@/components/optimiser/RunsTable';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  checkRunnerHealth,
  createDeployAgent,
  createEngineRun,
  type DeployAgent,
  deleteDeployAgent,
  type EngineRun,
  getRunFilterOptions,
  listDeployAgents,
  listEngineRuns,
  updateDeployAgent,
} from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function DeployPage() {
  const router = useRouter();
  const [runnerHealthy, setRunnerHealthy] = useState<boolean | null>(null);
  const [deployAgents, setDeployAgents] = useState<DeployAgent[]>([]);
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    id: '',
    name: '',
    endpoint: '',
  });

  // v2.1: Filter states for A/B test comparison
  const [filterModel, setFilterModel] = useState<string | null>(null);
  const [filterPromptVersion, setFilterPromptVersion] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<{
    models: string[];
    prompt_versions: string[];
  }>({ models: [], prompt_versions: [] });

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

  // Load runs with optional filters
  const loadRuns = useCallback(async (model?: string | null, promptVersion?: string | null) => {
    try {
      const runsData = await listEngineRuns({
        model: model || undefined,
        prompt_version: promptVersion || undefined,
      });
      setRuns(runsData.runs);
    } catch (err) {
      console.warn('Failed to load runs:', err);
    }
  }, []);

  // Check runner health and load data
  useEffect(() => {
    async function loadData() {
      try {
        const health = await checkRunnerHealth();
        setRunnerHealthy(health.status === 'ok');

        // Load deploy agents from database
        await loadDeployAgents();

        // Load Engine runs from database
        await loadRuns();

        // Load filter options for A/B test
        try {
          const options = await getRunFilterOptions();
          setFilterOptions(options);
        } catch (err) {
          console.warn('Failed to load filter options:', err);
        }
      } catch (err) {
        console.error('Failed to connect to runner:', err);
        setRunnerHealthy(false);
        // Still try to load deploy agents even if runner is offline
        await loadDeployAgents();
        await loadRuns();
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [loadDeployAgents, loadRuns]);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (model: string | null, promptVersion: string | null) => {
      setFilterModel(model);
      setFilterPromptVersion(promptVersion);
      loadRuns(model, promptVersion);
    },
    [loadRuns]
  );

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
          type: 'deploy_agent',
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

      // Refresh runs list from Engine
      try {
        const runsData = await listEngineRuns();
        setRuns(runsData.runs);
      } catch (err) {
        console.warn('Failed to refresh runs:', err);
      }

      // Show warning if any
      if (result.warning) {
        console.warn('Run warning:', result.warning);
      }

      // Navigate to run detail page
      router.push(`/deploy/${result.run_id}`);
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

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Runner Offline Alert */}
      {runnerHealthy === false && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-500" />
            <div>
              <p className="font-medium text-red-600">Runner not available</p>
              <p className="text-sm text-muted-foreground">
                Start the runner with:{' '}
                <code className="rounded bg-muted px-1">pnpm docker:up:runner</code> or{' '}
                <code className="rounded bg-muted px-1">pnpm dev:runner</code>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deploy Agents Section */}
      <Card>
        <CardHeader className="border-b py-2">
          <CardTitle>Deploy Agents</CardTitle>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setShowAddAgent(true)}>
              <Plus className="h-4 w-4" />
              Add Agent
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="pt-3 pb-3">
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {deployAgents.map((agent) => (
                <Card key={agent.deploy_agent_id} className="py-3">
                  <CardContent className="space-y-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{agent.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.deploy_agent_id}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1">
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
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunAgent(agent);
                        }}
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
                        className="text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAgent(agent);
                        }}
                        disabled={agent.status === 'running'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {agent.last_run_id && (
                      <p className="text-xs text-muted-foreground">
                        Last run:{' '}
                        <a
                          href={`/deploy/${agent.last_run_id}`}
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

      {/* E2E Test Card */}
      <E2ETestCard
        agents={deployAgents}
        runnerHealthy={runnerHealthy === true}
        onRunComplete={async (runId) => {
          // Refresh runs list with current filters
          await loadRuns(filterModel, filterPromptVersion);
          // Refresh filter options in case new model/prompt was used
          try {
            const options = await getRunFilterOptions();
            setFilterOptions(options);
          } catch (err) {
            console.warn('Failed to refresh filter options:', err);
          }
          // Navigate to run detail page
          router.push(`/deploy/${runId}`);
        }}
      />

      {/* Quick Stats */}
      <QuickStatsBar runs={runs} />

      {/* Recent Runs Section */}
      <RecentRunsSection
        runs={runs}
        router={router}
        filterModel={filterModel}
        filterPromptVersion={filterPromptVersion}
        filterOptions={filterOptions}
        onFilterChange={handleFilterChange}
      />
    </div>
  );
}

/**
 * Recent Runs Section with Compare Mode and Filters
 */
function RecentRunsSection({
  runs,
  router,
  filterModel,
  filterPromptVersion,
  filterOptions,
  onFilterChange,
}: {
  runs: EngineRun[];
  router: ReturnType<typeof useRouter>;
  filterModel: string | null;
  filterPromptVersion: string | null;
  filterOptions: { models: string[]; prompt_versions: string[] };
  onFilterChange: (model: string | null, promptVersion: string | null) => void;
}) {
  const handleModelChange = (value: string) => {
    const newModel = value === 'all' ? null : value;
    onFilterChange(newModel, filterPromptVersion);
  };

  const handlePromptVersionChange = (value: string) => {
    const newPromptVersion = value === 'all' ? null : value;
    onFilterChange(filterModel, newPromptVersion);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <CardTitle>Recent Runs</CardTitle>
          {/* Filter dropdowns */}
          <div className="flex items-center gap-2">
            <Select value={filterModel || 'all'} onValueChange={handleModelChange}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="All Models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {filterOptions.models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPromptVersion || 'all'} onValueChange={handlePromptVersionChange}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="All Prompts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Prompts</SelectItem>
                {filterOptions.prompt_versions.map((version) => (
                  <SelectItem key={version} value={version}>
                    {version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/deploy/compare')}
          >
            <GitCompare className="h-4 w-4" />
            Compare
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <RunsTable runs={runs} maxRows={15} />
      </CardContent>
    </Card>
  );
}
