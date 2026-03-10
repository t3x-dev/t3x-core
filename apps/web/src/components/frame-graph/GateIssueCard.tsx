'use client';

import { AlertTriangle, Check, Crosshair, Info, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GateIssue {
  severity: 'error' | 'warning' | 'info';
  frame_id?: string;
  dimension: string;
  description: string;
  suggestion?: string;
}

interface GateIssueCardProps {
  issue: GateIssue;
  onLocate?: (frameId: string) => void;
  onApply?: (frameId: string, suggestion: string) => void;
}

export function GateIssueCard({ issue, onLocate, onApply }: GateIssueCardProps) {
  const [applied, setApplied] = useState(false);

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
            {issue.frame_id && (
              <>
                <span>·</span>
                <span className="font-mono">{issue.frame_id}</span>
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
        {issue.frame_id && onLocate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onLocate(issue.frame_id!)}
          >
            <Crosshair className="h-3 w-3 mr-1" />
            Locate
          </Button>
        )}
        {issue.frame_id && issue.suggestion && onApply && !applied && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onApply(issue.frame_id!, issue.suggestion!);
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
