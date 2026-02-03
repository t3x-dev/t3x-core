import { randomUUID } from 'crypto';
import type { AgentConfig, AgentInput } from './schemas/agent.js';
import type { RunRecord, StepRecord } from './schemas/run-record.js';

/**
 * Observer - Captures agent I/O in grey-box mode (SDK proxy)
 *
 * This module intercepts and records:
 * - Agent input/output
 * - LLM calls (prompt/response)
 * - Tool invocations
 * - Errors and timing
 *
 * v2.0: Now outputs RunRecord format (unified with n8n flow)
 */

export class Observer {
  private runs: Map<string, RunRecord> = new Map();
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
   * Start a new run
   */
  startRun(_agentId: string, input: AgentInput): string {
    const runId = `run_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const record: RunRecord = {
      run_id: runId,
      status: 'running',
      inputs:
        typeof input.input === 'object' && input.input !== null
          ? (input.input as Record<string, unknown>)
          : { input: input.input },
      steps: [],
      timing: {
        started_at: now,
      },
      source: {
        system: 'custom', // SDK proxy mode
      },
    };

    this.runs.set(runId, record);
    return runId;
  }

  /**
   * Record an LLM call step
   */
  recordLLMCall(
    runId: string,
    input: unknown,
    output: unknown,
    model?: string,
    latencyMs?: number,
    tokens?: { prompt: number; completion: number }
  ): void {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    const stepIndex = record.steps.length;
    const step: StepRecord = {
      step_id: `step_${randomUUID().slice(0, 8)}`,
      step_index: stepIndex,
      name: model ? `LLM Call (${model})` : 'LLM Call',
      type: 'llm_call',
      span_kind: 'llm',
      input,
      output,
      latency_ms: latencyMs ?? 0,
      status: 'ok',
      llm: {
        model: model ?? 'unknown',
        tokens: {
          prompt: tokens?.prompt ?? 0,
          completion: tokens?.completion ?? 0,
          total: (tokens?.prompt ?? 0) + (tokens?.completion ?? 0),
        },
      },
    };

    record.steps.push(step);
  }

  /**
   * Record a tool call step
   */
  recordToolCall(
    runId: string,
    toolName: string,
    input: unknown,
    output: unknown,
    latencyMs?: number
  ): void {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    const stepIndex = record.steps.length;
    const step: StepRecord = {
      step_id: `step_${randomUUID().slice(0, 8)}`,
      step_index: stepIndex,
      name: toolName,
      type: 'tool_call',
      span_kind: 'tool',
      input,
      output,
      latency_ms: latencyMs ?? 0,
      status: 'ok',
      tool: {
        tool_name: toolName,
        tool_input: input,
        tool_output: output,
      },
    };

    record.steps.push(step);
  }

  /**
   * Record an error
   */
  recordError(runId: string, error: string, stepId?: string): void {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    // If stepId provided, mark that step as error
    if (stepId) {
      const step = record.steps.find((s) => s.step_id === stepId);
      if (step) {
        step.status = 'error';
        step.error = error;
      }
    }

    // Also set run-level error
    record.error = {
      code: 'RUNTIME_ERROR',
      message: error,
      step_id: stepId,
    };
  }

  /**
   * Complete a run
   */
  completeRun(
    runId: string,
    output: unknown,
    status: 'completed' | 'failed' | 'timeout' = 'completed'
  ): RunRecord {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    const now = new Date().toISOString();
    record.timing.ended_at = now;
    record.status = status === 'timeout' ? 'failed' : status;
    record.output = output;

    // Calculate total latency
    const startTime = new Date(record.timing.started_at).getTime();
    const endTime = new Date(now).getTime();
    record.timing.total_ms = endTime - startTime;

    // If timeout, set error
    if (status === 'timeout') {
      record.error = {
        code: 'TIMEOUT',
        message: 'Run timed out',
      };
    }

    return record;
  }

  /**
   * Get a run record
   */
  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  /**
   * List all runs (optionally filtered by source system)
   */
  listRuns(system?: 'n8n' | 'langchain' | 'custom'): RunRecord[] {
    const runs = Array.from(this.runs.values());
    if (system) {
      return runs.filter((r) => r.source?.system === system);
    }
    return runs;
  }

  /**
   * Clear old runs (for memory management)
   */
  clearOldRuns(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [runId, record] of this.runs) {
      const runTime = new Date(record.timing.started_at).getTime();
      if (runTime < cutoff) {
        this.runs.delete(runId);
        cleared++;
      }
    }

    return cleared;
  }

  // ============================================
  // Legacy compatibility aliases
  // ============================================

  /**
   * @deprecated Use getRun() instead
   */
  getTrace(runId: string): RunRecord | undefined {
    return this.getRun(runId);
  }

  /**
   * @deprecated Use listRuns() instead
   */
  listTraces(_agentId?: string): RunRecord[] {
    // Note: agentId filtering is no longer supported in RunRecord
    // (agent_id was removed from the schema)
    return this.listRuns();
  }

  /**
   * @deprecated Use clearOldRuns() instead
   */
  clearOldTraces(maxAgeMs?: number): number {
    return this.clearOldRuns(maxAgeMs);
  }
}

// Singleton instance
export const observer = new Observer();
