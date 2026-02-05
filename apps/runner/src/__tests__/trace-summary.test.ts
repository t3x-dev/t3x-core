import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../schemas/run-record.js';
import { buildTraceSummary } from '../trace/trace-summary.js';

function makeRecord(steps: RunRecord['steps'] = []): RunRecord {
  return {
    run_id: 'run_test',
    status: 'completed',
    inputs: {},
    steps,
    timing: { started_at: new Date().toISOString() },
  };
}

describe('buildTraceSummary', () => {
  it('handles empty steps', () => {
    const summary = buildTraceSummary(makeRecord([]));
    expect(summary.trajectory.total_steps).toBe(0);
    expect(summary.trajectory.llm_calls).toBe(0);
    expect(summary.trajectory.tool_calls).toBe(0);
    expect(summary.trajectory.retrieval_calls).toBe(0);
    expect(summary.trajectory.failed_steps).toBe(0);
    expect(summary.tokens.total_tokens).toBe(0);
    expect(summary.latency_ms).toBe(0);
  });

  it('counts llm-only steps', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'LLM',
        type: 'llm_call',
        span_kind: 'llm' as const,
        input: '',
        output: '',
        latency_ms: 100,
        status: 'ok' as const,
        llm: { model: 'gpt-4', tokens: { prompt: 50, completion: 30, total: 80 } },
      },
      {
        step_id: 's2',
        step_index: 1,
        name: 'LLM 2',
        type: 'llm_call',
        span_kind: 'llm' as const,
        input: '',
        output: '',
        latency_ms: 200,
        status: 'ok' as const,
        llm: { model: 'gpt-4', tokens: { prompt: 100, completion: 60, total: 160 } },
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.trajectory.total_steps).toBe(2);
    expect(summary.trajectory.llm_calls).toBe(2);
    expect(summary.trajectory.tool_calls).toBe(0);
    expect(summary.tokens.prompt_tokens).toBe(150);
    expect(summary.tokens.completion_tokens).toBe(90);
    expect(summary.tokens.total_tokens).toBe(240);
    expect(summary.latency_ms).toBe(300);
  });

  it('counts tool-only steps', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'Search',
        type: 'tool_call',
        span_kind: 'tool' as const,
        input: '',
        output: '',
        latency_ms: 50,
        status: 'ok' as const,
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.trajectory.tool_calls).toBe(1);
    expect(summary.trajectory.llm_calls).toBe(0);
  });

  it('counts retriever steps', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'RAG',
        type: 'retrieval',
        span_kind: 'retriever' as const,
        input: '',
        output: '',
        latency_ms: 30,
        status: 'ok' as const,
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.trajectory.retrieval_calls).toBe(1);
  });

  it('counts mixed step types', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'LLM',
        type: 'llm_call',
        span_kind: 'llm' as const,
        input: '',
        output: '',
        latency_ms: 100,
        status: 'ok' as const,
        llm: { model: 'gpt-4', tokens: { prompt: 50, completion: 30, total: 80 } },
      },
      {
        step_id: 's2',
        step_index: 1,
        name: 'Tool',
        type: 'tool_call',
        span_kind: 'tool' as const,
        input: '',
        output: '',
        latency_ms: 50,
        status: 'ok' as const,
      },
      {
        step_id: 's3',
        step_index: 2,
        name: 'RAG',
        type: 'retrieval',
        span_kind: 'retriever' as const,
        input: '',
        output: '',
        latency_ms: 30,
        status: 'ok' as const,
      },
      {
        step_id: 's4',
        step_index: 3,
        name: 'Chain',
        type: 'chain',
        span_kind: 'chain' as const,
        input: '',
        output: '',
        latency_ms: 10,
        status: 'ok' as const,
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.trajectory.total_steps).toBe(4);
    expect(summary.trajectory.llm_calls).toBe(1);
    expect(summary.trajectory.tool_calls).toBe(1);
    expect(summary.trajectory.retrieval_calls).toBe(1);
    expect(summary.latency_ms).toBe(190);
  });

  it('counts failed steps', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'OK',
        type: 'llm_call',
        span_kind: 'llm' as const,
        input: '',
        output: '',
        latency_ms: 100,
        status: 'ok' as const,
      },
      {
        step_id: 's2',
        step_index: 1,
        name: 'Bad',
        type: 'tool_call',
        span_kind: 'tool' as const,
        input: '',
        output: '',
        latency_ms: 50,
        status: 'error' as const,
        error: 'timeout',
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.trajectory.failed_steps).toBe(1);
  });

  it('aggregates tokens from llm steps', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'LLM1',
        type: 'llm_call',
        span_kind: 'llm' as const,
        input: '',
        output: '',
        latency_ms: 0,
        status: 'ok' as const,
        llm: { model: 'm', tokens: { prompt: 10, completion: 5, total: 15 } },
      },
      {
        step_id: 's2',
        step_index: 1,
        name: 'LLM2',
        type: 'llm_call',
        span_kind: 'llm' as const,
        input: '',
        output: '',
        latency_ms: 0,
        status: 'ok' as const,
        llm: { model: 'm', tokens: { prompt: 20, completion: 10, total: 30 } },
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.tokens.prompt_tokens).toBe(30);
    expect(summary.tokens.completion_tokens).toBe(15);
    expect(summary.tokens.total_tokens).toBe(45);
  });

  it('sums latency_ms across all steps', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'A',
        type: 'a',
        input: '',
        output: '',
        latency_ms: 100,
        status: 'ok' as const,
      },
      {
        step_id: 's2',
        step_index: 1,
        name: 'B',
        type: 'b',
        input: '',
        output: '',
        latency_ms: 250,
        status: 'ok' as const,
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.latency_ms).toBe(350);
  });

  it('handles missing optional fields gracefully', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'Step',
        type: 'chain',
        input: '',
        output: '',
        latency_ms: 0,
        status: 'ok' as const,
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    // No span_kind means it falls through to default (chain, no counter incremented)
    expect(summary.trajectory.total_steps).toBe(1);
    expect(summary.trajectory.llm_calls).toBe(0);
    expect(summary.tokens.total_tokens).toBe(0);
  });

  it('handles steps with llm but missing tokens fields', () => {
    const steps = [
      {
        step_id: 's1',
        step_index: 0,
        name: 'LLM',
        type: 'llm_call',
        span_kind: 'llm' as const,
        input: '',
        output: '',
        latency_ms: 0,
        status: 'ok' as const,
        llm: { model: 'gpt-4', tokens: { prompt: 0, completion: 0, total: 0 } },
      },
    ];
    const summary = buildTraceSummary(makeRecord(steps));
    expect(summary.tokens.total_tokens).toBe(0);
  });
});
