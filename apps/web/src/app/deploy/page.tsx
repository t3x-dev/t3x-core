'use client';

import {
  ChevronRight,
  CloudOff,
  ExternalLink,
  GitCompare,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { E2ETestCard } from '@/components/optimiser/E2ETestCard';
import { LeafSelector } from '@/components/optimiser/LeafSelector';
import { QuickStatsBar } from '@/components/optimiser/metrics/QuickStatsBar';
import { RunsTable } from '@/components/optimiser/RunsTable';
import { showToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

export default function DeployPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      }
    >
      <DeployPageContent />
    </Suspense>
  );
}

function DeployPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialLeafId = searchParams.get('leaf_id') || undefined;
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

  // Load deploy agents from database and sync running status
  const loadDeployAgents = useCallback(async () => {
    try {
      const data = await listDeployAgents();
      const agents = data.deploy_agents;

      // Check if any agents are stuck in 'running' status
      // If their last run is completed/failed, reset status to idle
      for (const agent of agents) {
        if (agent.status === 'running' && agent.last_run_id) {
          try {
            const runsData = await listEngineRuns();
            const lastRun = runsData.runs.find((r) => r.run_id === agent.last_run_id);
            if (lastRun && (lastRun.status === 'completed' || lastRun.status === 'failed')) {
              // Run completed, reset agent status
              await updateDeployAgent(agent.deploy_agent_id, { status: 'idle' });
              agent.status = 'idle';
            }
          } catch (_err) {
            // Agent status sync is best-effort; failures are non-critical
          }
        }
      }

      setDeployAgents(agents);
      return agents;
    } catch (_err) {
      showToast('Failed to load deploy agents', 'error');
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
    } catch (_err) {
      showToast('Failed to load runs', 'error');
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
        } catch (_err) {
          // Filter options are non-critical; proceed without them
        }
      } catch (_err) {
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
    } catch (_err) {
      showToast('Failed to create deploy agent', 'error');
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
      } catch (_err) {
        // Runs refresh is best-effort after triggering agent
      }

      // Show warning if any
      if (result.warning) {
        showToast(`Run warning: ${result.warning}`, 'warning');
      }

      // Navigate to run detail page
      router.push(`/deploy/eval/${result.run_id}`);
    } catch (_err) {
      showToast('Failed to run deploy agent', 'error');

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
    } catch (_err) {
      showToast('Failed to delete deploy agent', 'error');
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
      {/* Runner Offline Info */}
      {runnerHealthy === false && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="flex items-start gap-3 py-4">
            <CloudOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Runner service is not connected</p>
              <p className="text-sm text-muted-foreground">Connect the runner to enable:</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                <li>Agent deployment and execution</li>
                <li>Real-time trace collection</li>
                <li>Automated evaluation</li>
              </ul>
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                          href={`/deploy/eval/${agent.last_run_id}`}
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

      {/* Leaf Selector — run from a Leaf's generated output */}
      <LeafSelector
        agents={deployAgents}
        runnerHealthy={runnerHealthy === true}
        initialLeafId={initialLeafId}
        onRunComplete={async (runId) => {
          await loadRuns(filterModel, filterPromptVersion);
          try {
            const options = await getRunFilterOptions();
            setFilterOptions(options);
          } catch (_err) {
            // Filter options refresh is best-effort
          }
          router.push(`/deploy/eval/${runId}`);
        }}
      />

      {/* E2E Quick Test (collapsible) */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          Quick E2E Test (hardcoded prompt)
        </summary>
        <div className="mt-3">
          <E2ETestCard
            agents={deployAgents}
            runnerHealthy={runnerHealthy === true}
            onRunComplete={async (runId) => {
              await loadRuns(filterModel, filterPromptVersion);
              try {
                const options = await getRunFilterOptions();
                setFilterOptions(options);
              } catch (_err) {
                // Filter options refresh is best-effort
              }
              router.push(`/deploy/eval/${runId}`);
            }}
          />
        </div>
      </details>

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
          <Button variant="outline" size="sm" onClick={() => router.push('/deploy/compare')}>
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
