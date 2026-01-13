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
import { createEngineRun, type DeployAgent } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Prompt versions for E2E testing
 * V1: Initial version with room for improvement (intentionally lower score)
 * V2: Optimized version (intentionally higher score)
 */
const PROMPT_VERSIONS = {
  v1: {
    label: 'V1 (Baseline)',
    description: 'Initial prompt with room for improvement',
    content: `You are a weather assistant. Users will ask weather-related questions.
Please answer user questions as comprehensively as possible. You can use the following tools:
- WeatherTool: Query weather
- SearchTool: Web search
- CalculatorTool: Math calculations
Make sure your answers are thorough and professional.`,
    rulesRef: 'weather-agent-eval',
  },
  v2: {
    label: 'V2 (Optimized)',
    description: 'Optimized prompt for better performance',
    content: `You are a weather assistant.
Please answer user weather questions concisely. Prioritize using WeatherTool to query weather, only use other tools when clearly needed.
Keep responses under 100 words.`,
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

  const selectedAgent = agents.find((a) => a.deploy_agent_id === selectedAgentId);
  const canRun = runnerHealthy && selectedAgentId && !isRunning;

  const handleRunTest = async () => {
    if (!selectedAgent) return;

    setIsRunning(true);
    setError(null);

    const promptConfig = PROMPT_VERSIONS[selectedVersion];

    try {
      const result = await createEngineRun({
        leaf: {
          id: `e2e-test-${selectedVersion}`,
          type: 'eval',
          content: promptConfig.content,
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
      });

      setLastRun({
        runId: result.run_id,
        version: selectedVersion,
        status: 'running',
        timestamp: new Date(),
      });

      onRunComplete?.(result.run_id);
    } catch (err) {
      console.error('Failed to run E2E test:', err);
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
      <CardContent className="pt-4 space-y-4">
        {/* Agent Selection */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Agent</span>
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an agent..." />
            </SelectTrigger>
            <SelectContent>
              {agents.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">No agents registered</div>
              ) : (
                agents.map((agent) => (
                  <SelectItem key={agent.deploy_agent_id} value={agent.deploy_agent_id}>
                    {agent.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt Version Selection */}
        <div className="space-y-2">
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
        <div className="space-y-2">
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
          <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Last Run Info */}
        {lastRun && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Last Run</span>
              <Badge
                variant="outline"
                className={cn(
                  lastRun.status === 'completed' &&
                    'border-green-500/30 bg-green-500/10 text-green-600',
                  lastRun.status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-600',
                  lastRun.status === 'running' && 'border-blue-500/30 bg-blue-500/10 text-blue-600'
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
                href={`/deploy/${lastRun.runId}`}
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
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-600">
            Runner is not available. Start it with{' '}
            <code className="rounded bg-muted px-1">pnpm dev:runner</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
