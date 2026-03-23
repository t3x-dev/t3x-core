'use client';

/**
 * DiffFullScreen - Full-screen side-by-side diff overlay
 *
 * Displays a complete diff between two commits with:
 * - Left/Right side-by-side comparison
 * - Word-level diff highlighting for modified sentences
 * - Source context tracing (click pin icon to see inline context via SourceContextView)
 * - Stats bar with section jumping
 */

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useTerminology } from '@/hooks/useTerminology';
import type { ApiCommit, DiffResultRaw } from '@/lib/api';
import { getApiCommit } from '@/lib/api';
import { framesToSentences } from '@/lib/framesToSentences';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { DiffHeader } from './DiffHeader';
import type { DiffSideBySideHandle } from './DiffSideBySide';
import { DiffSideBySide } from './DiffSideBySide';
import { DiffStatsBar } from './DiffStatsBar';

// ============================================================================
// Helpers
// ============================================================================

/** Format column label: "branch @ shortHash" or just shortHash */
function formatCommitLabel(branch: string | null | undefined, hash: string): string {
  const shortHash = hash.replace('sha256:', '').slice(0, 7);
  return branch ? `${branch} @ ${shortHash}` : shortHash;
}

// ============================================================================
// Types
// ============================================================================

interface DiffFullScreenProps {
  open: boolean;
  onClose: () => void;
  baseCommitHash: string;
  targetCommitHash: string;
  diffData: DiffResultRaw;
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
  diffData,
  projectId,
}: DiffFullScreenProps) {
  const [baseCommit, setBaseCommit] = useState<ApiCommit | null>(null);
  const [targetCommit, setTargetCommit] = useState<ApiCommit | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const { t } = useTerminology();

  const sideBySideRef = useRef<DiffSideBySideHandle>(null);

  // Load commit data for source_ref tracing
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setCommitsLoading(true);

    Promise.all([getApiCommit(baseCommitHash), getApiCommit(targetCommitHash)])
      .then(([base, target]) => {
        if (!cancelled) {
          setBaseCommit(base);
          setTargetCommit(target);
        }
      })
      .catch(() => {
        // Commits may not load (e.g., V3 commits), graceful degradation
        if (!cancelled) {
          setBaseCommit(null);
          setTargetCommit(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCommitsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, baseCommitHash, targetCommitHash]);

  const handleClose = useCallback(() => {
    onClose();
    setBaseCommit(null);
    setTargetCommit(null);
  }, [onClose]);

  const handleJump = useCallback((section: string) => {
    sideBySideRef.current?.jumpToSection(section);
  }, []);

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
            message: baseCommit?.message,
            branch: baseCommit?.branch,
          }}
          targetCommit={{
            hash: targetCommitHash,
            message: targetCommit?.message,
            branch: targetCommit?.branch,
          }}
          onClose={handleClose}
        />

        {/* Stats Bar */}
        <DiffStatsBar
          identical={diffData.stats.sameCount}
          equivalent={diffData.stats.equivalentCount ?? 0}
          modified={diffData.stats.modifiedCount}
          added={diffData.stats.addedCount}
          removed={diffData.stats.removedCount}
          onJump={handleJump}
        />

        {/* Main Content */}
        {commitsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
            <span className="ml-2 text-[var(--text-tertiary)]">{t('loading')}</span>
          </div>
        ) : (
          <DiffSideBySide
            ref={sideBySideRef}
            segmentDiffs={diffData.segmentDiffs}
            baseSentences={baseCommit ? framesToSentences(baseCommit.content as import('@t3x-dev/core').SemanticContent).map((s) => ({ id: s.id, text: s.text, source_ref: s.source_ref ? { conversation_id: s.source_ref.conversation_id ?? '', turn_hash: s.source_ref.turn_hash ?? '', start_char: s.source_ref.start_char ?? 0, end_char: s.source_ref.end_char ?? 0 } : undefined })) : []}
            targetSentences={targetCommit ? framesToSentences(targetCommit.content as import('@t3x-dev/core').SemanticContent).map((s) => ({ id: s.id, text: s.text, source_ref: s.source_ref ? { conversation_id: s.source_ref.conversation_id ?? '', turn_hash: s.source_ref.turn_hash ?? '', start_char: s.source_ref.start_char ?? 0, end_char: s.source_ref.end_char ?? 0 } : undefined })) : []}
            projectId={projectId}
            baseLabel={formatCommitLabel(baseCommit?.branch, baseCommitHash)}
            targetLabel={formatCommitLabel(targetCommit?.branch, targetCommitHash)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
