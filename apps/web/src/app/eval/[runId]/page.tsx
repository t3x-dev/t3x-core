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
      llm_call: 'eval-page__badge--info',
      tool_call: 'eval-page__badge--warning',
      agent_input: 'eval-page__badge--default',
      agent_output: 'eval-page__badge--success',
      error: 'eval-page__badge--error',
    };
    return (
      <span className={`eval-page__badge ${colors[type] || ''}`}>
        {labels[type] || type}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="eval-page">
        <div className="eval-page__loading">
          <Loader2 size={24} className="eval-page__icon--spin" />
          <span>Loading run...</span>
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="eval-page">
        <header className="eval-page__header">
          <div className="eval-page__header-left">
            <FlaskConical size={20} />
            <h1>Eval</h1>
          </div>
        </header>
        <div className="eval-page__not-found">
          <XCircle size={48} style={{ color: '#dc2626' }} />
          <h2>Run not found</h2>
          <p>The run ID "<code>{runId}</code>" could not be found.</p>
          <p className="eval-page__not-found-hint">
            This usually means the n8n workflow hasn't been set up or activated yet.
          </p>
          <button className="eval-page__btn eval-page__btn--secondary" onClick={() => router.push('/deploy')}>
            <ArrowLeft size={16} /> Back to Deploy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="eval-page">
      {/* Header */}
      <header className="eval-page__header">
        <div className="eval-page__header-left">
          <button className="eval-page__btn eval-page__btn--link" onClick={() => router.push('/deploy')}>
            <ArrowLeft size={16} />
          </button>
          <FlaskConical size={20} />
          <h1>Eval</h1>
          <code className="eval-page__run-id">{runId}</code>
        </div>
        <div className="eval-page__header-right">
          <span className={`eval-page__status eval-page__status--${trace.status}`}>
            {trace.status === 'completed' ? <CheckCircle size={14} /> :
             trace.status === 'failed' ? <XCircle size={14} /> :
             <Loader2 size={14} className="eval-page__icon--spin" />}
            {trace.status}
          </span>
        </div>
      </header>

      {/* Run Info Section */}
      <section className="eval-page__section">
        <div className="eval-page__section-header">
          <h2>Run Info</h2>
          <div className="eval-page__meta">
            <span><Clock size={14} /> {trace.metrics?.total_latency_ms || 0}ms</span>
            <span>LLM: {trace.metrics?.llm_calls || 0}</span>
            <span>Tools: {trace.metrics?.tool_calls || 0}</span>
          </div>
        </div>
        <div className="eval-page__content">
          <div className="eval-page__info-grid">
            <div className="eval-page__info-item">
              <label>Agent</label>
              <code>{trace.agent_id}</code>
            </div>
            <div className="eval-page__info-item">
              <label>Started</label>
              <span>{new Date(trace.started_at).toLocaleString()}</span>
            </div>
            {trace.completed_at && (
              <div className="eval-page__info-item">
                <label>Completed</label>
                <span>{new Date(trace.completed_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Trace Events Section */}
      <section className="eval-page__section">
        <div className="eval-page__section-header">
          <h2>Trace Events</h2>
          <span className="eval-page__count">{trace.events.length} events</span>
        </div>
        <div className="eval-page__content">
          {trace.events.length === 0 ? (
            <div className="eval-page__empty">
              <p>No trace events recorded.</p>
            </div>
          ) : (
            <div className="eval-page__events">
              {trace.events.map((event) => (
                <div key={event.id} className="eval-page__event">
                  <div
                    className="eval-page__event-header"
                    onClick={() => toggleEventExpand(event.id)}
                  >
                    {expandedEvents.has(event.id) ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    {getEventTypeBadge(event.type)}
                    <span className="eval-page__event-time">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    {event.data.latency_ms && (
                      <span className="eval-page__event-latency">{event.data.latency_ms}ms</span>
                    )}
                    {event.data.model && (
                      <span className="eval-page__event-model">{event.data.model}</span>
                    )}
                    {event.data.tool_name && (
                      <span className="eval-page__event-tool">{event.data.tool_name}</span>
                    )}
                  </div>
                  {expandedEvents.has(event.id) && (
                    <div className="eval-page__event-body">
                      {event.data.input != null && (
                        <div className="eval-page__event-data">
                          <strong>Input:</strong>
                          <pre>{JSON.stringify(event.data.input, null, 2)}</pre>
                        </div>
                      )}
                      {event.data.output != null && (
                        <div className="eval-page__event-data">
                          <strong>Output:</strong>
                          <pre>{JSON.stringify(event.data.output, null, 2)}</pre>
                        </div>
                      )}
                      {event.data.error && (
                        <div className="eval-page__event-data eval-page__event-data--error">
                          <strong>Error:</strong>
                          <pre>{String(event.data.error)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Evaluation Section */}
      <section className="eval-page__section">
        <div className="eval-page__section-header">
          <h2>Evaluation</h2>
          <div className="eval-page__actions">
            <button
              className="eval-page__btn eval-page__btn--primary"
              onClick={handleRunEval}
              disabled={evaluating}
            >
              {evaluating ? (
                <><Loader2 size={14} className="eval-page__icon--spin" /> Running...</>
              ) : (
                <><Play size={14} /> Run Eval</>
              )}
            </button>
            {evalResult && (
              <button
                className="eval-page__btn eval-page__btn--secondary"
                onClick={handleCreateCommit}
                disabled={committing}
              >
                {committing ? (
                  <><Loader2 size={14} className="eval-page__icon--spin" /> Creating...</>
                ) : (
                  <><GitCommit size={14} /> Create Commit</>
                )}
              </button>
            )}
            <button className="eval-page__btn eval-page__btn--secondary" onClick={() => window.location.reload()}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="eval-page__content">
          {evalResult ? (
            <>
              {/* Summary */}
              <div className={`eval-page__summary ${evalResult.passed ? 'eval-page__summary--passed' : 'eval-page__summary--failed'}`}>
                {evalResult.passed ? <CheckCircle size={20} /> : <XCircle size={20} />}
                <span>{evalResult.passed ? 'All Tests Passed' : 'Tests Failed'}</span>
                <span className="eval-page__summary-counts">
                  {evalResult.passed_steps}/{evalResult.total_steps} passed
                </span>
              </div>

              {/* Test Results Table */}
              <table className="eval-page__table">
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {evalResult.results.map((result) => (
                    <tr key={result.step_id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {getResultIcon(result)}
                          {result.step_name}
                        </div>
                      </td>
                      <td>
                        <span className={`eval-page__badge eval-page__badge--${result.severity}`}>
                          {result.severity}
                        </span>
                      </td>
                      <td>
                        {result.passed ? (
                          <span className="eval-page__badge eval-page__badge--success">passed</span>
                        ) : (
                          <span className="eval-page__badge eval-page__badge--error">failed</span>
                        )}
                      </td>
                      <td>{result.message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Suggestions */}
              {evalResult.suggestions && evalResult.suggestions.length > 0 && (
                <div className="eval-page__suggestions">
                  <h3><Lightbulb size={16} /> Suggestions</h3>
                  {evalResult.suggestions.map((suggestion, i) => (
                    <div key={i} className="eval-page__suggestion">
                      <div className="eval-page__suggestion-header">
                        <span className="eval-page__badge">{suggestion.type.replace('_', ' ')}</span>
                        <span>{Math.round(suggestion.confidence * 100)}% confidence</span>
                      </div>
                      <p>{suggestion.description}</p>
                      {suggestion.diff && <pre>{suggestion.diff}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="eval-page__empty">
              <FlaskConical size={32} style={{ color: '#9ca3af' }} />
              <p>No evaluation yet. Click "Run Eval" to evaluate this trace.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
