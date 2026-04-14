'use client';

import {
  ChevronDown,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useVerifyProjectHashChain } from '@/hooks/useVerifyProjectHashChain';
import { formatTimeAgo } from '@/domain/format/timeUtils';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/settingsStore';
import type { QuickVerifyResult, VerifyResult } from '@/types/api';

type VerificationState = 'idle' | 'loading' | 'verified' | 'failed';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedResult(projectId: string): QuickVerifyResult | null {
  try {
    const raw = sessionStorage.getItem(`verify:${projectId}`);
    if (!raw) return null;
    const { result, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(`verify:${projectId}`);
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

function setCachedResult(projectId: string, result: QuickVerifyResult): void {
  try {
    sessionStorage.setItem(
      `verify:${projectId}`,
      JSON.stringify({ result, timestamp: Date.now() })
    );
  } catch {
    // sessionStorage full or unavailable
  }
}

interface VerificationBadgeProps {
  projectId: string;
}

export function VerificationBadge({ projectId }: VerificationBadgeProps) {
  const [state, setState] = useState<VerificationState>('idle');
  const [quickResult, setQuickResult] = useState<QuickVerifyResult | null>(null);
  const [fullResult, setFullResult] = useState<VerifyResult | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const developerMode = useSettingsStore((s) => s.developerMode);
  const { verify } = useVerifyProjectHashChain();

  // Auto quick-verify on mount (with cache)
  useEffect(() => {
    const cached = getCachedResult(projectId);
    if (cached) {
      setQuickResult(cached);
      setState(cached.valid ? 'verified' : 'failed');
      return;
    }

    let cancelled = false;
    verify(projectId)
      .then((r) => {
        if (cancelled) return;
        const quick: QuickVerifyResult = {
          valid: r.valid,
          checked: r.verified_depth,
          mismatches: r.merkle_mismatches ?? [],
          missing_roots: [],
          verified_at: r.verified_at,
        };
        setQuickResult(quick);
        setCachedResult(projectId, quick);
        setState(r.valid ? 'verified' : 'failed');
      })
      .catch(() => {
        if (!cancelled) setState('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, verify]);

  const handleFullVerify = useCallback(async () => {
    setState('loading');
    sessionStorage.removeItem(`verify:${projectId}`);
    try {
      const r = await verify(projectId);
      setFullResult(r);
      setState(r.valid ? 'verified' : 'failed');
    } catch {
      setState('failed');
      setFullResult(null);
    }
  }, [projectId, verify]);

  const handleQuickVerify = useCallback(async () => {
    setState('loading');
    try {
      const r = await verify(projectId);
      const quick: QuickVerifyResult = {
        valid: r.valid,
        checked: r.verified_depth,
        mismatches: r.merkle_mismatches ?? [],
        missing_roots: [],
        verified_at: r.verified_at,
      };
      setQuickResult(quick);
      setCachedResult(projectId, quick);
      setState(r.valid ? 'verified' : 'failed');
    } catch {
      setState('failed');
    }
  }, [projectId, verify]);

  const badgeConfig = useMemo(
    () => ({
      idle: {
        icon: Shield,
        label: 'Unverified',
        className: 'bg-muted text-muted-foreground border-border',
      },
      loading: {
        icon: Loader2,
        label: developerMode ? 'Verifying...' : 'Checking...',
        className: 'bg-muted text-muted-foreground border-border',
      },
      verified: {
        icon: ShieldCheck,
        label: 'Verified',
        className:
          'bg-[var(--status-success-muted)] text-[var(--status-success)] border-[var(--status-success)]/30',
      },
      failed: {
        icon: ShieldAlert,
        label: developerMode ? 'Failed' : 'Issues Found',
        className:
          'bg-[var(--status-error-muted)] text-[var(--status-error)] border-[var(--status-error)]/30',
      },
    }),
    [developerMode]
  );

  const config = badgeConfig[state];
  const IconComponent = config.icon;
  const isLoading = state === 'loading';
  const activeResult = fullResult ?? quickResult;
  const verifiedAt = fullResult?.verified_at ?? quickResult?.verified_at;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          className={cn('gap-1 text-xs cursor-pointer', config.className)}
          role="button"
          tabIndex={0}
        >
          <IconComponent className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          {config.label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        {/* Title */}
        <div className="flex items-center gap-2 mb-3">
          <IconComponent
            className={cn(
              'h-5 w-5',
              state === 'verified' && 'text-[var(--status-success)]',
              state === 'failed' && 'text-[var(--status-error)]',
              state === 'idle' && 'text-muted-foreground',
              isLoading && 'animate-spin text-muted-foreground'
            )}
          />
          <div>
            <p className="text-sm font-medium">
              {developerMode ? 'Hash Chain Integrity' : 'Data Integrity'}
            </p>
            {verifiedAt && (
              <p className="text-xs text-muted-foreground">
                {developerMode
                  ? `Verified at: ${verifiedAt}`
                  : `Last checked: ${formatTimeAgo(verifiedAt)}`}
              </p>
            )}
          </div>
        </div>

        {/* State-specific content */}
        {state === 'idle' && (
          <div className="text-sm text-muted-foreground mb-3">
            <p>Integrity has not been verified yet.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full h-7 text-xs"
              onClick={handleQuickVerify}
            >
              <Shield className="h-3 w-3 mr-1" />
              Verify Now
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Verifying hash chain...</span>
          </div>
        )}

        {state === 'verified' && activeResult && (
          <>
            <div className="rounded-md bg-[var(--status-success-muted)] border border-[var(--status-success)]/30 p-2.5 text-xs mb-3">
              {developerMode ? (
                <div className="grid grid-cols-2 gap-1 font-mono text-muted-foreground">
                  {'total' in activeResult && (
                    <>
                      <span>Total commits:</span>
                      <span>{(activeResult as VerifyResult).total}</span>
                      <span>Verified depth:</span>
                      <span>{(activeResult as VerifyResult).verified_depth}</span>
                      <span>Entry points:</span>
                      <span>{(activeResult as VerifyResult).entry_points}</span>
                    </>
                  )}
                  {'checked' in activeResult && (
                    <>
                      <span>Checked:</span>
                      <span>{(activeResult as QuickVerifyResult).checked}</span>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[var(--status-success)]">
                  {'total' in activeResult
                    ? `All ${(activeResult as VerifyResult).total} snapshots verified — data is intact.`
                    : `${(activeResult as QuickVerifyResult).checked} recent snapshots verified — data is intact.`}
                </p>
              )}
            </div>

            {!developerMode && (
              <p className="text-xs text-muted-foreground mb-3">
                Your conversation records and extracted knowledge are complete and untampered. T3X
                uses cryptographic hashing to ensure every record traces back to its original
                source.
              </p>
            )}
          </>
        )}

        {state === 'failed' && (
          <>
            {fullResult && !fullResult.valid && (
              <div className="rounded-md bg-[var(--status-error-muted)] border border-[var(--status-error)]/30 p-2.5 text-xs mb-3 space-y-1">
                {fullResult.errors.hash_mismatch.length > 0 && (
                  <div className="flex items-start gap-1.5 text-[var(--status-error)]">
                    <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      {developerMode
                        ? `${fullResult.errors.hash_mismatch.length} hash mismatch(es): ${fullResult.errors.hash_mismatch
                            .slice(0, 2)
                            .map((h) => h.slice(0, 12))
                            .join(', ')}${fullResult.errors.hash_mismatch.length > 2 ? '...' : ''}`
                        : `${fullResult.errors.hash_mismatch.length} snapshot(s) may have been modified`}
                    </span>
                  </div>
                )}
                {fullResult.errors.parent_not_found.length > 0 && (
                  <div className="flex items-start gap-1.5 text-[var(--status-error)]">
                    <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      {developerMode
                        ? `${fullResult.errors.parent_not_found.length} missing parent(s)`
                        : `${fullResult.errors.parent_not_found.length} history chain break(s)`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!fullResult && quickResult && !quickResult.valid && (
              <div className="rounded-md bg-[var(--status-error-muted)] border border-[var(--status-error)]/30 p-2.5 text-xs mb-3">
                <p className="text-[var(--status-error)]">
                  {developerMode
                    ? `${quickResult.mismatches.length} Merkle mismatch(es), ${quickResult.missing_roots.length} missing root(s)`
                    : 'Integrity issues detected. Run a full verification for details.'}
                </p>
              </div>
            )}

            {!fullResult && !quickResult && (
              <div className="rounded-md bg-[var(--status-error-muted)] border border-[var(--status-error)]/30 p-2.5 text-xs mb-3">
                <p className="text-[var(--status-error)]">
                  Verification failed. Try again or run a full verification.
                </p>
              </div>
            )}

            {!developerMode && (
              <p className="text-xs text-muted-foreground mb-3">
                This may be caused by a database migration or manual data modification. Contact your
                administrator for assistance.
              </p>
            )}
          </>
        )}

        {/* Actions */}
        {!isLoading && state !== 'idle' && (
          <div className="flex gap-2">
            {developerMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleFullVerify}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Full Verify
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleQuickVerify}
                >
                  Quick Verify
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleFullVerify}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Re-verify
              </Button>
            )}
          </div>
        )}

        {/* Tech details toggle (developer mode) */}
        {developerMode && fullResult && (
          <div className="mt-3 border-t pt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowTechDetails(!showTechDetails)}
            >
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', showTechDetails && 'rotate-180')}
              />
              Technical Details
            </button>
            {showTechDetails && (
              <div className="mt-2 space-y-2 text-xs font-mono text-muted-foreground">
                {fullResult.truncated && <p className="text-[var(--status-warning)]">Truncated (100K limit)</p>}
                {fullResult.merkle_mismatches && fullResult.merkle_mismatches.length > 0 && (
                  <div>
                    <p className="font-sans font-medium text-foreground">
                      Merkle Mismatches ({fullResult.merkle_mismatches.length}):
                    </p>
                    {fullResult.merkle_mismatches.slice(0, 5).map((h) => (
                      <p key={h} className="truncate">
                        {h}
                      </p>
                    ))}
                  </div>
                )}
                {quickResult?.missing_roots && quickResult.missing_roots.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="font-sans">
                      Missing Merkle Roots: {quickResult.missing_roots.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={async () => {
                        try {
                          await handleQuickVerify();
                        } catch {
                          // silently ignore — user can retry
                        }
                      }}
                    >
                      Backfill
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
