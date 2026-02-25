'use client';

/**
 * MergeReviewDialog — Pre-merge confirmation with 5-point checklist.
 *
 * Shows merge summary, validation checks, and merge message before committing.
 * On success, displays inline feedback with navigation options.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, Circle, GitMerge, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import type { MergeSummary } from '@/lib/mergeSummary';
import { useMicrocopy } from '@/lib/microcopy';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { MergeCheck } from '@/store/mergeWorkspaceStore';

interface MergeReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  checks: MergeCheck[];
  message: string;
  sourceBranch: string;
  targetBranch: string;
  sentenceCount: number;
  /** Merge summary stats (from computeMergeSummary) */
  summary: MergeSummary | null;
  /** Whether server-side checks are still loading */
  serverChecksLoading?: boolean;
  /** Navigate back to canvas */
  onBackToCanvas: () => void;
}

export function MergeReviewDialog({
  open,
  onClose,
  onConfirm,
  checks,
  message,
  sourceBranch,
  targetBranch,
  sentenceCount,
  summary,
  serverChecksLoading,
  onBackToCanvas,
}: MergeReviewDialogProps) {
  const { t } = useTerminology();
  const mc = useMicrocopy();
  const prefersReducedMotion = useReducedMotion();
  const [state, setState] = useState<'review' | 'committing' | 'success' | 'error'>('review');
  const [errorMsg, setErrorMsg] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState('review');
      setErrorMsg('');
    }
  }, [open]);

  // Auto-close after success (5s)
  useEffect(() => {
    if (state !== 'success') return;
    const timer = setTimeout(() => {
      onBackToCanvas();
    }, 5000);
    return () => clearTimeout(timer);
  }, [state, onBackToCanvas]);

  const allChecksPassed = checks.every((c) => c.passed);

  const handleConfirm = useCallback(async () => {
    setState('committing');
    try {
      await onConfirm();
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Merge failed');
    }
  }, [onConfirm]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'w-full max-w-md rounded-2xl p-6',
          glass.cardBase,
          glass.highlight,
          'shadow-xl'
        )}
      >
        <AnimatePresence mode="wait">
          {state === 'success' ? (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 py-4"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-commit)]/15">
                <Check className="h-7 w-7 text-[var(--accent-commit)]" />
              </div>
              <p className="text-lg font-semibold text-[var(--text-primary)]">
                {t('merge')} complete — {sentenceCount} sentences unified
              </p>
              <div className="flex gap-3 mt-2">
                <Button variant="outline" onClick={onBackToCanvas}>
                  {mc('backToCanvas')}
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  {mc('stayHere')}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">Auto-closing in 5s...</p>
            </motion.div>
          ) : (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <GitMerge className="h-5 w-5 text-[var(--text-secondary)]" />
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    {t('mergeReview')}
                  </h2>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Branch Info */}
              <div className="flex items-center gap-2 mb-4 text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">{sourceBranch}</span>
                <span>into</span>
                <span className="font-medium text-[var(--text-primary)]">{targetBranch}</span>
              </div>

              {/* Merge Message Display */}
              {message && (
                <div className="mb-4 rounded-lg bg-[var(--hover-bg)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  {message}
                </div>
              )}

              {/* Merge Summary */}
              {summary && (
                <div className="mb-4 grid grid-cols-4 gap-3 rounded-lg bg-[var(--hover-bg)] px-3 py-3">
                  <div className="text-center">
                    <div className="text-lg font-semibold text-[var(--text-secondary)]">
                      {summary.kept_identical}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      {t('identical_sentences')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-[var(--accent-commit)]">
                      {summary.resolved_conflicts}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">{t('resolved')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-[var(--diff-removed-accent)]">
                      {summary.discarded}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">
                      {t('removed_sentences')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-[var(--text-primary)]">
                      {summary.total_sentences}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)]">Total</div>
                  </div>
                </div>
              )}

              {/* Checklist */}
              <div className="space-y-2 mb-6">
                {checks.map((check) => (
                  <div key={check.id} className="flex items-start gap-2.5">
                    {check.passed ? (
                      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-[var(--diff-added-accent)]" />
                    ) : (
                      <Circle className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          'text-sm',
                          check.passed
                            ? 'text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)]'
                        )}
                      >
                        {check.label}
                      </span>
                      {check.detail && (
                        <span className="ml-2 text-xs text-[var(--text-tertiary)]">
                          ({check.detail})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {serverChecksLoading && (
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-[var(--text-tertiary)]" />
                    <span className="text-sm text-[var(--text-secondary)]">
                      Loading server checks...
                    </span>
                  </div>
                )}
              </div>

              {/* Error */}
              {state === 'error' && (
                <div className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={onClose} disabled={state === 'committing'}>
                  {t('mergeReviewCancel')}
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!allChecksPassed || state === 'committing'}
                  className="gap-1.5"
                >
                  {state === 'committing' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Merging...
                    </>
                  ) : (
                    <>
                      <GitMerge className="h-3.5 w-3.5" />
                      {t('mergeConfirm')}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
