'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  FlaskConical,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb,
  Play,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  getRunTrace,
  getEngineRun,
  runEval,
  type RunTrace,
  type TestStep,
  type TestResult,
  type EvalResponse,
} from '@/lib/api';

// Default test steps for demonstration
const DEFAULT_TEST_STEPS: TestStep[] = [
  {
    id: '1',
    name: 'Output is not empty',
    type: 'custom',
    target: 'output',
    assertion: { fn: 'return value !== null && value !== undefined' },
    severity: 'error',
  },
  {
    id: '2',
    name: 'No error in output',
    type: 'not_contains',
    target: 'output',
    assertion: { value: 'error' },
    severity: 'warning',
  },
];

export default function EvalPage() {
  const params = useParams();
  const runId = params.runId as string;
  const router = useRouter();
  const [trace, setTrace] = useState<RunTrace | null>(null);
  const [evalResult, setEvalResult] = useState<EvalResponse | null>(null);
  const [testSteps] = useState<TestStep[]>(DEFAULT_TEST_STEPS);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Load run (try Engine first, fall back to Runner)
  useEffect(() => {
    async function loadRun() {
      if (!runId) return;

      // Check if this is a legacy run (via query param)
      const urlParams = new URLSearchParams(window.location.search);
      const legacy = urlParams.get('legacy') === '1';

      if (legacy) {
        // Load from Runner directly
        try {
          const traceData = await getRunTrace(runId);
          setTrace(traceData);
        } catch (err) {
          console.error('Failed to load legacy trace:', err);
        } finally {
          setLoading(false);
        }
        return;
      }

      // Try Engine first
      try {
        const run = await getEngineRun(runId);

        // Extract trace from result if available
        if (run.result?.evidence_pack?.trace) {
          setTrace(run.result.evidence_pack.trace as RunTrace);
        } else if (run.result) {
          // Generate a minimal trace from engine run result for display
          const syntheticTrace: RunTrace = {
            run_id: run.run_id,
            agent_id: 'n8n-workflow',
            started_at: run.created_at,
            completed_at: run.updated_at,
            status:
              run.status === 'completed'
                ? 'completed'
                : run.status === 'failed'
                  ? 'failed'
                  : 'running',
            input: run.inputs || {},
            output: run.result.run_report?.output || run.result.evidence_pack?.n8n_output,
            events: [
              {
                id: 'input',
                timestamp: run.created_at,
                type: 'agent_input',
                data: { input: run.inputs },
              },
              {
                id: 'output',
                timestamp: run.updated_at,
                type: 'agent_output',
                data: {
                  output: run.result.run_report?.output || run.result.evidence_pack?.n8n_output,
                  latency_ms:
                    (run.result.run_report?.meta as { latency_ms?: number } | undefined)
                      ?.latency_ms ||
                    (run.result.evidence_pack?.n8n_meta as { latency_ms?: number } | undefined)
                      ?.latency_ms,
                },
              },
            ],
            metrics: {
              total_latency_ms:
                (run.result.run_report?.meta as { latency_ms?: number } | undefined)?.latency_ms ||
                (run.result.evidence_pack?.n8n_meta as { latency_ms?: number } | undefined)
                  ?.latency_ms ||
                0,
              llm_calls: 0,
              tool_calls: 0,
            },
          };
          setTrace(syntheticTrace);

          // Load saved assertions from PG if available
          if (run.result?.assertions && Array.isArray(run.result.assertions) && run.result.assertions.length > 0) {
            const savedAssertions = run.result.assertions as Array<{
              id: string;
              type: 'pass' | 'fail' | 'warning';
              category: string;
              message: string;
              confidence: number;
            }>;

            // Convert LLM assertions to EvalResponse format
            const passCount = savedAssertions.filter(a => a.type === 'pass').length;
            const failCount = savedAssertions.filter(a => a.type === 'fail').length;

            setEvalResult({
              run_id: run.run_id,
              passed: failCount === 0,
              total_steps: savedAssertions.length,
              passed_steps: passCount,
              failed_steps: failCount,
              results: savedAssertions.map(a => ({
                step_id: a.id,
                step_name: a.message.slice(0, 50) + (a.message.length > 50 ? '...' : ''),
                passed: a.type === 'pass',
                severity: a.type === 'fail' ? 'error' : a.type === 'warning' ? 'warning' : 'info',
                message: a.message,
                expected: a.category,
                actual: `${a.type} (${Math.round(a.confidence * 100)}% confidence)`,
              })),
              suggestions: (run.result as { eval_summary?: string }).eval_summary ? [{
                type: 'other' as const,
                description: (run.result as { eval_summary?: string }).eval_summary as string,
                confidence: 1,
              }] : undefined,
            });
          }
        }
      } catch (err) {
        console.warn('Run not found in Engine, trying Runner:', err);
        // Fall back to Runner
        try {
          const traceData = await getRunTrace(runId);
          setTrace(traceData);
        } catch (runnerErr) {
          console.error('Failed to load trace from both Engine and Runner:', runnerErr);
        }
      } finally {
        setLoading(false);
      }
    }

    loadRun();
  }, [runId]);

  const handleRunEval = async () => {
    if (!runId) return;

    setEvaluating(true);
    try {
      const result = await runEval(runId, testSteps, { generate_suggestions: true });
      setEvalResult(result);
    } catch (err) {
      console.error('Failed to run eval:', err);
    } finally {
      setEvaluating(false);
    }
  };

  const toggleEventExpand = (eventId: string) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId);
    } else {
      newExpanded.add(eventId);
    }
    setExpandedEvents(newExpanded);
  };

  const getResultIcon = (result: TestResult) => {
    if (result.passed) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    switch (result.severity) {
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getEventTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      llm_call: 'LLM',
      tool_call: 'Tool',
      agent_input: 'Input',
      agent_output: 'Output',
      error: 'Error',
    };
    const variants: Record<string, string> = {
      llm_call: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
      tool_call: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
      agent_input: 'border-gray-500/30 bg-gray-500/10 text-gray-600',
      agent_output: 'border-green-500/30 bg-green-500/10 text-green-600',
      error: 'border-red-500/30 bg-red-500/10 text-red-600',
    };
    return (
      <Badge variant="outline" className={variants[type] || ''}>
        {labels[type] || type}
      </Badge>
    );
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, string> = {
      error: 'border-red-500/30 bg-red-500/10 text-red-600',
      warning: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
      info: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
    };
    return (
      <Badge variant="outline" className={variants[severity] || ''}>
        {severity}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading run...</span>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex h-full flex-col gap-6 overflow-auto p-6">
        <header className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Eval</h1>
        </header>
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="mb-4 h-12 w-12 text-red-500" />
            <h2 className="text-lg font-semibold">Run not found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The run ID "<code className="rounded bg-muted px-1">{runId}</code>" could not be found.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              This usually means the n8n workflow hasn't been set up or activated yet.
            </p>
            <Button variant="outline" className="mt-6" onClick={() => router.push('/deploy')}>
              <ArrowLeft className="h-4 w-4" />
              Back to Deploy
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/deploy')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FlaskConical className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Eval</h1>
          <code className="rounded bg-muted px-2 py-1 text-sm">{runId}</code>
        </div>
        <Badge
          variant="outline"
          className={cn(
            trace.status === 'completed' && 'border-green-500/30 bg-green-500/10 text-green-600',
            trace.status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-600',
            trace.status === 'running' && 'border-blue-500/30 bg-blue-500/10 text-blue-600'
          )}
        >
          {trace.status === 'completed' ? (
            <CheckCircle className="h-3 w-3" />
          ) : trace.status === 'failed' ? (
            <XCircle className="h-3 w-3" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          {trace.status}
        </Badge>
      </header>

      {/* Run Info Section */}
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b pb-4">
          <CardTitle>Run Info</CardTitle>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {trace.metrics?.total_latency_ms || 0}ms
            </span>
            <span>LLM: {trace.metrics?.llm_calls || 0}</span>
            <span>Tools: {trace.metrics?.tool_calls || 0}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Agent</p>
              <code className="text-sm">{trace.agent_id}</code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Started</p>
              <span className="text-sm">{new Date(trace.started_at).toLocaleString()}</span>
            </div>
            {trace.completed_at && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Completed</p>
                <span className="text-sm">{new Date(trace.completed_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trace Events Section */}
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b pb-4">
          <CardTitle>Trace Events</CardTitle>
          <Badge variant="outline">{trace.events.length} events</Badge>
        </CardHeader>
        <CardContent className="pt-4">
          {trace.events.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No trace events recorded.
            </div>
          ) : (
            <div className="space-y-2">
              {trace.events.map((event) => (
                <div key={event.id} className="rounded-lg border">
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    onClick={() => toggleEventExpand(event.id)}
                  >
                    {expandedEvents.has(event.id) ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    {getEventTypeBadge(event.type)}
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    {event.data.latency_ms && (
                      <span className="text-xs text-muted-foreground">{event.data.latency_ms}ms</span>
                    )}
                    {event.data.model && (
                      <Badge variant="outline" className="text-xs">
                        {event.data.model}
                      </Badge>
                    )}
                    {event.data.tool_name && (
                      <Badge variant="outline" className="text-xs">
                        {event.data.tool_name}
                      </Badge>
                    )}
                  </button>
                  {expandedEvents.has(event.id) && (
                    <div className="space-y-3 border-t bg-muted/30 px-4 py-3">
                      {event.data.input != null && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Input</p>
                          <pre className="overflow-auto rounded bg-background p-2 text-xs">
                            {JSON.stringify(event.data.input, null, 2)}
                          </pre>
                        </div>
                      )}
                      {event.data.output != null && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Output</p>
                          <pre className="overflow-auto rounded bg-background p-2 text-xs">
                            {JSON.stringify(event.data.output, null, 2)}
                          </pre>
                        </div>
                      )}
                      {event.data.error && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-red-500">Error</p>
                          <pre className="overflow-auto rounded bg-red-500/10 p-2 text-xs text-red-600">
                            {String(event.data.error)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evaluation Section */}
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b pb-4">
          <CardTitle>Evaluation</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleRunEval} disabled={evaluating}>
              {evaluating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Eval
                </>
              )}
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {evalResult ? (
            <div className="space-y-4">
              {/* Summary */}
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg px-4 py-3',
                  evalResult.passed
                    ? 'bg-green-500/10 text-green-600'
                    : 'bg-red-500/10 text-red-600'
                )}
              >
                {evalResult.passed ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <span className="font-medium">
                  {evalResult.passed ? 'All Tests Passed' : 'Tests Failed'}
                </span>
                <span className="text-sm opacity-80">
                  {evalResult.passed_steps}/{evalResult.total_steps} passed
                </span>
              </div>

              {/* Test Results Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evalResult.results.map((result) => (
                    <TableRow key={result.step_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getResultIcon(result)}
                          <span>{result.step_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getSeverityBadge(result.severity)}</TableCell>
                      <TableCell>
                        {result.passed ? (
                          <Badge
                            variant="outline"
                            className="border-green-500/30 bg-green-500/10 text-green-600"
                          >
                            passed
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-red-500/30 bg-red-500/10 text-red-600"
                          >
                            failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {result.message || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Suggestions */}
              {evalResult.suggestions && evalResult.suggestions.length > 0 && (
                <div className="rounded-lg border bg-amber-500/5 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold text-amber-600">
                    <Lightbulb className="h-4 w-4" />
                    Suggestions
                  </h3>
                  <div className="space-y-3">
                    {evalResult.suggestions.map((suggestion, i) => (
                      <div key={i} className="rounded border bg-background p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="outline">{suggestion.type.replace('_', ' ')}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(suggestion.confidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="text-sm">{suggestion.description}</p>
                        {suggestion.diff && (
                          <pre className="mt-2 overflow-auto rounded bg-muted p-2 text-xs">
                            {suggestion.diff}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={FlaskConical}
              title="No evaluation yet"
              description="Click 'Run Eval' to evaluate this trace."
              action={{
                label: 'Run Eval',
                onClick: handleRunEval,
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
