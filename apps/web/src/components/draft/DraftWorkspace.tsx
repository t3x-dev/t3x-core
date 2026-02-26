'use client';

/**
 * DraftWorkspace - Full-screen draft editing workspace
 *
 * Provides a workbench for composing semantic knowledge:
 * - Sentence list with include/exclude toggles
 * - Constraint editor with local validation
 * - Instruction editor for generation guidance
 * - Auto-save with conflict detection
 * - Commit flow with dialog
 */

import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import { CommitDraftDialog } from './CommitDraftDialog';
import { ConflictBanner } from './ConflictBanner';
import { DraftActionBar } from './DraftActionBar';
import { DraftConstraintEditor } from './DraftConstraintEditor';
import { InstructionEditor } from './InstructionEditor';
import { SentenceList } from './SentenceList';

interface DraftWorkspaceProps {
  projectId: string;
  onClose: () => void;
}

export function DraftWorkspace({ onClose }: DraftWorkspaceProps) {
  const {
    draft,
    isDirty,
    conflictError,
    saveDraft,
    commitDraft,
    getIncludedCount,
    loadDraft,
    draftId,
  } = useDraftWorkspaceStore();

  const prefersReducedMotion = useReducedMotion();
  const [showCommitDialog, setShowCommitDialog] = useState(false);

  // Auto-save when dirty (debounced 2s)
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

      // Cmd/Ctrl + Enter to open commit dialog
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (getIncludedCount() > 0) {
          setShowCommitDialog(true);
        }
      }

      // Escape to close (only if dialog is not open)
      if (e.key === 'Escape' && !showCommitDialog) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveDraft, getIncludedCount, onClose, showCommitDialog]);

  const handleConfirmCommit = useCallback(
    async (message?: string) => {
      await commitDraft(message);
      onClose();
    },
    [commitDraft, onClose]
  );

  const handleRefreshDraft = useCallback(() => {
    if (draftId) {
      loadDraft(draftId);
    }
  }, [draftId, loadDraft]);

  if (!draft) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <p className="text-muted-foreground">No draft data available.</p>
      </div>
    );
  }

  const containerVariants = prefersReducedMotion ? reducedMotion.fullScreenEnter : fullScreenEnter;

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className="relative flex h-screen flex-col bg-[var(--surface-app)]"
    >
      {/* Commit Dialog */}
      <CommitDraftDialog
        open={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onConfirm={handleConfirmCommit}
        includedCount={getIncludedCount()}
        constraintCount={draft.constraints.length}
      />

      {/* Action Bar */}
      <DraftActionBar
        onClose={onClose}
        onCommit={() => setShowCommitDialog(true)}
        canCommit={getIncludedCount() > 0 && draft.status === 'editing'}
      />

      {/* Conflict Banner */}
      {conflictError && <ConflictBanner onRefresh={handleRefreshDraft} />}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
          {/* Sentence List */}
          <SentenceList />

          {/* Constraint Editor */}
          <DraftConstraintEditor />

          {/* Instruction Editor */}
          <InstructionEditor />
        </div>
      </div>
    </motion.div>
  );
}
