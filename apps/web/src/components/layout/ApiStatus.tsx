/**
 * API connection status indicator
 */

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { useHealth } from '@/hooks/shared/useApi';

export function ApiStatus() {
  const { data, loading, error } = useHealth();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Connecting to Core API...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>Core API offline</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Start with: uvicorn core_api.app:app --port 8000
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Badge
        variant="outline"
        className="gap-1.5 border-[var(--status-success)]/30 bg-[var(--status-success)]/10 text-[var(--status-success)]"
      >
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
      {data && <span className="text-xs text-muted-foreground">v{data.version}</span>}
    </div>
  );
}

export function LoadingSpinner({
  message = 'Loading...',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center justify-center gap-3 p-8 text-muted-foreground', className)}
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function ErrorMessage({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">Something went wrong</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
