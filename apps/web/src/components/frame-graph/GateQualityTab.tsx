'use client';

import type { SemanticContent } from '@t3x/core';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GateCheckResult } from '@/lib/api/frames';
import { gateCheck } from '@/lib/api/frames';
import { cn } from '@/lib/utils';
import { GateCheckProgress } from './GateCheckProgress';
import { GateDimensionBar } from './GateDimensionBar';
import { GateIssueCard } from './GateIssueCard';

interface GateQualityTabProps {
  conversationId: string;
  snapshot: SemanticContent | null;
  onLocateFrame?: (frameId: string) => void;
  onSwitchToFrames?: () => void;
  onGateResult?: (result: GateCheckResult) => void;
}

export function GateQualityTab({
  conversationId,
  snapshot,
  onLocateFrame,
  onSwitchToFrames,
  onGateResult,
}: GateQualityTabProps) {
  const [result, setResult] = useState<GateCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState<Date | null>(null);

  const runCheck = useCallback(async () => {
    if (!snapshot) return;
    setLoading(true);
    setError(null);
    try {
      const res = await gateCheck(snapshot, { conversation_id: conversationId });
      setResult(res);
      setLastCheckAt(new Date());
      onGateResult?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gate check failed');
    } finally {
      setLoading(false);
    }
  }, [snapshot, conversationId, onGateResult]);

  // Empty state: no snapshot
  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <ShieldCheck className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No quality check yet</p>
        <p className="text-xs text-center mt-1">
          Quality checks verify that extracted frames accurately reflect the conversation.
        </p>
      </div>
    );
  }

  // Empty state: has snapshot but never checked
  if (!result && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <ShieldCheck className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">No quality check yet</p>
        <p className="text-xs text-center mt-1 mb-4">
          Quality checks verify that extracted frames accurately reflect the conversation.
        </p>
        <Button onClick={runCheck} size="sm">
          Run Quality Check
        </Button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Checking quality...</span>
        </div>
        <GateCheckProgress
          gates={[
            { name: 'Structure', status: result ? 'passed' : 'checking' },
            { name: 'Semantic', status: 'pending' },
            { name: 'Business', status: 'pending' },
          ]}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm">
        <p className="text-red-500 mb-2">{error}</p>
        <Button variant="outline" size="sm" onClick={runCheck}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  if (!result) return null;

  // Result state
  const semanticScore = result.semantic?.score;
  const issues = result.semantic?.issues ?? [];
  const businessIssues = result.business?.results?.filter((r) => !r.passed) ?? [];
  const totalIssues = issues.length + businessIssues.length;
  let lowestDim: [string, { score: number; details: string }] | undefined;
  if (result.semantic?.dimensions) {
    for (const [k, v] of Object.entries(result.semantic.dimensions)) {
      if (!lowestDim || v.score < lowestDim[1].score) {
        lowestDim = [k, v];
      }
    }
  }

  const summaryColor = !semanticScore
    ? 'bg-muted'
    : semanticScore >= 0.9
      ? 'bg-emerald-50 dark:bg-emerald-950/20'
      : semanticScore >= 0.7
        ? 'bg-amber-50 dark:bg-amber-950/20'
        : 'bg-red-50 dark:bg-red-950/20';

  const handleLocate = (frameId: string) => {
    onLocateFrame?.(frameId);
    onSwitchToFrames?.();
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Summary bar */}
      {semanticScore != null && (
        <div className={cn('px-3 py-2 border-b flex items-center gap-2', summaryColor)}>
          <span className="text-sm font-medium">Quality: {semanticScore.toFixed(2)}</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full',
                semanticScore >= 0.9
                  ? 'bg-emerald-500'
                  : semanticScore >= 0.7
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              )}
              style={{ width: `${Math.round(semanticScore * 100)}%` }}
            />
          </div>
          {totalIssues > 0 && (
            <span className="text-xs text-muted-foreground">
              {totalIssues === 1 ? '1 issue' : `${totalIssues} issues`}
            </span>
          )}
        </div>
      )}

      <div className="p-3 space-y-4 flex-1">
        {/* Structure gate */}
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Structure
          </h4>
          <div
            className={cn(
              'rounded-md border p-2 text-sm',
              result.structure.passed
                ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                : 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
            )}
          >
            {Object.entries(result.structure.checks).map(([key, passed]) => (
              <span key={key} className="inline-flex items-center gap-1 mr-3 text-xs">
                {passed ? '\u2705' : '\u274C'} {key.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>

        {/* Semantic gate */}
        {result.semantic && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Semantic — {result.semantic.score.toFixed(2)}
            </h4>
            <div className="space-y-1.5">
              {Object.entries(result.semantic.dimensions).map(([dim, val]) => (
                <GateDimensionBar
                  key={dim}
                  name={dim}
                  score={val.score}
                  isLowest={lowestDim?.[0] === dim}
                />
              ))}
            </div>
          </div>
        )}

        {/* Business gate */}
        {result.business && (
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Business — {result.business.passed ? 'passed' : `${businessIssues.length} issues`}
            </h4>
            {result.business.results.map((r) => (
              <div key={r.rule_id} className="flex items-center gap-2 text-xs">
                {r.passed ? '\u2705' : r.severity === 'error' ? '\u274C' : '\u26A0\uFE0F'}
                <span className="font-mono">{r.rule_id}</span>
                {r.message && !r.passed && (
                  <span className="text-muted-foreground">— {r.message}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Issues */}
        {issues.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Issues ({issues.length})
            </h4>
            {issues.map((issue, i) => (
              <GateIssueCard
                key={`${issue.dimension}-${issue.frame_id ?? i}`}
                issue={issue}
                onLocate={handleLocate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={runCheck}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Re-check
        </Button>
        {lastCheckAt && <span>checked {formatRelativeTime(lastCheckAt)}</span>}
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
