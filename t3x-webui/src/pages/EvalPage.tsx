import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import {
  getRunTrace,
  runEval,
  createCommitFromEval,
  type RunTrace,
  type TestStep,
  type TestResult,
  type EvalResponse,
} from '../services/api'

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
]

export default function EvalPage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [trace, setTrace] = useState<RunTrace | null>(null)
  const [evalResult, setEvalResult] = useState<EvalResponse | null>(null)
  const [testSteps] = useState<TestStep[]>(DEFAULT_TEST_STEPS)
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())

  // Load run trace
  useEffect(() => {
    async function loadTrace() {
      if (!runId) return

      try {
        const traceData = await getRunTrace(runId)
        setTrace(traceData)
      } catch (err) {
        console.error('Failed to load trace:', err)
      } finally {
        setLoading(false)
      }
    }

    loadTrace()
  }, [runId])

  const handleRunEval = async () => {
    if (!runId) return

    setEvaluating(true)
    try {
      const result = await runEval(runId, testSteps, { generate_suggestions: true })
      setEvalResult(result)
    } catch (err) {
      console.error('Failed to run eval:', err)
    } finally {
      setEvaluating(false)
    }
  }

  const handleCreateCommit = async () => {
    if (!runId || !evalResult) return

    setCommitting(true)
    try {
      const result = await createCommitFromEval(
        runId,
        evalResult,
        `Eval run: ${runId} - ${evalResult.passed ? 'passed' : 'failed'}`
      )
      // Navigate to canvas with the new commit
      navigate(`/project/${result.commit.project_id}`)
    } catch (err) {
      console.error('Failed to create commit:', err)
    } finally {
      setCommitting(false)
    }
  }

  const toggleEventExpand = (eventId: string) => {
    const newExpanded = new Set(expandedEvents)
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId)
    } else {
      newExpanded.add(eventId)
    }
    setExpandedEvents(newExpanded)
  }

  const getResultIcon = (result: TestResult) => {
    if (result.passed) {
      return <CheckCircle size={16} className="text-green-500" />
    }
    switch (result.severity) {
      case 'error':
        return <XCircle size={16} className="text-red-500" />
      case 'warning':
        return <AlertTriangle size={16} className="text-yellow-500" />
      default:
        return <AlertTriangle size={16} className="text-gray-500" />
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'llm_call':
        return <span className="event-icon event-icon--llm">LLM</span>
      case 'tool_call':
        return <span className="event-icon event-icon--tool">Tool</span>
      case 'agent_input':
        return <span className="event-icon event-icon--input">IN</span>
      case 'agent_output':
        return <span className="event-icon event-icon--output">OUT</span>
      case 'error':
        return <span className="event-icon event-icon--error">ERR</span>
      default:
        return <span className="event-icon">{type}</span>
    }
  }

  if (loading) {
    return (
      <div className="eval-page">
        <div className="eval-page__loading">
          <Loader2 size={32} className="animate-spin" />
          <span>Loading trace...</span>
        </div>
      </div>
    )
  }

  if (!trace) {
    return (
      <div className="eval-page">
        <div className="eval-page__error">
          <XCircle size={32} />
          <h2>Run not found</h2>
          <p>The run ID "{runId}" could not be found.</p>
          <button className="btn btn--secondary" onClick={() => navigate('/deploy')}>
            <ArrowLeft size={16} /> Back to Deploy
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="eval-page">
      <header className="eval-page__header">
        <div className="eval-page__breadcrumb">
          <button className="btn btn--link" onClick={() => navigate('/deploy')}>
            <ArrowLeft size={16} /> Deploy
          </button>
          <span>/</span>
          <span>Eval</span>
        </div>
        <div className="eval-page__title">
          <FlaskConical size={24} />
          <h1>Eval: {runId}</h1>
        </div>
        <div className="eval-page__actions">
          <button
            className="btn btn--primary"
            onClick={handleRunEval}
            disabled={evaluating}
          >
            {evaluating ? (
              <><Loader2 size={16} className="animate-spin" /> Evaluating...</>
            ) : (
              <><Play size={16} /> Run Eval</>
            )}
          </button>
          {evalResult && (
            <button
              className="btn btn--secondary"
              onClick={handleCreateCommit}
              disabled={committing}
            >
              {committing ? (
                <><Loader2 size={16} className="animate-spin" /> Creating...</>
              ) : (
                <><GitCommit size={16} /> Create Commit</>
              )}
            </button>
          )}
        </div>
      </header>

      <div className="eval-page__content">
        {/* Left: Eval Results */}
        <div className="eval-page__results">
          {evalResult ? (
            <>
              <div className={`eval-summary ${evalResult.passed ? 'eval-summary--passed' : 'eval-summary--failed'}`}>
                <div className="eval-summary__icon">
                  {evalResult.passed ? (
                    <CheckCircle size={32} />
                  ) : (
                    <XCircle size={32} />
                  )}
                </div>
                <div className="eval-summary__stats">
                  <h2>{evalResult.passed ? 'All Tests Passed' : 'Tests Failed'}</h2>
                  <div className="eval-summary__counts">
                    <span className="count count--passed">{evalResult.passed_steps} passed</span>
                    <span className="count count--failed">{evalResult.failed_steps} failed</span>
                    <span className="count count--total">{evalResult.total_steps} total</span>
                  </div>
                </div>
              </div>

              <section className="eval-section">
                <h3>Test Results</h3>
                <div className="test-results">
                  {evalResult.results.map((result) => (
                    <div
                      key={result.step_id}
                      className={`test-result ${result.passed ? 'test-result--passed' : 'test-result--failed'}`}
                    >
                      <div className="test-result__header">
                        {getResultIcon(result)}
                        <span className="test-result__name">{result.step_name}</span>
                        <span className={`test-result__severity test-result__severity--${result.severity}`}>
                          {result.severity}
                        </span>
                      </div>
                      {!result.passed && (
                        <div className="test-result__details">
                          {result.message && <p className="test-result__message">{result.message}</p>}
                          {result.expected != null && (
                            <div className="test-result__expected">
                              <strong>Expected:</strong> {String(result.expected)}
                            </div>
                          )}
                          {result.actual != null && (
                            <div className="test-result__actual">
                              <strong>Actual:</strong> {String(result.actual)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {evalResult.suggestions && evalResult.suggestions.length > 0 && (
                <section className="eval-section">
                  <h3>
                    <Lightbulb size={18} /> Suggestions
                  </h3>
                  <div className="suggestions">
                    {evalResult.suggestions.map((suggestion, i) => (
                      <div key={i} className="suggestion">
                        <div className="suggestion__header">
                          <span className={`suggestion__type suggestion__type--${suggestion.type}`}>
                            {suggestion.type.replace('_', ' ')}
                          </span>
                          <span className="suggestion__confidence">
                            {Math.round(suggestion.confidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="suggestion__description">{suggestion.description}</p>
                        {suggestion.diff && (
                          <pre className="suggestion__diff">{suggestion.diff}</pre>
                        )}
                        <button className="btn btn--sm btn--primary">Apply</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="eval-page__empty">
              <FlaskConical size={48} />
              <h3>No Evaluation Yet</h3>
              <p>Click "Run Eval" to evaluate this trace against test steps.</p>
            </div>
          )}
        </div>

        {/* Right: Trace Timeline */}
        <div className="eval-page__trace">
          <div className="trace-header">
            <h3>Trace Timeline</h3>
            <div className="trace-meta">
              <span><Clock size={14} /> {trace.metrics?.total_latency_ms || 0}ms</span>
              <span>LLM: {trace.metrics?.llm_calls || 0}</span>
              <span>Tools: {trace.metrics?.tool_calls || 0}</span>
            </div>
          </div>

          <div className="trace-timeline">
            {trace.events.map((event, index) => (
              <div key={event.id} className="trace-event">
                <div className="trace-event__line">
                  <div className="trace-event__dot" />
                  {index < trace.events.length - 1 && <div className="trace-event__connector" />}
                </div>
                <div className="trace-event__content">
                  <div
                    className="trace-event__header"
                    onClick={() => toggleEventExpand(event.id)}
                  >
                    {expandedEvents.has(event.id) ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    {getEventIcon(event.type)}
                    <span className="trace-event__type">{event.type.replace('_', ' ')}</span>
                    {event.data.latency_ms && (
                      <span className="trace-event__latency">{event.data.latency_ms}ms</span>
                    )}
                    {event.data.model && (
                      <span className="trace-event__model">{event.data.model}</span>
                    )}
                    {event.data.tool_name && (
                      <span className="trace-event__tool">{event.data.tool_name}</span>
                    )}
                  </div>
                  {expandedEvents.has(event.id) && (
                    <div className="trace-event__body">
                      {event.data.input != null && (
                        <div className="trace-event__data">
                          <strong>Input:</strong>
                          <pre>{JSON.stringify(event.data.input, null, 2)}</pre>
                        </div>
                      )}
                      {event.data.output != null && (
                        <div className="trace-event__data">
                          <strong>Output:</strong>
                          <pre>{JSON.stringify(event.data.output, null, 2)}</pre>
                        </div>
                      )}
                      {event.data.error && (
                        <div className="trace-event__data trace-event__data--error">
                          <strong>Error:</strong>
                          <pre>{event.data.error}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
