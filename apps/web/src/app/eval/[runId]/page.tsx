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
  GitCommit,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import {
  getRunTrace,
  getEngineRun,
  runEval,
  createCommitFromEval,
  type RunTrace,
  type TestStep,
  type TestResult,
  type EvalResponse,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
  const [committing, setCommitting] = useState(false);
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
            status: run.status === 'completed' ? 'completed' : run.status === 'failed' ? 'failed' : 'running',
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
                  latency_ms: (run.result.run_report?.meta as { latency_ms?: number } | undefined)?.latency_ms ||
                              (run.result.evidence_pack?.n8n_meta as { latency_ms?: number } | undefined)?.latency_ms,
                },
              },
            ],
            metrics: {
              total_latency_ms: (run.result.run_report?.meta as { latency_ms?: number } | undefined)?.latency_ms ||
                               (run.result.evidence_pack?.n8n_meta as { latency_ms?: number } | undefined)?.latency_ms || 0,
              llm_calls: 0,
              tool_calls: 0,
            },
          };
          setTrace(syntheticTrace);
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

  const handleCreateCommit = async () => {
    if (!runId || !evalResult) return;

    setCommitting(true);
    try {
      const result = await createCommitFromEval(
        runId,
        evalResult,
        `Eval run: ${runId} - ${evalResult.passed ? 'passed' : 'failed'}`
      );
      router.push(`/project/${result.commit.project_id}`);
    } catch (err) {
      console.error('Failed to create commit:', err);
    } finally {
      setCommitting(false);
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
      return <CheckCircle size={14} style={{ color: '#16a34a' }} />;
    }
    switch (result.severity) {
      case 'error':
        return <XCircle size={14} style={{ color: '#dc2626' }} />;
      case 'warning':
        return <AlertTriangle size={14} style={{ color: '#d97706' }} />;
      default:
        return <AlertTriangle size={14} style={{ color: '#6b7280' }} />;
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
    const colors: Record<string, string> = {
      llm_call: 'bg-blue-100 text-blue-700 border-blue-200',
      tool_call: 'bg-amber-100 text-amber-700 border-amber-200',
      agent_input: 'bg-gray-100 text-gray-700 border-gray-200',
      agent_output: 'bg-green-100 text-green-700 border-green-200',
      error: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <Badge variant="outline" className={cn('text-xs', colors[type] || '')}>
        {labels[type] || type}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading run...</span>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex h-full flex-col gap-6 overflow-auto p-6">
        <header className="flex items-center gap-3">
          <FlaskConical className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Eval</h1>
        </header>
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-semibold">Run not found</h2>
            <p className="text-muted-foreground">
              The run ID &quot;<code className="bg-muted px-1 rounded text-xs">{runId}</code>&quot; could not be found.
            </p>
            <p className="text-sm text-muted-foreground">
              This usually means the n8n workflow hasn&apos;t been set up or activated yet.
            </p>
            <Button variant="outline" onClick={() => router.push('/deploy')}>
              <ArrowLeft className="h-4 w-4" /> Back to Deploy
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColors = {
    completed: 'border-green-500/30 bg-green-500/10 text-green-600',
    failed: 'border-destructive/30 bg-destructive/10 text-destructive',
    running: 'border-blue-500/30 bg-blue-500/10 text-blue-600',
  };

  const severityColors = {
    error: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/deploy')} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FlaskConical className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">Eval</h1>
          <code className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{runId}</code>
        </div>
        <Badge
          variant="outline"
          className={cn('gap-1.5', statusColors[trace.status as keyof typeof statusColors])}
        >
          {trace.status === 'completed' ? <CheckCircle className="h-3 w-3" /> :
           trace.status === 'failed' ? <XCircle className="h-3 w-3" /> :
           <Loader2 className="h-3 w-3 animate-spin" />}
          {trace.status}
        </Badge>
      </header>

      {/* Run Info Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Run Info</CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {trace.metrics?.total_latency_ms || 0}ms</span>
              <span>LLM: {trace.metrics?.llm_calls || 0}</span>
              <span>Tools: {trace.metrics?.tool_calls || 0}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Agent</p>
              <code className="text-sm">{trace.agent_id}</code>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Started</p>
              <p className="text-sm">{new Date(trace.started_at).toLocaleString()}</p>
            </div>
            {trace.completed_at && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Completed</p>
                <p className="text-sm">{new Date(trace.completed_at).toLocaleString()}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Trace Events Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Trace Events</CardTitle>
            <Badge variant="secondary" className="text-xs">{trace.events.length} events</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {trace.events.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No trace events recorded.</p>
          ) : (
            <div className="space-y-2">
              {trace.events.map((event) => (
                <div key={event.id} className="rounded-lg border">
                  <button
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
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
                      <Badge variant="outline" className="text-xs">{event.data.model}</Badge>
                    )}
                    {event.data.tool_name && (
                      <Badge variant="outline" className="text-xs">{event.data.tool_name}</Badge>
                    )}
                  </button>
                  {expandedEvents.has(event.id) && (
                    <div className="border-t bg-muted/30 p-3 space-y-3">
                      {event.data.input != null && (
                        <div>
                          <p className="mb-1 text-xs font-medium">Input:</p>
                          <pre className="overflow-auto rounded bg-background p-2 text-xs">{JSON.stringify(event.data.input, null, 2)}</pre>
                        </div>
                      )}
                      {event.data.output != null && (
                        <div>
                          <p className="mb-1 text-xs font-medium">Output:</p>
                          <pre className="overflow-auto rounded bg-background p-2 text-xs">{JSON.stringify(event.data.output, null, 2)}</pre>
                        </div>
                      )}
                      {event.data.error && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-destructive">Error:</p>
                          <pre className="overflow-auto rounded bg-destructive/10 p-2 text-xs text-destructive">{String(event.data.error)}</pre>
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
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Evaluation</CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={handleRunEval} disabled={evaluating}>
                {evaluating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Running...</>
                ) : (
                  <><Play className="h-4 w-4" /> Run Eval</>
                )}
              </Button>
              {evalResult && (
                <Button variant="outline" onClick={handleCreateCommit} disabled={committing}>
                  {committing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating...</>
                  ) : (
                    <><GitCommit className="h-4 w-4" /> Create Commit</>
                  )}
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {evalResult ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className={cn(
                'flex items-center gap-3 rounded-lg border p-4',
                evalResult.passed
                  ? 'border-green-500/30 bg-green-500/10 text-green-700'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'
              )}>
                {evalResult.passed ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <span className="font-medium">{evalResult.passed ? 'All Tests Passed' : 'Tests Failed'}</span>
                <span className="ml-auto text-sm">
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
                          {result.step_name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', severityColors[result.severity as keyof typeof severityColors])}>
                          {result.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {result.passed ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-xs">passed</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-xs">failed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{result.message || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Suggestions */}
              {evalResult.suggestions && evalResult.suggestions.length > 0 && (
                <div className="space-y-3 rounded-lg border p-4">
                  <h3 className="flex items-center gap-2 font-medium">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Suggestions
                  </h3>
                  {evalResult.suggestions.map((suggestion, i) => (
                    <div key={i} className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-xs">{suggestion.type.replace('_', ' ')}</Badge>
                        <span className="text-xs text-muted-foreground">{Math.round(suggestion.confidence * 100)}% confidence</span>
                      </div>
                      <p className="text-sm">{suggestion.description}</p>
                      {suggestion.diff && <pre className="overflow-auto rounded bg-background p-2 text-xs">{suggestion.diff}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <FlaskConical className="h-8 w-8" />
              <p>No evaluation yet. Click &quot;Run Eval&quot; to evaluate this trace.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
