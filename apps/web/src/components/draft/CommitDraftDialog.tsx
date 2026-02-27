'use client';

/**
 * CommitDraftDialog - Two-phase dialog for committing a draft
 *
 * Phase 'input': Message textarea + Cancel/Commit buttons
 * Phase 'success': Celebration with commit hash + [View on Canvas] + [Iterate] buttons
 */

import { motion } from 'framer-motion';
import { CheckCircle, GitFork, Loader2, Map as MapIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useTerminology } from '@/hooks/useTerminology';

interface CommitResult {
  commit: Record<string, unknown>;
  leaf: Record<string, unknown> | null;
}

interface CommitDraftDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (message?: string) => Promise<CommitResult>;
  onIterate?: (forkedDraftId: string) => void;
  onViewCanvas?: () => void;
  includedCount: number;
  constraintCount: number;
}

export function CommitDraftDialog({
  open,
  onClose,
  onConfirm,
  onIterate,
  onViewCanvas,
  includedCount,
  constraintCount,
}: CommitDraftDialogProps) {
  const { t } = useTerminology();
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [phase, setPhase] = useState<'input' | 'success'>('input');
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [iterating, setIterating] = useState(false);

  // Reset phase when dialog reopens
  useEffect(() => {
    if (open) {
      setPhase('input');
      setCommitResult(null);
      setIterating(false);
    }
  }, [open]);

  const handleCommit = async () => {
    setCommitting(true);
    try {
      const result = await onConfirm(message.trim() || undefined);
      setCommitResult(result);
      setMessage('');
      setPhase('success');
    } catch {
      // Error handled by store
    } finally {
      setCommitting(false);
    }
  };

  const handleIterate = async () => {
    if (!onIterate) return;
    setIterating(true);
    try {
      const { forkDraftV3 } = await import('@/lib/api');
      const store = (await import('@/store/draftWorkspaceStore')).useDraftWorkspaceStore.getState();
      const sourceDraftId = store.draftId;
      if (!sourceDraftId) return;
      const forked = await forkDraftV3(sourceDraftId);
      onIterate(forked.id);
    } catch {
      // Error handling — toast or silent
    } finally {
      setIterating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    }
  };

  const commitHash = (commitResult?.commit as Record<string, unknown>)?.hash as string | undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        {phase === 'input' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('commit_draft')}</DialogTitle>
              <DialogDescription>
                This will create a new commit with {includedCount} sentence
                {includedCount !== 1 ? 's' : ''}
                {constraintCount > 0 &&
                  ` and ${constraintCount} constraint${constraintCount !== 1 ? 's' : ''}`}
                .
              </DialogDescription>
            </DialogHeader>

            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`${t('commit_message')} (optional)`}
              rows={2}
              className="resize-none"
              autoFocus
            />

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={committing}>
                Cancel
              </Button>
              <Button onClick={handleCommit} disabled={committing || includedCount === 0}>
                {committing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    {t('committing')}
                  </>
                ) : (
                  t('commitAction')
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Success phase */
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Animated checkmark */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25"
            >
              <CheckCircle className="h-7 w-7 text-white" />
            </motion.div>

            <div className="text-center">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {t('knowledge_committed')}
              </h3>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                {commitHash ? `${commitHash.slice(0, 16)}...` : ''}
                {' · '}
                {includedCount} sentence{includedCount !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="flex w-full gap-2 mt-2">
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => {
                  onViewCanvas?.();
                  onClose();
                }}
              >
                <MapIcon className="h-3.5 w-3.5" />
                View on Canvas
              </Button>
              {onIterate && (
                <Button className="flex-1 gap-1.5" onClick={handleIterate} disabled={iterating}>
                  {iterating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitFork className="h-3.5 w-3.5" />
                  )}
                  Iterate
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
