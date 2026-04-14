/**
 * Run Report Export Utilities
 *
 * Client-side export of run reports as Markdown or JSON.
 * Uses trace_summary (lightweight) instead of full_trace.
 */

import type { EngineRun } from '@/infrastructure';

interface EvalResult {
  passed?: boolean;
  score?: number;
  dimension_scores?: Record<string, number>;
  violations?: Array<{ message: string }>;
}

interface TraceSummary {
  trajectory?: {
    total_steps: number;
    llm_calls: number;
    tool_calls: number;
    failed_steps: number;
  };
  tokens?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency_ms?: number;
}

interface LLMAssertion {
  type: string;
  message: string;
  category?: string;
}

/**
 * Format a run as Markdown report
 */
export function formatRunAsMarkdown(run: EngineRun): string {
  const result = run.result as Record<string, unknown> | null;
  const evalResult = (result?.run_report as Record<string, unknown>)?.eval_result as
    | EvalResult
    | undefined;
  const traceSummary = result?.trace_summary as TraceSummary | undefined;
  const assertions = result?.assertions as LLMAssertion[] | undefined;
  const passed = evalResult?.passed ?? run.status === 'completed';

  const lines: string[] = [];

  // Title
  lines.push(`# ${run.title || 'Run Report'}`);
  lines.push('');

  // Status & Score
  lines.push(`**Status**: ${passed ? 'Passed' : 'Failed'}`);
  if (evalResult?.score !== undefined) {
    lines.push(`**Score**: ${(evalResult.score * 100).toFixed(1)}%`);
  }
  lines.push(`**Created**: ${run.created_at}`);
  if (run.metadata?.model) {
    lines.push(`**Model**: ${run.metadata.model}`);
  }
  if (run.metadata?.prompt_version) {
    lines.push(`**Prompt Version**: ${run.metadata.prompt_version}`);
  }
  lines.push('');

  // Description
  if (run.description) {
    lines.push('## Description');
    lines.push(run.description);
    lines.push('');
  }

  // Tags
  if (run.tags.length > 0) {
    lines.push('## Tags');
    lines.push(run.tags.map((t) => `\`${t}\``).join(', '));
    lines.push('');
  }

  // Dimension Scores
  if (evalResult?.dimension_scores) {
    lines.push('## Dimension Scores');
    lines.push('| Dimension | Score |');
    lines.push('|-----------|-------|');
    for (const [dim, score] of Object.entries(evalResult.dimension_scores)) {
      lines.push(`| ${dim} | ${(score * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }

  // Assertions
  if (assertions && assertions.length > 0) {
    lines.push('## Assertions');
    for (const a of assertions) {
      const icon = a.type === 'pass' ? '  ' : '  ';
      lines.push(`- ${icon} ${a.message}`);
    }
    lines.push('');
  }

  // Trace Summary
  if (traceSummary) {
    lines.push('## Trace Summary');
    if (traceSummary.trajectory) {
      lines.push(`- Steps: ${traceSummary.trajectory.total_steps}`);
      lines.push(`- LLM Calls: ${traceSummary.trajectory.llm_calls}`);
      lines.push(`- Tool Calls: ${traceSummary.trajectory.tool_calls}`);
      lines.push(`- Failed Steps: ${traceSummary.trajectory.failed_steps}`);
    }
    if (traceSummary.tokens) {
      lines.push(`- Total Tokens: ${traceSummary.tokens.total_tokens.toLocaleString()}`);
    }
    if (traceSummary.latency_ms) {
      const latency =
        traceSummary.latency_ms < 1000
          ? `${Math.round(traceSummary.latency_ms)}ms`
          : `${(traceSummary.latency_ms / 1000).toFixed(1)}s`;
      lines.push(`- Latency: ${latency}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*Exported from T3X*');

  return lines.join('\n');
}

/**
 * Format a run as JSON report (excludes full_trace for size)
 */
export function formatRunAsJSON(run: EngineRun): string {
  const result = run.result as Record<string, unknown> | null;

  const exportData = {
    run_id: run.run_id,
    title: run.title,
    description: run.description,
    tags: run.tags,
    status: run.status,
    metadata: run.metadata,
    result: result
      ? {
          run_report: result.run_report,
          assertions: result.assertions,
          eval_metrics: result.eval_metrics,
          trace_summary: result.trace_summary,
          // Explicitly exclude full_trace (can be very large)
        }
      : null,
    created_at: run.created_at,
    updated_at: run.updated_at,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Download content as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate a safe filename from run title/id
 */
function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
}

/**
 * Export run as Markdown file
 */
export function exportRunAsMarkdown(run: EngineRun): void {
  const content = formatRunAsMarkdown(run);
  const name = safeFilename(run.title || run.run_id);
  downloadFile(content, `${name}_report.md`, 'text/markdown');
}

/**
 * Export run as JSON file
 */
export function exportRunAsJSON(run: EngineRun): void {
  const content = formatRunAsJSON(run);
  const name = safeFilename(run.title || run.run_id);
  downloadFile(content, `${name}_report.json`, 'application/json');
}
