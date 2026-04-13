'use client';

import { CheckCircle, ExternalLink, Loader2, Play, Rocket, XCircle } from 'lucide-react';
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
import { useCreateEngineRun } from '@/hooks/useCreateEngineRun';
import { cn } from '@/lib/utils';
import type { DeployAgent } from '@/types/api';

/**
 * Prompt versions for E2E testing
 * V1: Initial version with room for improvement (intentionally lower score)
 * V2: Optimized version (intentionally higher score)
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
    label: 'V2 (Optimized)',
    description: 'Optimized prompt - focused and efficient',
    content: `You are a weather assistant.
For weather questions, use ONLY the WeatherTool. Do not use SearchTool or CalculatorTool.
Answer concisely in under 100 words.`,
    rulesRef: 'weather-agent-eval',
  },
} as const;

type PromptVersion = keyof typeof PROMPT_VERSIONS;

interface E2ETestCardProps {
  agents: DeployAgent[];
  runnerHealthy: boolean;
  onRunComplete?: (runId: string) => void;
}

export function E2ETestCard({ agents, runnerHealthy, onRunComplete }: E2ETestCardProps) {
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion>('v1');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{
    runId: string;
    version: PromptVersion;
    status: 'running' | 'completed' | 'failed';
    timestamp: Date;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { create: createRun } = useCreateEngineRun();

  const selectedAgent = agents.find((a) => a.deploy_agent_id === selectedAgentId);
  const canRun = runnerHealthy && selectedAgentId && !isRunning;

  const handleRunTest = async () => {
    if (!selectedAgent) return;

    setIsRunning(true);
    setError(null);

    const promptConfig = PROMPT_VERSIONS[selectedVersion];

    try {
      const result = await createRun({
        leaf: {
          id: `e2e-test-${selectedVersion}`,
          type: 'eval',
          content: promptConfig.content,
          rules_ref: 'weather-agent-eval', // Use weather-agent specific evaluation rules
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
        status: 'running',
        timestamp: new Date(),
      });

      onRunComplete?.(result.run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run test');
      setLastRun((prev) => (prev ? { ...prev, status: 'failed' } : null));
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
        {/* Agent Selection */}
        <div className="space-y-[var(--space-item)]">
          <span className="text-sm font-medium">Agent</span>
          <Select
            value={selectedAgentId}
            onValueChange={setSelectedAgentId}
            disabled={!agents || agents.length === 0}
          >
            <SelectTrigger>
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
            <SelectTrigger>
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
              <Badge
                variant="outline"
                className={cn(
                  lastRun.status === 'completed' &&
                    'border-[var(--status-success)]/30 bg-[var(--status-success)]/10 text-[var(--status-success)]',
                  lastRun.status === 'failed' &&
                    'border-[var(--status-error)]/30 bg-[var(--status-error)]/10 text-[var(--status-error)]',
                  lastRun.status === 'running' &&
                    'border-[var(--status-info)]/30 bg-[var(--status-info)]/10 text-[var(--status-info)]'
                )}
              >
                {lastRun.status === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {lastRun.status === 'completed' && <CheckCircle className="mr-1 h-3 w-3" />}
                {lastRun.status === 'failed' && <XCircle className="mr-1 h-3 w-3" />}
                {lastRun.status}
              </Badge>
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
            Runner is not available. Start it with{' '}
            <code className="rounded bg-muted px-1">pnpm dev:runner</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
