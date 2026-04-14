'use client';

/**
 * MergeReviewDialog — Pre-merge confirmation with 5-point checklist.
 *
 * Shows merge summary, validation checks, and merge message before committing.
 * On success, displays inline feedback with navigation options.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Circle, ClipboardCopy, GitMerge, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCountUp } from '@/hooks/useCountUp';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import { copyToClipboard } from '@/infrastructure/export/core';
import {
  formatReleaseNoteAsMarkdown,
  generateMergeReleaseNote,
  type MergeReleaseNote,
} from '@/lib/mergeReleaseNote';
import type { MergeSummary } from '@/lib/mergeSummary';
import { useMicrocopy } from '@/lib/microcopy';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';
import type { MergeCheck } from '@/store/mergeWorkspaceStore';

interface MergeReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  checks: MergeCheck[];
  message: string;
  sourceBranch: string;
  targetBranch: string;
  nodeCount: number;
  /** Merge summary stats (from computeMergeSummary) */
  summary: MergeSummary | null;
  /** Whether server-side checks are still loading */
  serverChecksLoading?: boolean;
  /** Navigate back to canvas */
  onBackToCanvas: () => void;
  /** MergeResult for release note generation */
  prepared?: import('@t3x-dev/core').MergeResult | null;
  /** Extended resolutions for release note generation */
  extendedResolutions?: Record<
    string,
    import('@/store/mergeWorkspaceStore').ExtendedResolutionData
  >;
}

export function MergeReviewDialog({
  open,
  onClose,
  onConfirm,
  checks,
  message,
  sourceBranch,
  targetBranch,
  nodeCount,
  summary,
  serverChecksLoading,
  onBackToCanvas,
  prepared,
  extendedResolutions,
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

  const animatedCount = useCountUp(nodeCount, 400, state === 'success');

  // Generate release note on success
  const releaseNote = useMemo<MergeReleaseNote | null>(() => {
    if (state !== 'success' || !prepared || !summary) return null;
    return generateMergeReleaseNote(
      prepared,
      summary,
      sourceBranch,
      targetBranch,
      undefined,
      undefined,
      undefined,
      extendedResolutions
    );
  }, [state, prepared, summary, sourceBranch, targetBranch, extendedResolutions]);

  // Save release note to the merge commit node in canvas store
  useEffect(() => {
    if (!releaseNote) return;
    // Find the latest merge commit node and update its merge_summary with release_note
    const { nodes, updateNode } = useCanvasStore.getState();
    const mergeNode = nodes.find((n) => n.data.isMergeCommit && n.data.commit?.merge_summary);
    if (mergeNode?.data.commit?.merge_summary) {
      updateNode(mergeNode.id, {
        commit: {
          ...mergeNode.data.commit,
          merge_summary: {
            ...mergeNode.data.commit.merge_summary,
            release_note: {
              title: releaseNote.title,
              timestamp: releaseNote.timestamp,
              source_branch: releaseNote.sourceBranch,
              target_branch: releaseNote.targetBranch,
              summary: releaseNote.summary,
              sections: releaseNote.sections,
            },
          },
        },
      });
    }
  }, [releaseNote]);

  const handleCopyReleaseNote = useCallback(async () => {
    if (!releaseNote) return;
    const md = formatReleaseNoteAsMarkdown(releaseNote);
    const ok = await copyToClipboard(md);
    if (ok) toast.success('Release note copied');
  }, [releaseNote]);
  // Only frontend checks gate merge; server checks are advisory warnings
  const allChecksPassed = checks.filter((c) => c.source !== 'server').every((c) => c.passed);

  const handleConfirm = useCallback(async () => {
    setState('committing');
    try {
      await onConfirm();
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : t('merge_failed'));
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
              className="flex flex-col items-center gap-4 py-6"
            >
              {/* Animated checkmark with gradient ring */}
              <div className="relative flex h-20 w-20 items-center justify-center">
                {/* Pulsing glow ring */}
                {!prefersReducedMotion && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'conic-gradient(from 0deg, #f97316, #3b82f6, #f97316)',
                      opacity: 0.15,
                    }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: [1, 1.3, 1.15], opacity: [0, 0.2, 0.1] }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                )}
                {/* Circle background */}
                <motion.div
                  className="absolute inset-1 rounded-full bg-[var(--surface-card)]"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
                {/* SVG animated checkmark */}
                <svg width="40" height="40" viewBox="0 0 72 72" className="relative z-10">
                  <defs>
                    <linearGradient id="check-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                  <motion.path
                    d="M16 38 L30 52 L56 22"
                    fill="none"
                    stroke="url(#check-gradient)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{
                      duration: prefersReducedMotion ? 0 : 0.5,
                      delay: prefersReducedMotion ? 0 : 0.2,
                      ease: 'easeOut',
                    }}
                  />
                </svg>
              </div>

              {/* Title */}
              <motion.p
                className="text-lg font-semibold text-[var(--text-primary)]"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prefersReducedMotion ? 0 : 0.5, duration: 0.3 }}
              >
                {t('merge')} complete
              </motion.p>

              {/* Stats */}
              <motion.div
                className="flex items-center gap-4 text-sm text-[var(--text-secondary)]"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prefersReducedMotion ? 0 : 0.65, duration: 0.3 }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--diff-added-accent)]" />
                  {animatedCount} items unified
                </span>
              </motion.div>

              {/* Actions */}
              <motion.div
                className="flex gap-3 mt-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: prefersReducedMotion ? 0 : 0.85, duration: 0.3 }}
              >
                <Button onClick={onBackToCanvas}>{mc('backToCanvas')}</Button>
                {releaseNote && (
                  <Button variant="outline" onClick={handleCopyReleaseNote} className="gap-1.5">
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Release Note
                  </Button>
                )}
                <Button variant="ghost" onClick={onClose}>
                  {mc('stayHere')}
                </Button>
              </motion.div>

              <motion.p
                className="text-xs text-[var(--text-tertiary)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: prefersReducedMotion ? 0 : 1, duration: 0.3 }}
              >
                Auto-closing in 5s...
              </motion.p>
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
                      {t('identical_nodes')}
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
                      {t('removed_nodes')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-semibold text-[var(--text-primary)]">
                      {summary.total_nodes}
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
