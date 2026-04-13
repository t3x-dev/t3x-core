'use client';

/**
 * DiffFullScreen - Full-screen tree-based diff overlay
 *
 * Displays a complete diff between two commits using YAMLDiff:
 * - Tree-level slot diffs with YAML-like display
 * - Commit metadata header
 */

import type { TreeDiff } from '@t3x-dev/core';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useTerminology } from '@/hooks/useTerminology';
import { useTreeDiff } from '@/hooks/useTreeDiff';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { CommitMeta } from '@/types/api';
import { DiffHeader } from './DiffHeader';
import { YAMLDiff } from './YAMLDiff';

// ============================================================================
// Types
// ============================================================================

interface DiffFullScreenProps {
  open: boolean;
  onClose: () => void;
  baseCommitHash: string;
  targetCommitHash: string;
  /** @deprecated Ignored — diff is now computed server-side via /v1/diff/tree */
  diffData?: unknown;
  projectId?: string;
}

// ============================================================================
// Component
// ============================================================================

export function DiffFullScreen({
  open,
  onClose,
  baseCommitHash,
  targetCommitHash,
}: DiffFullScreenProps) {
  const [treeDiffResult, setTreeDiffResult] = useState<TreeDiff | null>(null);
  const [baseMeta, setBaseMeta] = useState<CommitMeta | null>(null);
  const [targetMeta, setTargetMeta] = useState<CommitMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTerminology();
  const { loadDiff } = useTreeDiff();

  // Fetch  node diff from API
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadDiff(baseCommitHash, targetCommitHash)
      .then((response) => {
        if (cancelled) return;
        setTreeDiffResult(response.diff);
        setBaseMeta(response.base);
        setTargetMeta(response.target);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load diff');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, baseCommitHash, targetCommitHash, loadDiff]);

  const handleClose = useCallback(() => {
    onClose();
    setTreeDiffResult(null);
    setBaseMeta(null);
    setTargetMeta(null);
    setError(null);
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className={cn(
          'max-w-[95vw] w-full max-h-[95vh] h-full p-0 flex flex-col overflow-hidden',
          glass.panelBase
        )}
      >
        {/* Header */}
        <DiffHeader
          baseCommit={{
            hash: baseCommitHash,
            message: baseMeta?.message,
            branch: baseMeta?.branch,
          }}
          targetCommit={{
            hash: targetCommitHash,
            message: targetMeta?.message,
            branch: targetMeta?.branch,
          }}
          onClose={handleClose}
        />

        {/* Main Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
            <span className="ml-2 text-[var(--text-tertiary)]">{t('loading')}</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[var(--status-error)] text-sm">{error}</span>
          </div>
        ) : treeDiffResult ? (
          <div className="flex-1 overflow-auto p-4">
            <YAMLDiff diff={treeDiffResult} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
