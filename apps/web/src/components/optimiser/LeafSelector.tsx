'use client';

import { FileText, Leaf, Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { showToast } from '@/components/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createEngineRun,
  type DeployAgent,
  getLeaf,
  type Leaf as LeafData,
  listLeavesByProject,
  listProjects,
} from '@/lib/api';

interface LeafSelectorProps {
  agents: DeployAgent[];
  runnerHealthy: boolean;
  onRunComplete?: (runId: string) => void;
  /** Pre-fill leaf_id from URL parameter */
  initialLeafId?: string;
}

export function LeafSelector({
  agents,
  runnerHealthy,
  onRunComplete,
  initialLeafId,
}: LeafSelectorProps) {
  // Project selection
  const [projects, setProjects] = useState<{ project_id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Leaf selection
  const [leaves, setLeaves] = useState<LeafData[]>([]);
  const [selectedLeafId, setSelectedLeafId] = useState<string>('');
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  // Agent selection
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  // Run config
  const [testQuery, setTestQuery] = useState("What's the weather like in Beijing today?");
  const [rulesRef, setRulesRef] = useState('weather-agent-eval');

  // Run state
  const [isRunning, setIsRunning] = useState(false);

  // Resolved leaf for preview
  const selectedLeaf = leaves.find((l) => l.id === selectedLeafId);

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await listProjects();
        setProjects(data.projects);
      } catch (_err) {
        showToast('Failed to load projects', 'error');
      }
    }
    loadProjects();
  }, []);

  // Pre-fill from initialLeafId
  useEffect(() => {
    if (!initialLeafId) return;

    async function prefill() {
      try {
        const leaf = await getLeaf(initialLeafId!);
        if (leaf) {
          setSelectedProjectId(leaf.project_id);
          setSelectedLeafId(leaf.id);
        }
      } catch (_err) {
        // Leaf not found — ignore, user can select manually
      }
    }
    prefill();
  }, [initialLeafId]);

  // Load leaves when project changes
  const loadLeaves = useCallback(async (projectId: string) => {
    if (!projectId) {
      setLeaves([]);
      return;
    }
    setLoadingLeaves(true);
    try {
      const allLeaves = await listLeavesByProject(projectId);
      // Filter to deploy_agent type only
      const deployLeaves = allLeaves.filter((l) => l.type === 'deploy_agent');
      setLeaves(deployLeaves);
    } catch (_err) {
      showToast('Failed to load leaves', 'error');
      setLeaves([]);
    } finally {
      setLoadingLeaves(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadLeaves(selectedProjectId);
    } else {
      setLeaves([]);
      setSelectedLeafId('');
    }
  }, [selectedProjectId, loadLeaves]);

  // Auto-select first agent if only one
  useEffect(() => {
    if (agents.length === 1 && !selectedAgentId) {
      setSelectedAgentId(agents[0].deploy_agent_id);
    }
  }, [agents, selectedAgentId]);

  const canRun = runnerHealthy && selectedLeafId && selectedAgentId && !isRunning;

  const handleRun = async () => {
    const leaf = leaves.find((l) => l.id === selectedLeafId);
    const agent = agents.find((a) => a.deploy_agent_id === selectedAgentId);
    if (!leaf || !agent) return;

    if (!leaf.output) {
      showToast('Selected leaf has no generated output. Generate output first.', 'error');
      return;
    }

    setIsRunning(true);
    try {
      const result = await createEngineRun({
        project_id: selectedProjectId || undefined,
        leaf_id: leaf.id,
        leaf: rulesRef ? { id: leaf.id, type: 'deploy_agent', rules_ref: rulesRef } : undefined,
        inputs: { query: testQuery },
        workflow: {
          type: 'n8n',
          webhook_id: agent.endpoint,
        },
      });

      if (!result?.run_id) {
        throw new Error('Invalid response: missing run_id');
      }

      showToast('Run started successfully', 'success');
      onRunComplete?.(result.run_id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start run', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Leaf className="h-4 w-4" />
          Run from Leaf
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Project Selection */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Project</span>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.project_id} value={p.project_id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Leaf Selection */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Leaf</span>
            <Select
              value={selectedLeafId}
              onValueChange={setSelectedLeafId}
              disabled={!selectedProjectId || loadingLeaves}
            >
              <SelectTrigger>
                {loadingLeaves ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <SelectValue
                    placeholder={
                      leaves.length === 0 && selectedProjectId
                        ? 'No deploy_agent leaves'
                        : 'Select leaf...'
                    }
                  />
                )}
              </SelectTrigger>
              <SelectContent>
                {leaves.map((leaf) => (
                  <SelectItem key={leaf.id} value={leaf.id}>
                    <div className="flex items-center gap-2">
                      <span>{leaf.title || leaf.id}</span>
                      {leaf.output ? (
                        <Badge variant="outline" className="text-xs">
                          has output
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          no output
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Agent Selection */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Agent</span>
            <Select
              value={selectedAgentId}
              onValueChange={setSelectedAgentId}
              disabled={agents.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={agents.length === 0 ? 'No agents available' : 'Select agent...'}
                />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.deploy_agent_id} value={agent.deploy_agent_id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Leaf Output Preview */}
        {selectedLeaf && selectedLeaf.output && (
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <FileText className="h-3.5 w-3.5" />
              Output Preview
            </span>
            <div className="max-h-24 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
              {selectedLeaf.output.length > 500
                ? `${selectedLeaf.output.slice(0, 500)}...`
                : selectedLeaf.output}
            </div>
          </div>
        )}

        {/* Run Config: Test Query & Eval Rules */}
        {selectedLeaf && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Test Query</span>
              <input
                type="text"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                placeholder="What's the weather like in Beijing today?"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The user message sent to the AI agent
              </p>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Eval Rules</span>
              <input
                type="text"
                className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                placeholder="weather-agent-eval"
                value={rulesRef}
                onChange={(e) => setRulesRef(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Rules file in Runner's resources/rules/ directory
              </p>
            </div>
          </div>
        )}

        {/* Run Button */}
        <Button className="w-full" onClick={handleRun} disabled={!canRun}>
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run with Leaf
            </>
          )}
        </Button>

        {/* Hints */}
        {!runnerHealthy && (
          <p className="text-xs text-muted-foreground">
            Runner is not available. Start it with <code className="rounded bg-muted px-1">pnpm dev:runner</code>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
