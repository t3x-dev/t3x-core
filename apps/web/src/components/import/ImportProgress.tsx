'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ImportProgressProps {
  status: 'idle' | 'loading' | 'streaming' | 'success' | 'error';
  message?: string;
  turnsImported?: number;
  /** SSE progress: current / total */
  current?: number;
  total?: number;
}

export function ImportProgress({
  status,
  message,
  turnsImported,
  current,
  total,
}: ImportProgressProps) {
  if (status === 'idle') return null;

  const isStreaming = status === 'streaming' && total != null && total > 0;
  const percent = isStreaming && current != null ? Math.round((current / total!) * 100) : 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3 text-sm',
        (status === 'loading' || status === 'streaming') && 'border-primary/30 bg-primary/5',
        status === 'success' && 'border-[var(--status-success)]/30 bg-[var(--status-success)]/5',
        status === 'error' && 'border-destructive/30 bg-destructive/5'
      )}
    >
      <div className="flex items-center gap-2">
        {(status === 'loading' || status === 'streaming') && (
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        )}
        {status === 'success' && (
          <CheckCircle2 className="h-4 w-4 text-[var(--status-success)] shrink-0" />
        )}
        {status === 'error' && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
        <div className="flex-1 min-w-0">
          {message && <p className="truncate">{message}</p>}
          {status === 'success' && turnsImported !== undefined && (
            <p className="text-xs text-muted-foreground">
              {turnsImported} turn{turnsImported !== 1 ? 's' : ''} imported
            </p>
          )}
        </div>
        {isStreaming && (
          <span className="text-xs text-muted-foreground shrink-0">
            {current}/{total}
          </span>
        )}
      </div>

      {/* Progress bar for streaming imports */}
      {isStreaming && (
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
