'use client';

/**
 * DraftWorkspace - Full-screen draft editing workspace
 *
 * Provides a workbench for composing semantic knowledge:
 * - Sentence list with include/exclude toggles
 * - Constraint editor with local validation
 * - Instruction editor for generation guidance
 * - Auto-save with conflict detection
 * - Commit flow with two-phase dialog (input → success → iterate)
 * - Diff preview section (Changes from Parent)
 */

import { motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CollapsibleSection } from '@/components/shared/CollapsibleSection';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { promoteDraft as apiPromoteDraft } from '@/lib/api';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import { AutoSuggestPanel } from './AutoSuggestPanel';
import { CommitDraftDialog } from './CommitDraftDialog';
import { ConflictBanner } from './ConflictBanner';
import { DraftActionBar } from './DraftActionBar';
import { DraftConstraintEditor } from './DraftConstraintEditor';
import { DraftDiffSection } from './DraftDiffSection';
import { DraftSplitPane } from './DraftSplitPane';
import { ExtractConversationDialog } from './ExtractConversationDialog';
import { InstructionEditor } from './InstructionEditor';
import { PreviewPanel } from './PreviewPanel';
import { SentenceList } from './SentenceList';

interface DraftWorkspaceProps {
  projectId: string;
  onClose: () => void;
}

export function DraftWorkspace({ projectId, onClose }: DraftWorkspaceProps) {
  const {
    draft,
    isDirty,
    conflictError,
    saveDraft,
    commitDraft,
    getIncludedCount,
    loadDraft,
    draftId,
    generatePreview,
    reset,
  } = useDraftWorkspaceStore();

  const prefersReducedMotion = useReducedMotion();
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [promoting, setPromoting] = useState(false);

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

      // Cmd/Ctrl + G to generate preview
      if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault();
        if (getIncludedCount() > 0) {
          generatePreview();
        }
      }

      // Escape to close (only if dialog is not open)
      if (e.key === 'Escape' && !showCommitDialog) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveDraft, getIncludedCount, onClose, showCommitDialog, generatePreview]);

  const handleConfirmCommit = useCallback(
    async (message?: string) => {
      return await commitDraft(message);
    },
    [commitDraft]
  );

  const handleIterate = useCallback(
    (forkedDraftId: string) => {
      reset();
      loadDraft(forkedDraftId);
      setShowCommitDialog(false);
      // Update URL without full navigation
      window.history.replaceState(null, '', `/project/${projectId}/draft/${forkedDraftId}`);
    },
    [reset, loadDraft, projectId]
  );

  const handleViewCanvas = useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePromote = useCallback(async () => {
    if (!draftId) return;
    setPromoting(true);
    try {
      await apiPromoteDraft(draftId);
      toast.success('Draft promoted to editing');
      loadDraft(draftId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Promote failed');
    } finally {
      setPromoting(false);
    }
  }, [draftId, loadDraft]);

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
        onIterate={handleIterate}
        onViewCanvas={handleViewCanvas}
        includedCount={getIncludedCount()}
        constraintCount={draft.constraints.length}
      />

      {/* Extract Conversation Dialog */}
      {draftId && (
        <ExtractConversationDialog
          open={showExtractDialog}
          onOpenChange={setShowExtractDialog}
          draftId={draftId}
          projectId={projectId}
          onExtracted={handleRefreshDraft}
        />
      )}

      {/* Action Bar */}
      <DraftActionBar
        onClose={onClose}
        onCommit={() => setShowCommitDialog(true)}
        onExtract={() => setShowExtractDialog(true)}
        canCommit={getIncludedCount() > 0 && draft.status === 'editing'}
        projectId={projectId}
      />

      {/* Conflict Banner */}
      {conflictError && <ConflictBanner onRefresh={handleRefreshDraft} />}

      {/* Auto-draft promotion banner */}
      {draft.status === 'auto' && (
        <div className="flex items-center gap-2 border-b border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-6 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1 text-amber-800 dark:text-amber-200">
            Auto-extracted draft — read-only until promoted.
          </span>
          <Button size="sm" variant="outline" onClick={handlePromote} disabled={promoting}>
            {promoting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
            Start Editing
          </Button>
        </div>
      )}

      {/* Content + Preview split */}
      <DraftSplitPane
        top={
          <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
            <SentenceList />
            <AutoSuggestPanel />
            <CollapsibleSection
              title="Output & Constraints"
              badge={draft.constraints.length > 0 ? draft.constraints.length : undefined}
              defaultOpen={draft.constraints.length > 0 || !!draft.preview_type}
            >
              <div className="space-y-6">
                <DraftConstraintEditor />
                <InstructionEditor />
              </div>
            </CollapsibleSection>
            <DraftDiffSection />
          </div>
        }
        bottom={<PreviewPanel />}
      />
    </motion.div>
  );
}
