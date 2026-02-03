'use client';

import {
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  GitBranch,
  Workflow,
  Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SpanCard } from './SpanCard';

// Span kind type matching runner schema
export type SpanKind = 'chain' | 'llm' | 'tool' | 'retriever' | 'workflow';

// Step record type matching runner schema
export interface StepRecord {
  step_id: string;
  step_index: number;
  name: string;
  type: string;
  parent_step_id?: string;
  span_kind?: SpanKind;
  input?: unknown;
  output?: unknown;
  latency_ms: number;
  tokens?: {
    in: number;
    out: number;
  };
  llm?: {
    model: string;
    provider?: string;
    messages?: Array<{ role: string; content: string }>;
    tokens: { prompt: number; completion: number; total: number };
    temperature?: number;
    max_tokens?: number;
  };
  tool?: {
    tool_name: string;
    tool_input: unknown;
    tool_output: unknown;
    was_expected?: boolean;
  };
  retrieval?: {
    query: string;
    documents: Array<{ content: string; score?: number; metadata?: Record<string, unknown> }>;
    top_k?: number;
  };
  status: 'ok' | 'error';
  error?: string;
}

interface TraceTimelineProps {
  steps: StepRecord[];
  className?: string;
}

// Get icon for span kind
function getSpanIcon(spanKind: SpanKind | undefined) {
  switch (spanKind) {
    case 'llm':
      return Cpu;
    case 'tool':
      return Wrench;
    case 'retriever':
      return Database;
    case 'workflow':
      return Workflow;
    default:
      return GitBranch;
  }
}

// Get color for span kind
function getSpanColor(spanKind: SpanKind | undefined): string {
  switch (spanKind) {
    case 'llm':
      return 'bg-purple-500';
    case 'tool':
      return 'bg-blue-500';
    case 'retriever':
      return 'bg-green-500';
    case 'workflow':
      return 'bg-orange-500';
    default:
      return 'bg-gray-500';
  }
}

// Get badge color for span kind
function getSpanBadgeClass(spanKind: SpanKind | undefined): string {
  switch (spanKind) {
    case 'llm':
      return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
    case 'tool':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    case 'retriever':
      return 'bg-green-500/10 text-green-600 border-green-500/30';
    case 'workflow':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
    default:
      return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
  }
}

// Format duration
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function TraceTimeline({ steps, className }: TraceTimelineProps) {
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());
  const [expandAll, setExpandAll] = useState(false);

  // Calculate total duration for progress bar scaling
  const totalDuration = useMemo(() => {
    return steps.reduce((sum, step) => sum + step.latency_ms, 0);
  }, [steps]);

  // Toggle single span
  const toggleSpan = (stepId: string) => {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // Toggle all spans
  const toggleAll = () => {
    if (expandAll) {
      setExpandedSpans(new Set());
    } else {
      setExpandedSpans(new Set(steps.map((s) => s.step_id)));
    }
    setExpandAll(!expandAll);
  };

  if (steps.length === 0) {
    return (
      <div
        className={cn(
          'flex h-48 items-center justify-center text-sm text-muted-foreground',
          className
        )}
      >
        No trace data available
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Total:{' '}
          <span className="font-mono font-medium text-foreground">
            {formatDuration(totalDuration)}
          </span>
          <span className="mx-2">•</span>
          <span className="font-medium text-foreground">{steps.length}</span> steps
        </div>
        <Button variant="ghost" size="sm" onClick={toggleAll} className="h-7 text-xs">
          {expandAll ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {steps.map((step, _index) => {
          const Icon = getSpanIcon(step.span_kind);
          const barColor = getSpanColor(step.span_kind);
          const badgeClass = getSpanBadgeClass(step.span_kind);
          const isExpanded = expandedSpans.has(step.step_id);
          const widthPercent = totalDuration > 0 ? (step.latency_ms / totalDuration) * 100 : 0;

          return (
            <div key={step.step_id} className="group">
              {/* Span Row */}
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer',
                  'hover:bg-muted/50',
                  step.status === 'error' && 'border-red-500/30 bg-red-500/5',
                  isExpanded && 'bg-muted/30'
                )}
                onClick={() => toggleSpan(step.step_id)}
              >
                {/* Expand/Collapse Icon */}
                <div className="shrink-0 text-muted-foreground">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>

                {/* Span Kind Icon */}
                <div className={cn('rounded-md border p-1.5', badgeClass)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>

                {/* Step Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{step.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded border bg-muted/50 text-muted-foreground">
                      {step.span_kind || 'chain'}
                    </span>
                    {step.status === 'error' && (
                      <span className="text-xs px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-600">
                        error
                      </span>
                    )}
                  </div>

                  {/* Duration Bar */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn('h-full rounded-full transition-all', barColor)}
                        style={{ width: `${Math.max(widthPercent, 2)}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground w-16 text-right">
                      {formatDuration(step.latency_ms)}
                    </span>
                  </div>
                </div>

                {/* Tokens (if LLM) */}
                {step.llm?.tokens && (
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-muted-foreground">tokens</div>
                    <div className="font-mono text-sm">
                      {step.llm.tokens.total.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="ml-8 mt-1 mb-2">
                  <SpanCard step={step} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Re-export types
export type { StepRecord as TraceStep };
