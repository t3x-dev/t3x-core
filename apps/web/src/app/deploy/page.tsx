'use client';

import {
  Bot,
  ChevronRight,
  CloudOff,
  ExternalLink,
  GitCompare,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { showToast } from '@/components/layout/Toast';
import { E2ETestCard } from '@/components/optimiser/E2ETestCard';
import { LeafSelector } from '@/components/optimiser/LeafSelector';
import { QuickStatsBar } from '@/components/optimiser/metrics/QuickStatsBar';
import { RunsTable } from '@/components/optimiser/RunsTable';
import { KeyboardHintBar } from '@/components/shared/KeyboardHintBar';
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
import { evaluationCompareHref } from '@/domain/evaluationLocation';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { useKeyboardNavigation } from '@/hooks/shared/useKeyboardNavigation';
import { useQuery } from '@/hooks/shared/useQuery';
import {
  ApiError,
  checkRunnerHealth,
  createDeployAgent,
  type DeployAgent,
  deleteDeployAgent,
  type EngineRun,
  getRunFilterOptions,
  listDeployAgents,
  listEngineRuns,
  updateDeployAgent,
} from '@/infrastructure';
import { useProjectStore } from '@/store/projectStore';

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
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project')?.trim() || undefined;
  return <DeployProjectContent key={projectId} projectId={projectId} />;
}

function DeployProjectContent({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prepare = searchParams.get('prepare') === '1';
  const initialLeafId = searchParams.get('leaf_id') || undefined;
  const runner = useQuery({
    queryKey: ['evaluation-runner-health'],
    queryFn: checkRunnerHealth,
    staleTime: 0,
  });
  const runnerHealthy = !runner.isLoading && !runner.error && runner.data?.status === 'ok';
  const [deployAgents, setDeployAgents] = useState<DeployAgent[]>([]);
  const [agentsError, setAgentsError] = useState(false);
  const [runs, setRuns] = useState<EngineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    id: '',
    name: '',
    endpoint: '',
  });

  // Project store — ensure projects are loaded for RunsTable source column
  const projectsInitialized = useProjectStore((s) => s.initialized);
  const projectName = useProjectStore((s) =>
    projectId ? s.projects.find((project) => project.id === projectId)?.name : undefined
  );
  const { list: fetchProjects } = useProjectCrud();

  // Filter states
  const [filterModel, setFilterModel] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<{
    models: string[];
    prompt_versions: string[];
  }>({ models: [], prompt_versions: [] });

  // Load deploy agents from database and sync running status
  const loadDeployAgents = useCallback(async () => {
    try {
      const data = await listDeployAgents({ project_id: projectId });
      const agents = data.deploy_agents;

      // Check if any agents are stuck in 'running' status
      // If their last run is completed/failed, reset status to idle
      const stuckAgents = agents.filter((a) => a.status === 'running' && a.last_run_id);
      if (stuckAgents.length > 0) {
        try {
          const runsData = await listEngineRuns({ project_id: projectId });
          for (const agent of stuckAgents) {
            const lastRun = runsData.runs.find((r) => r.run_id === agent.last_run_id);
            if (lastRun && (lastRun.status === 'completed' || lastRun.status === 'failed')) {
              // Run completed, reset agent status
              await updateDeployAgent(agent.deploy_agent_id, { status: 'idle' });
              agent.status = 'idle';
            }
          }
        } catch (_err) {
          // Agent status sync is best-effort; failures are non-critical
        }
      }

      setDeployAgents(agents);
      setAgentsError(false);
    } catch (_err) {
      setAgentsError(true);
    }
  }, [projectId]);

  // Load runs with optional model filter
  const loadRuns = useCallback(
    async (model?: string | null) => {
      try {
        const runsData = await listEngineRuns({
          project_id: projectId,
          model: model || undefined,
        });
        setRuns(runsData.runs);
      } catch (_err) {
        showToast('Failed to load runs', 'error');
      }
    },
    [projectId]
  );

  // Ensure project store is initialized (for RunsTable Source column)
  useEffect(() => {
    if (!projectsInitialized) {
      fetchProjects();
    }
  }, [projectsInitialized, fetchProjects]);

  useEffect(() => {
    async function loadData() {
      await Promise.all([loadDeployAgents(), loadRuns()]);
      try {
        setFilterOptions(await getRunFilterOptions(projectId));
      } catch {
        // Filter options are optional; the runs list remains available.
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [loadDeployAgents, loadRuns, projectId]);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (model: string | null) => {
      setFilterModel(model);
      loadRuns(model);
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
        project_id: projectId,
      });

      setDeployAgents((prev) => [...prev, agent]);
      setNewAgent({ id: '', name: '', endpoint: '' });
      setShowAddAgent(false);
    } catch (_err) {
      showToast('Failed to create deploy agent', 'error');
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
      setDeployAgents((prev) => prev.filter((a) => a.deploy_agent_id !== agent.deploy_agent_id));
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
    <div className="flex h-full flex-col gap-[var(--space-section)] overflow-auto p-[var(--space-page)]">
      {projectId && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <strong>Project:</strong> {projectName ?? projectId}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={evaluationCompareHref(projectId)}>Open project comparison</Link>
          </Button>
        </div>
      )}
      {/* Runner Offline Info */}
      {!runnerHealthy && !runner.isLoading && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="flex items-start gap-3 py-4">
            <CloudOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Runner service is not connected</p>
              <p className="text-sm text-muted-foreground">
                {runner.error instanceof ApiError &&
                runner.error.code === 'SERVICE_AUTH_NOT_CONFIGURED'
                  ? 'Ask your deployment administrator to configure the Runner service credential.'
                  : 'Connect the Runner service to start evaluation runs.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => window.location.reload()}
              >
                Refresh Runner status
              </Button>
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
            <div className="mb-[var(--space-section)] rounded-lg border bg-muted/30 p-[var(--space-group)] elevation-1">
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

          {agentsError ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
              Could not load deploy agents.
              <Button variant="outline" size="sm" onClick={() => void loadDeployAgents()}>
                Retry agents
              </Button>
            </div>
          ) : deployAgents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No agents deployed"
              description="Deploy agents to evaluate content automatically."
              action={{
                label: 'Deploy Agent',
                onClick: () => setShowAddAgent(true),
              }}
            />
          ) : (
            <div className="divide-y">
              {deployAgents.map((agent) => (
                <div key={agent.deploy_agent_id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 shrink-0 font-medium">{agent.name}</span>
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {agent.endpoint}
                  </code>
                  {agent.last_run_id && (
                    <a
                      href={`/deploy/eval/${agent.last_run_id}`}
                      className="shrink-0 text-xs text-primary hover:underline"
                    >
                      last run
                    </a>
                  )}
                  <a
                    href={agent.endpoint}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteAgent(agent)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leaf Selector — run from a Leaf's generated output */}
      {!projectId && (
        <LeafSelector
          agents={deployAgents}
          runnerHealthy={runnerHealthy === true}
          initialLeafId={initialLeafId}
          onRunComplete={async (runId) => {
            await loadRuns(filterModel);
            try {
              const options = await getRunFilterOptions(projectId);
              setFilterOptions(options);
            } catch (_err) {
              // Filter options refresh is best-effort
            }
            router.push(`/deploy/eval/${runId}`);
          }}
        />
      )}

      {/* E2E Quick Test (collapsible) */}
      {projectId ? (
        <details className="group" id="comparison-preparation" open={prepare || undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            Prepare comparison data
          </summary>
          <div className="mt-3">
            <E2ETestCard
              projectId={projectId}
              agents={deployAgents}
              runnerHealthy={runnerHealthy === true}
              onRunCreated={() => void loadRuns(filterModel)}
            />
          </div>
        </details>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          To prepare comparison data, choose a project first.
          <Button asChild variant="outline" size="sm">
            <Link href={evaluationCompareHref()}>Choose a project</Link>
          </Button>
        </div>
      )}

      {/* Quick Stats */}
      <QuickStatsBar runs={runs} />

      {/* Recent Runs Section */}
      <RecentRunsSection
        runs={runs}
        agents={deployAgents}
        projectId={projectId}
        router={router}
        filterModel={filterModel}
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
  agents,
  projectId,
  router,
  filterModel,
  filterOptions,
  onFilterChange,
}: {
  runs: EngineRun[];
  agents: DeployAgent[];
  projectId?: string;
  router: ReturnType<typeof useRouter>;
  filterModel: string | null;
  filterOptions: { models: string[]; prompt_versions: string[] };
  onFilterChange: (model: string | null) => void;
}) {
  const runIds = useMemo(() => runs.slice(0, 15).map((r) => r.run_id), [runs]);

  const { activeId: activeRunId } = useKeyboardNavigation({
    ids: runIds,
    onSelect: (id) => {
      if (id) {
        const el = document.querySelector(`[data-run-id="${id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    },
    onAction: (id) => {
      router.push(`/deploy/eval/${id}`);
    },
    enabled: runs.length > 0,
  });

  const handleModelChange = (value: string) => {
    const newModel = value === 'all' ? null : value;
    onFilterChange(newModel);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <CardTitle>Recent Runs</CardTitle>
          {/* Filter dropdown */}
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
        </div>
        <div className="flex items-center gap-2">
          <KeyboardHintBar
            hints={[
              { key: 'j k', label: 'navigate' },
              { key: 'o', label: 'open' },
              { key: 'esc', label: 'deselect' },
            ]}
          />
          <span className="h-4 w-px bg-[var(--stroke-divider)]" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(evaluationCompareHref(projectId))}
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
        <RunsTable runs={runs} agents={agents} maxRows={15} activeRunId={activeRunId} />
      </CardContent>
    </Card>
  );
}
