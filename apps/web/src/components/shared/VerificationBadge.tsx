'use client';

import { AlertTriangle, CheckCircle, Loader2, Shield, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type VerifyResult, verifyProjectHashChain } from '@/lib/api';

type VerificationState = 'idle' | 'loading' | 'verified' | 'failed';

interface VerificationBadgeProps {
  projectId: string;
}

export function VerificationBadge({ projectId }: VerificationBadgeProps) {
  const [state, setState] = useState<VerificationState>('idle');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleVerify = useCallback(async () => {
    setState('loading');
    try {
      const r = await verifyProjectHashChain(projectId);
      setResult(r);
      setState(r.valid ? 'verified' : 'failed');
    } catch {
      setState('failed');
      setResult(null);
    }
  }, [projectId]);

  if (state === 'idle') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleVerify}>
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Verify
          </Button>
        </TooltipTrigger>
        <TooltipContent>Verify hash chain integrity</TooltipContent>
      </Tooltip>
    );
  }

  if (state === 'loading') {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Verifying...
      </Badge>
    );
  }

  const icon =
    state === 'verified' ? (
      <CheckCircle className="h-3.5 w-3.5 text-green-600" />
    ) : (
      <XCircle className="h-3.5 w-3.5 text-red-600" />
    );

  const badgeClass =
    state === 'verified'
      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800';

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className="inline-flex items-center"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <Badge variant="outline" className={`gap-1 text-xs cursor-pointer ${badgeClass}`}>
          {icon}
          {state === 'verified' ? 'Verified' : 'Failed'}
        </Badge>
      </button>

      {expanded && (
        <div className="rounded-md border bg-card p-3 text-xs space-y-2 w-64">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Commits verified:</span>
                <span className="font-mono">{result.total}</span>
                <span>Chain depth:</span>
                <span className="font-mono">{result.verified_depth}</span>
                <span>Entry points:</span>
                <span className="font-mono">{result.entry_points}</span>
                <span>Verified at:</span>
                <span className="font-mono">
                  {new Date(result.verified_at).toLocaleTimeString()}
                </span>
              </div>

              {!result.valid && (
                <div className="space-y-1 pt-1 border-t">
                  {result.errors.hash_mismatch.length > 0 && (
                    <div className="flex items-start gap-1 text-red-600">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{result.errors.hash_mismatch.length} hash mismatch(es)</span>
                    </div>
                  )}
                  {result.errors.parent_not_found.length > 0 && (
                    <div className="flex items-start gap-1 text-red-600">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{result.errors.parent_not_found.length} missing parent(s)</span>
                    </div>
                  )}
                  {result.errors.other.length > 0 && (
                    <div className="flex items-start gap-1 text-red-600">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{result.errors.other.length} other error(s)</span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Verification failed. Check network connection.</p>
          )}

          <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={handleVerify}>
            Verify Again
          </Button>
        </div>
      )}
    </div>
  );
}
