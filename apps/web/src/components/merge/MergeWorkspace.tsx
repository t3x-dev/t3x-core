'use client';

/**
 * MergeWorkspace - Full-screen merge workspace container
 *
 * Provides a Git-style merge experience with:
 * - Unified diff visualization
 * - Source tracing (click to see original conversation)
 * - Auto-save and draft persistence
 * - Merge Review Dialog before commit
 */

import { motion } from 'framer-motion';
import { GitMerge } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { MergeActionBar } from './MergeActionBar';
import { MergePreview } from './MergePreview';
import { MergeReviewDialog } from './MergeReviewDialog';
import { UnifiedDiffView } from './UnifiedDiffView';

interface MergeWorkspaceProps {
  projectId: string;
  onClose: () => void;
}

export function MergeWorkspace({ projectId, onClose }: MergeWorkspaceProps) {
  const {
    prepared,
    message,
    isDirty,
    saveStatus,
    sourceBranch,
    targetBranch,
    saveDraft,
    commitMerge,
    cancelMerge,
    setMessage,
    resolvePair,
    toggleKeep,
    getUnresolvedCount,
    canCommit,
    previewExpanded,
    togglePreview,
    getMergeChecks,
    getPreviewSentences,
  } = useMergeWorkspaceStore();

  const prefersReducedMotion = useReducedMotion();
  const { t } = useTerminology();
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Auto-save when dirty (debounced)
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      saveDraft();
    }, 2000);

    return () => clearTimeout(timer);
  }, [isDirty, saveDraft]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveDraft();
      }

      // Cmd/Ctrl + Enter to open review dialog
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canCommit()) {
          setShowReviewDialog(true);
        }
      }

      // Escape to close (only if dialog is not open)
      if (e.key === 'Escape' && !showReviewDialog) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveDraft, canCommit, onClose, showReviewDialog]);

  const handleOpenReview = useCallback(() => {
    setShowReviewDialog(true);
  }, []);

  const handleConfirmMerge = useCallback(async () => {
    await commitMerge();
  }, [commitMerge]);

  const handleCancel = useCallback(async () => {
    await cancelMerge();
    onClose();
  }, [cancelMerge, onClose]);

  if (!prepared) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <EmptyState
          icon={GitMerge}
          title={`No ${t('merge').toLowerCase()} data available`}
          description={`There is no ${t('merge').toLowerCase()} in progress. Start a ${t('merge').toLowerCase()} from the canvas by selecting two ${t('branches').toLowerCase()} to compare.`}
          action={{ label: 'Go Back', onClick: onClose }}
        />
      </div>
    );
  }

  const unresolvedCount = getUnresolvedCount();
  const containerVariants = prefersReducedMotion ? reducedMotion.fullScreenEnter : fullScreenEnter;

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className="relative flex h-screen flex-col bg-[var(--surface-app)]"
    >
      {/* Merge Review Dialog */}
      <MergeReviewDialog
        open={showReviewDialog}
        onClose={() => setShowReviewDialog(false)}
        onConfirm={handleConfirmMerge}
        checks={getMergeChecks()}
        message={message}
        sourceBranch={sourceBranch || 'source'}
        targetBranch={targetBranch || 'main'}
        sentenceCount={getPreviewSentences().length}
        onBackToCanvas={onClose}
      />

      {/* Action Bar */}
      <MergeActionBar
        projectId={projectId}
        sourceBranch={sourceBranch || 'source'}
        targetBranch={targetBranch || 'main'}
        unresolvedCount={unresolvedCount}
        saveStatus={saveStatus}
        message={message}
        onMessageChange={setMessage}
        onSave={saveDraft}
        onCommit={handleOpenReview}
        onCancel={handleCancel}
        canCommit={canCommit()}
        onClose={onClose}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Diff View */}
        <div className="flex-1 overflow-auto p-[var(--space-page)]">
          <UnifiedDiffView
            prepared={prepared}
            onResolvePair={resolvePair}
            onToggleKeep={toggleKeep}
            sourceBranch={sourceBranch || 'A'}
            targetBranch={targetBranch || 'B'}
          />
        </div>

        {/* Preview Panel */}
        <MergePreview expanded={previewExpanded} onToggle={togglePreview} />
      </div>
    </motion.div>
  );
}
