import { randomUUID } from 'crypto';
import type { RunTrace, TraceEvent, AgentConfig, AgentInput } from './types.js';

/**
 * Observer - Captures agent I/O in grey-box mode
 *
 * This module intercepts and records:
 * - Agent input/output
 * - LLM calls (prompt/response)
 * - Tool invocations
 * - Errors and timing
 */

export class Observer {
  private traces: Map<string, RunTrace> = new Map();
  private agents: Map<string, AgentConfig> = new Map();

  /**
   * Register an agent for observation
   */
  registerAgent(config: AgentConfig): void {
    this.agents.set(config.id, config);
  }

  /**
   * Get registered agent config
   */
  getAgent(agentId: string): AgentConfig | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Start a new run trace
   */
  startRun(agentId: string, input: AgentInput): string {
    const runId = `run_${randomUUID().slice(0, 8)}`;
    const trace: RunTrace = {
      run_id: runId,
      agent_id: agentId,
      started_at: new Date().toISOString(),
      status: 'running',
      input: input.input,
      events: [],
      metrics: {
        llm_calls: 0,
        tool_calls: 0,
      },
    };
    this.traces.set(runId, trace);

    // Record agent input event
    this.addEvent(runId, {
      id: `evt_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      type: 'agent_input',
      data: { input: input.input },
    });

    return runId;
  }

  /**
   * Add an event to a run trace
   */
  addEvent(runId: string, event: TraceEvent): void {
    const trace = this.traces.get(runId);
    if (!trace) {
      throw new Error(`Run not found: ${runId}`);
    }

    trace.events.push(event);

    // Update metrics
    if (trace.metrics) {
      if (event.type === 'llm_call') {
        trace.metrics.llm_calls++;
        if (event.data.latency_ms) {
          trace.metrics.total_latency_ms =
            (trace.metrics.total_latency_ms || 0) + event.data.latency_ms;
        }
      } else if (event.type === 'tool_call') {
        trace.metrics.tool_calls++;
      }
    }
  }

  /**
   * Record an LLM call
   */
  recordLLMCall(
    runId: string,
    input: unknown,
    output: unknown,
    model?: string,
    latencyMs?: number
  ): void {
    this.addEvent(runId, {
      id: `evt_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      type: 'llm_call',
      data: {
        input,
        output,
        model,
        latency_ms: latencyMs,
      },
    });
  }

  /**
   * Record a tool call
   */
  recordToolCall(
    runId: string,
    toolName: string,
    input: unknown,
    output: unknown,
    latencyMs?: number
  ): void {
    this.addEvent(runId, {
      id: `evt_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      type: 'tool_call',
      data: {
        tool_name: toolName,
        input,
        output,
        latency_ms: latencyMs,
      },
    });
  }

  /**
   * Record an error
   */
  recordError(runId: string, error: string): void {
    this.addEvent(runId, {
      id: `evt_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      type: 'error',
      data: { error },
    });
  }

  /**
   * Complete a run
   */
  completeRun(
    runId: string,
    output: unknown,
    status: 'completed' | 'failed' | 'timeout' = 'completed'
  ): RunTrace {
    const trace = this.traces.get(runId);
    if (!trace) {
      throw new Error(`Run not found: ${runId}`);
    }

    trace.completed_at = new Date().toISOString();
    trace.status = status;
    trace.output = output;

    // Record agent output event
    this.addEvent(runId, {
      id: `evt_${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      type: 'agent_output',
      data: { output },
    });

    // Calculate total latency
    if (trace.metrics) {
      const start = new Date(trace.started_at).getTime();
      const end = new Date(trace.completed_at).getTime();
      trace.metrics.total_latency_ms = end - start;
    }

    return trace;
  }

  /**
   * Get a run trace
   */
  getTrace(runId: string): RunTrace | undefined {
    return this.traces.get(runId);
  }

  /**
   * List all traces (optionally filtered by agent)
   */
  listTraces(agentId?: string): RunTrace[] {
    const traces = Array.from(this.traces.values());
    if (agentId) {
      return traces.filter(t => t.agent_id === agentId);
    }
    return traces;
  }

  /**
   * Clear old traces (for memory management)
   */
  clearOldTraces(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [runId, trace] of this.traces) {
      const traceTime = new Date(trace.started_at).getTime();
      if (traceTime < cutoff) {
        this.traces.delete(runId);
        cleared++;
      }
    }

    return cleared;
  }
}

// Singleton instance
export const observer = new Observer();
