'use client';

/**
 * DiffFullScreen - Full-screen side-by-side diff overlay
 *
 * Displays a complete diff between two V4 commits with:
 * - Left/Right side-by-side comparison
 * - Word-level diff highlighting for modified sentences
 * - Source context tracing (click pin icon to see original conversation)
 * - Stats bar with section jumping
 */

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useSourceContext } from '@/hooks/useSourceContext';
import type { CommitV4, DiffResultRaw } from '@/lib/api';
import { getCommitV4 } from '@/lib/api';
import type { Sentence } from '@/types/merge';
import { DiffHeader } from './DiffHeader';
import type { DiffSideBySideHandle } from './DiffSideBySide';
import { DiffSideBySide } from './DiffSideBySide';
import { DiffSourceContextModal } from './DiffSourceContextModal';
import { DiffStatsBar } from './DiffStatsBar';

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
  const [baseCommit, setBaseCommit] = useState<CommitV4 | null>(null);
  const [targetCommit, setTargetCommit] = useState<CommitV4 | null>(null);
  const [commitsLoading, setCommitsLoading] = useState(false);

  const sideBySideRef = useRef<DiffSideBySideHandle>(null);
  const sourceContext = useSourceContext();

  // Load commit data for source_ref tracing
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setCommitsLoading(true);

    Promise.all([getCommitV4(baseCommitHash), getCommitV4(targetCommitHash)])
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

  const handleSourceClick = useCallback(
    (sentence: Sentence) => {
      sourceContext.openContext(sentence);
    },
    [sourceContext]
  );

  const handleClose = useCallback(() => {
    onClose();
    setBaseCommit(null);
    setTargetCommit(null);
  }, [onClose]);

  const handleJump = useCallback((section: string) => {
    sideBySideRef.current?.jumpToSection(section);
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full p-0 flex flex-col overflow-hidden">
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
            modified={diffData.stats.modifiedCount}
            added={diffData.stats.addedCount}
            removed={diffData.stats.removedCount}
            onJump={handleJump}
          />

          {/* Main Content */}
          {commitsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading commits...</span>
            </div>
          ) : (
            <DiffSideBySide
              ref={sideBySideRef}
              segmentDiffs={diffData.segmentDiffs}
              baseSentences={baseCommit?.content.sentences ?? []}
              targetSentences={targetCommit?.content.sentences ?? []}
              onSourceClick={handleSourceClick}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Source Context Modal (separate layer) */}
      <DiffSourceContextModal
        open={sourceContext.open}
        sentence={sourceContext.sentence}
        data={sourceContext.data}
        loading={sourceContext.loading}
        onClose={sourceContext.closeContext}
        projectId={projectId}
      />
    </>
  );
}
