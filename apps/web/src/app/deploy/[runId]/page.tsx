'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  GitCompare,
  Clock,
  Coins,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { getEngineRun, type EngineRun } from '@/lib/api';
import { ChartToggle } from '@/components/optimiser/charts/ChartToggle';
import { AssertionsSection, type Violation, type Suggestion } from '@/components/optimiser/AssertionsSection';

// Types for parsed result data
interface DimensionScores {
  task_completion: number;
  tool_use: number;
  trajectory_efficiency: number;
  cost_efficiency: number;
  latency: number;
}

interface TraceSummary {
  trajectory: {
    total_steps: number;
    llm_calls: number;
    tool_calls: number;
    retrieval_calls: number;
    failed_steps: number;
  };
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency_ms: number;
}

interface EvalResult {
  passed: boolean;
  score: number;
  dimension_scores?: DimensionScores;
  violations?: Violation[];
  suggestion?: Suggestion;
}

interface ParsedRunData {
  evalResult: EvalResult | null;
  traceSummary: TraceSummary | null;
}

/**
 * Parse run result data
 */
function parseRunData(run: EngineRun): ParsedRunData {
  const result = run.result as Record<string, unknown> | null;
  if (!result) {
    return { evalResult: null, traceSummary: null };
  }

  // Parse eval result
  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResultRaw = (runReport?.eval_result || result.eval_result) as Record<string, unknown> | undefined;

  // Parse suggestion - can be string or object with content/confidence
  let suggestion: Suggestion | undefined;
  const suggestionRaw = evalResultRaw?.suggestion;
  if (typeof suggestionRaw === 'string') {
    suggestion = { content: suggestionRaw };
  } else if (suggestionRaw && typeof suggestionRaw === 'object') {
    const suggestionObj = suggestionRaw as Record<string, unknown>;
    suggestion = {
      content: suggestionObj.content as string,
      confidence: suggestionObj.confidence as number | undefined,
    };
  }

  const evalResult: EvalResult | null = evalResultRaw ? {
    passed: evalResultRaw.passed as boolean,
    score: evalResultRaw.score as number,
    dimension_scores: evalResultRaw.dimension_scores as DimensionScores | undefined,
    violations: evalResultRaw.violations as Violation[] | undefined,
    suggestion,
  } : null;

  // Parse trace summary
  const traceSummaryRaw = result.trace_summary as Record<string, unknown> | undefined;
  const traceSummary: TraceSummary | null = traceSummaryRaw ? {
    trajectory: traceSummaryRaw.trajectory as TraceSummary['trajectory'],
    tokens: traceSummaryRaw.tokens as TraceSummary['tokens'],
    latency_ms: traceSummaryRaw.latency_ms as number,
  } : null;

  return { evalResult, traceSummary };
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Format token count
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;
  const router = useRouter();

  const [run, setRun] = useState<EngineRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Load run data
  useEffect(() => {
    async function loadRun() {
      if (!runId) return;

      try {
        const data = await getEngineRun(runId);
        setRun(data);
      } catch (err) {
        console.error('Failed to load run:', err);
        setError('Failed to load run data');
      } finally {
        setLoading(false);
      }
    }

    loadRun();
  }, [runId]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading run...</span>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex h-full flex-col gap-6 p-6">
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="mb-4 h-12 w-12 text-red-500" />
            <h2 className="text-lg font-semibold">Run not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The run ID "<code className="rounded bg-muted px-1">{runId}</code>" could not be found.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => router.push('/deploy')}>
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { evalResult, traceSummary } = parseRunData(run);
  const passed = evalResult?.passed ?? run.status === 'completed';
  const score = evalResult?.score;
  const dimensionScores = evalResult?.dimension_scores;
  const violations = evalResult?.violations || [];
  const suggestion = evalResult?.suggestion;

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/deploy')}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="text-sm text-muted-foreground">Run:</span>
          <code className="rounded bg-muted px-2 py-1 text-sm font-medium">{runId}</code>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/deploy/compare?v1=${runId}`)}>
            <GitCompare className="h-4 w-4" />
            Compare
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Status Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3">
        {/* Pass/Fail Badge */}
        {run.status === 'completed' || run.status === 'failed' ? (
          <Badge
            variant="outline"
            className={cn(
              'px-3 py-1 text-sm',
              passed
                ? 'border-green-500/30 bg-green-500/10 text-green-600'
                : 'border-red-500/30 bg-red-500/10 text-red-600'
            )}
          >
            {passed ? <CheckCircle className="mr-1 h-4 w-4" /> : <XCircle className="mr-1 h-4 w-4" />}
            {passed ? 'Passed' : 'Failed'}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-600">
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            {run.status}
          </Badge>
        )}

        <div className="h-4 w-px bg-border" />

        {/* Score */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Score:</span>
          <span className={cn('font-mono font-semibold', passed ? 'text-green-600' : 'text-red-600')}>
            {score !== undefined ? `${Math.round(score * 100)}%` : '-'}
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Latency */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {traceSummary?.latency_ms ? formatDuration(traceSummary.latency_ms) : '-'}
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Tokens */}
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {traceSummary?.tokens?.total_tokens ? formatTokens(traceSummary.tokens.total_tokens) : '-'} tokens
          </span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trace">Trace</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Dimension Scores */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dimension Scores</CardTitle>
              </CardHeader>
              <CardContent>
                {dimensionScores ? (
                  <ChartToggle scores={dimensionScores} />
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    No dimension scores available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trajectory Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Trajectory Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {traceSummary ? (
                  <div className="space-y-4">
                    {/* Steps */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <p className="text-2xl font-bold">{traceSummary.trajectory.total_steps}</p>
                        <p className="text-xs text-muted-foreground">Total Steps</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <p className="text-2xl font-bold">{traceSummary.trajectory.llm_calls}</p>
                        <p className="text-xs text-muted-foreground">LLM Calls</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <p className="text-2xl font-bold">{traceSummary.trajectory.tool_calls}</p>
                        <p className="text-xs text-muted-foreground">Tool Calls</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">{traceSummary.trajectory.failed_steps}</p>
                        <p className="text-xs text-muted-foreground">Failed Steps</p>
                      </div>
                    </div>

                    {/* Token breakdown */}
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-sm font-medium">Token Usage</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Prompt</span>
                          <span className="font-mono">{formatTokens(traceSummary.tokens.prompt_tokens)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Completion</span>
                          <span className="font-mono">{formatTokens(traceSummary.tokens.completion_tokens)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span className="font-medium">Total</span>
                          <span className="font-mono font-medium">{formatTokens(traceSummary.tokens.total_tokens)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    No trajectory data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Violations & Suggestions */}
          <AssertionsSection violations={violations} suggestion={suggestion} />
        </TabsContent>

        {/* Trace Tab */}
        <TabsContent value="trace" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Full Trace</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                Trace Timeline (Coming in Phase 4)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="mt-4">
          {suggestion ? (
            <AssertionsSection violations={[]} suggestion={suggestion} />
          ) : (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                No improvement suggestions available
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
