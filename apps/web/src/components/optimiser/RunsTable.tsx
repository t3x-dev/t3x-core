'use client';

import { Check, Clock, Eye, Loader2, Play, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EngineRun } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useOptimiserStore } from '@/store/optimiserStore';

interface RunsTableProps {
  runs: EngineRun[];
  maxRows?: number;
  compareModeEnabled?: boolean;
}

/**
 * Extract evaluation metrics from EngineRun result
 */
function getRunMetrics(run: EngineRun): {
  passed: boolean | null;
  score: number | null;
  latencyMs: number | null;
  totalTokens: number | null;
} {
  const result = run.result as Record<string, unknown> | null;
  if (!result) {
    return { passed: null, score: null, latencyMs: null, totalTokens: null };
  }

  // Try to get eval_result from run_report or directly
  const runReport = result.run_report as Record<string, unknown> | undefined;
  const evalResult = (runReport?.eval_result || result.eval_result) as
    | Record<string, unknown>
    | undefined;

  const passed = (evalResult?.passed as boolean | undefined) ?? null;
  const score = (evalResult?.score as number | undefined) ?? null;

  // Try to get trace summary data
  const traceSummary = result.trace_summary as Record<string, unknown> | undefined;
  const latencyMs = (traceSummary?.latency_ms as number | undefined) ?? null;
  const tokens = traceSummary?.tokens as Record<string, unknown> | undefined;
  const totalTokens = (tokens?.total_tokens as number | undefined) ?? null;

  return { passed, score, latencyMs, totalTokens };
}

/**
 * Format latency for display
 */
function formatLatency(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format score as percentage
 */
function formatScore(score: number | null): string {
  if (score === null) return '-';
  return `${Math.round(score * 100)}%`;
}

/**
 * Format token count
 */
function formatTokens(tokens: number | null): string {
  if (tokens === null) return '-';
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

/**
 * Get status badge with appropriate styling
 */
function getStatusBadge(status: EngineRun['status'], passed: boolean | null) {
  // If completed, show pass/fail based on eval result
  if (status === 'completed' && passed !== null) {
    return passed ? (
      <Badge
        variant="outline"
        className="gap-1 border-green-500/30 bg-green-500/10 text-[var(--status-success)]"
      >
        <Check className="h-3 w-3" />
        passed
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="gap-1 border-red-500/30 bg-red-500/10 text-[var(--status-error)]"
      >
        <X className="h-3 w-3" />
        failed
      </Badge>
    );
  }

  // Otherwise show status with icon
  const variants: Record<string, { className: string; icon: React.ReactNode }> = {
    queued: {
      className: 'border-gray-500/30 bg-gray-500/10 text-[var(--color-text-secondary)]',
      icon: <Clock className="h-3 w-3" />,
    },
    running: {
      className: 'border-blue-500/30 bg-blue-500/10 text-[var(--status-info)]',
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    completed: {
      className: 'border-green-500/30 bg-green-500/10 text-[var(--status-success)]',
      icon: <Check className="h-3 w-3" />,
    },
    failed: {
      className: 'border-red-500/30 bg-red-500/10 text-[var(--status-error)]',
      icon: <X className="h-3 w-3" />,
    },
    timeout: {
      className: 'border-yellow-500/30 bg-yellow-500/10 text-[var(--status-warning)]',
      icon: <Clock className="h-3 w-3" />,
    },
  };

  const v = variants[status];
  return (
    <Badge variant="outline" className={cn('gap-1', v?.className || '')}>
      {v?.icon}
      {status}
    </Badge>
  );
}

export function RunsTable({ runs, maxRows = 15, compareModeEnabled = false }: RunsTableProps) {
  const router = useRouter();
  const { selectedRunIds, toggleRunSelection } = useOptimiserStore();

  if (runs.length === 0) {
    return (
      <EmptyState icon={Play} title="No runs yet" description="Run an agent to see results here." />
    );
  }

  const displayRuns = runs.slice(0, maxRows);

  const handleRowClick = (run: EngineRun) => {
    if (compareModeEnabled) {
      toggleRunSelection(run.run_id);
    } else {
      router.push(`/deploy/eval/${run.run_id}`);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {compareModeEnabled && <TableHead className="w-12"></TableHead>}
          <TableHead>Report</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Prompt</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Latency</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {displayRuns.map((run) => {
          const metrics = getRunMetrics(run);
          const isSelected = selectedRunIds.has(run.run_id);

          return (
            <TableRow
              key={run.run_id}
              className={cn(
                'cursor-pointer hover:bg-muted/50',
                isSelected && 'bg-primary/5 hover:bg-primary/10'
              )}
              onClick={() => handleRowClick(run)}
            >
              {compareModeEnabled && (
                <TableCell className="w-12">
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded border',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRunSelection(run.run_id);
                    }}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                </TableCell>
              )}
              <TableCell>
                {run.title ? (
                  <span className="text-sm font-medium">{run.title}</span>
                ) : (
                  <code className="text-xs text-muted-foreground">{run.run_id}</code>
                )}
              </TableCell>
              <TableCell>
                {run.tags && run.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {run.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        {tag}
                      </Badge>
                    ))}
                    {run.tags.length > 3 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        +{run.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>{run.leaf?.id || '-'}</TableCell>
              <TableCell className="text-muted-foreground">{run.metadata?.model || '-'}</TableCell>
              <TableCell className="text-muted-foreground">
                {run.metadata?.prompt_version || '-'}
              </TableCell>
              <TableCell>{getStatusBadge(run.status, metrics.passed)}</TableCell>
              <TableCell className="text-right font-mono">
                {metrics.score !== null ? (
                  <span
                    className={
                      metrics.passed ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
                    }
                  >
                    {formatScore(metrics.score)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {formatTokens(metrics.totalTokens)}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {formatLatency(metrics.latencyMs)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(run.created_at).toLocaleString()}
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/deploy/eval/${run.run_id}`);
                  }}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Detail
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
