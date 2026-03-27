'use client';

import { AlertTriangle, Check, Crosshair, Info, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GateIssue } from '@/lib/api/trees';
import { cn } from '@/lib/utils';

interface GateIssueCardProps {
  issue: GateIssue;
  onLocate?: (treeId: string) => void;
  onApply?: (treeId: string, suggestion: string) => void;
}

export function GateIssueCard({ issue, onLocate, onApply }: GateIssueCardProps) {
  const [applied, setApplied] = useState(false);

  // Reset applied state when issue changes (e.g., after re-check)
  useEffect(() => {
    setApplied(false);
  }, [issue.description, issue.tree_id, issue.dimension]);

  const Icon =
    issue.severity === 'error' ? XCircle : issue.severity === 'warning' ? AlertTriangle : Info;

  const iconColor =
    issue.severity === 'error'
      ? 'text-red-500'
      : issue.severity === 'warning'
        ? 'text-amber-500'
        : 'text-blue-500';

  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm space-y-2',
        issue.severity === 'error' &&
          'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20',
        issue.severity === 'warning' &&
          'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20',
        issue.severity === 'info' &&
          'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20'
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', iconColor)} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{issue.dimension}</span>
            {issue.tree_id && (
              <>
                <span>·</span>
                <span className="font-mono">{issue.tree_id}</span>
              </>
            )}
          </div>
          <p className="mt-0.5">{issue.description}</p>
          {issue.suggestion && (
            <p className="mt-1 text-xs text-muted-foreground">Suggest: {issue.suggestion}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {issue.tree_id && onLocate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onLocate(issue.tree_id!)}
          >
            <Crosshair className="h-3 w-3 mr-1" />
            Locate
          </Button>
        )}
        {issue.tree_id && issue.suggestion && onApply && !applied && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onApply(issue.tree_id!, issue.suggestion!);
              setApplied(true);
            }}
          >
            <Check className="h-3 w-3 mr-1" />
            Apply fix
          </Button>
        )}
        {applied && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3 w-3" /> Applied
          </span>
        )}
      </div>
    </div>
  );
}
