'use client';

import { ExternalLink, Loader2, Play, Rocket } from 'lucide-react';
import { useState } from 'react';
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
import { formatUserFacingError } from '@/domain/format/errors';
import { useCreateEngineRun } from '@/hooks/shared/useCreateEngineRun';
import type { DeployAgent } from '@/types/api';

/**
 * Prompt versions for E2E testing
 * V1 and V2 use the same weather question with different prompts.
 */
const PROMPT_VERSIONS = {
  v1: {
    label: 'V1 (Baseline)',
    description: 'Initial prompt - encourages using multiple tools',
    content: `You are a comprehensive weather research assistant.
For ANY weather question, you MUST:
1. First use SearchTool to find background information about the location
2. Then use WeatherTool to get current weather data
3. Use CalculatorTool if any numbers need conversion or calculation
Always gather information from multiple sources before answering.
Provide detailed, thorough responses with all available context.`,
    rulesRef: 'weather-agent-eval',
  },
  v2: {
    label: 'V2 (Variant)',
    description: 'A shorter prompt that asks the agent to use the weather tool only',
    content: `You are a weather assistant.
For weather questions, use ONLY the WeatherTool. Do not use SearchTool or CalculatorTool.
Answer concisely in under 100 words.`,
    rulesRef: 'weather-agent-eval',
  },
} as const;

type PromptVersion = keyof typeof PROMPT_VERSIONS;

interface E2ETestCardProps {
  projectId: string;
  agents: DeployAgent[];
  runnerHealthy: boolean;
  onRunCreated?: () => void;
}

export function E2ETestCard({ projectId, agents, runnerHealthy, onRunCreated }: E2ETestCardProps) {
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion>('v1');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{
    runId: string;
    version: PromptVersion;
    status: string;
    timestamp: Date;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { create: createRun } = useCreateEngineRun();

  const selectedAgent = agents.find((a) => a.deploy_agent_id === selectedAgentId);
  const canRun = runnerHealthy && selectedAgent?.project_id === projectId && !isRunning;

  const handleRunTest = async () => {
    if (!canRun || !selectedAgent) return;

    setIsRunning(true);
    setError(null);

    const promptConfig = PROMPT_VERSIONS[selectedVersion];

    try {
      const result = await createRun({
        project_id: projectId,
        leaf: {
          id: `e2e-test-${selectedVersion}`,
          type: 'eval',
          content: promptConfig.content,
          rules_ref: promptConfig.rulesRef,
        },
        inputs: {
          test: true,
          prompt_version: selectedVersion,
          user_message: 'What is the weather in Beijing today?',
        },
        workflow: {
          type: 'n8n',
          webhook_id: selectedAgent.endpoint,
        },
        // v2.1: Metadata for A/B test filtering
        metadata: {
          prompt_version: selectedVersion,
          test_case: 'weather-query',
        },
      });

      if (!result?.run_id) {
        throw new Error('Invalid response: missing run_id');
      }

      setLastRun({
        runId: result.run_id,
        version: selectedVersion,
        status: result.status,
        timestamp: new Date(),
      });

      if (result.warning || result.status === 'queued') {
        setError(
          'The run was saved, but Runner did not confirm it started. Open the run details to check its status.'
        );
      }
      onRunCreated?.();
    } catch (err) {
      setError(formatUserFacingError(err, 'Failed to run test.'));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4" />
          Quick E2E Test
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-[var(--space-group)]">
        <p className="text-sm text-muted-foreground">
          Choose a project agent backed by a connected n8n workflow, then run both V1 and V2.
          Finished runs appear in Compare once the Runner reports the model used.
        </p>
        {/* Agent Selection */}
        <div className="space-y-[var(--space-item)]">
          <span className="text-sm font-medium">Agent</span>
          <Select
            value={selectedAgentId}
            onValueChange={setSelectedAgentId}
            disabled={!agents || agents.length === 0}
          >
            <SelectTrigger aria-label="Agent">
              <SelectValue
                placeholder={agents?.length ? 'Select an agent...' : 'No agents available'}
              />
            </SelectTrigger>
            <SelectContent>
              {agents?.map((agent) => (
                <SelectItem key={agent.deploy_agent_id} value={agent.deploy_agent_id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt Version Selection */}
        <div className="space-y-[var(--space-item)]">
          <span className="text-sm font-medium">Prompt Version</span>
          <Select
            value={selectedVersion}
            onValueChange={(v) => setSelectedVersion(v as PromptVersion)}
          >
            <SelectTrigger aria-label="Prompt version">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROMPT_VERSIONS).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex flex-col">
                    <span>{config.label}</span>
                    <span className="text-xs text-muted-foreground">{config.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt Preview */}
        <div className="space-y-[var(--space-item)]">
          <span className="text-sm font-medium">Prompt Preview</span>
          <div className="rounded-md bg-muted/50 p-3 text-xs font-mono max-h-24 overflow-auto">
            {PROMPT_VERSIONS[selectedVersion].content}
          </div>
        </div>

        {/* Run Button */}
        <Button className="w-full" onClick={handleRunTest} disabled={!canRun}>
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run E2E Test
            </>
          )}
        </Button>

        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-[var(--status-error)]/10 border border-[var(--status-error)]/30 p-3 text-sm text-[var(--status-error)]">
            {error}
          </div>
        )}

        {/* Last Run Info */}
        {lastRun && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-[var(--space-item)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Last Run</span>
              <Badge variant="outline">Submitted as {lastRun.status}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {PROMPT_VERSIONS[lastRun.version].label} • {lastRun.timestamp.toLocaleTimeString()}
              </span>
              <a
                href={`/deploy/eval/${lastRun.runId}`}
                className="flex items-center gap-1 text-primary hover:underline"
              >
                View Details
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {/* Runner Status Warning */}
        {!runnerHealthy && (
          <div className="rounded-md bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/30 p-3 text-sm text-[var(--status-warning)]">
            The Runner must be connected before you can start this evaluation.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
