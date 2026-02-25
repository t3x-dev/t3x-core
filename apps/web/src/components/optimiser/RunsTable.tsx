'use client';

import { Check, Eye, Play } from 'lucide-react';
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
import type { DeployAgent, EngineRun } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useOptimiserStore } from '@/store/optimiserStore';

interface RunsTableProps {
  runs: EngineRun[];
  agents?: DeployAgent[];
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
  if (tokens === null || tokens === 0) return '-';
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
        className="border-green-500/30 bg-green-500/10 text-[var(--status-success)]"
      >
        passed
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="border-red-500/30 bg-red-500/10 text-[var(--status-error)]"
      >
        failed
      </Badge>
    );
  }

  // Otherwise show status
  const variants: Record<string, string> = {
    queued: 'border-gray-500/30 bg-gray-500/10 text-[var(--color-text-secondary)]',
    running: 'border-blue-500/30 bg-blue-500/10 text-[var(--status-info)]',
    completed: 'border-green-500/30 bg-green-500/10 text-[var(--status-success)]',
    failed: 'border-red-500/30 bg-red-500/10 text-[var(--status-error)]',
    timeout: 'border-yellow-500/30 bg-yellow-500/10 text-[var(--status-warning)]',
  };

  return (
    <Badge variant="outline" className={variants[status] || ''}>
      {status}
    </Badge>
  );
}

export function RunsTable({
  runs,
  agents,
  maxRows = 15,
  compareModeEnabled = false,
}: RunsTableProps) {
  const router = useRouter();
  const { selectedRunIds, toggleRunSelection } = useOptimiserStore();

  /** Match agent name by webhook_id from the run's workflow */
  const getAgentName = (run: EngineRun): string => {
    const webhookId = run.workflow?.webhook_id;
    if (!webhookId || !agents?.length) return webhookId || '-';
    const matched = agents.find((a) => a.endpoint === webhookId);
    return matched?.name || webhookId;
  };

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
          <TableHead>Run ID</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Leaf</TableHead>
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
                <code className="text-xs">{run.run_id}</code>
              </TableCell>
              <TableCell>{getAgentName(run)}</TableCell>
              <TableCell className="text-muted-foreground">{run.metadata?.model || '-'}</TableCell>
              <TableCell className="text-muted-foreground">
                {run.leaf?.title || run.leaf?.id || '-'}
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
