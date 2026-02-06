'use client';

/**
 * MergeWorkspace - Full-screen merge workspace container
 *
 * Provides a Git-style merge experience with:
 * - Unified diff visualization
 * - Source tracing (click to see original conversation)
 * - Auto-save and draft persistence
 * - Merge preview before commit
 */

import { AnimatePresence, motion } from 'framer-motion';
import { GitMerge } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { MergeActionBar } from './MergeActionBar';
import { MergePreview } from './MergePreview';
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
  } = useMergeWorkspaceStore();

  const [showCelebration, setShowCelebration] = useState(false);

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

      // Cmd/Ctrl + Enter to commit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canCommit()) {
          handleCommit();
        }
      }

      // Escape to close
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveDraft, canCommit, onClose]);

  const handleCommit = useCallback(async () => {
    try {
      await commitMerge();
      setShowCelebration(true);
      // Auto-dismiss after 1.5s — redirect is handled by page component
      setTimeout(() => setShowCelebration(false), 1500);
    } catch {
      // Error is set in store
    }
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
          title="No merge data available"
          description="There is no merge in progress. Start a merge from the canvas by selecting two branches to compare."
          action={{ label: 'Go Back', onClick: onClose }}
        />
      </div>
    );
  }

  const unresolvedCount = getUnresolvedCount();

  return (
    <div className="relative flex h-screen flex-col bg-[var(--surface-app)]">
      {/* Merge Completion Overlay */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={cn(
                'flex flex-col items-center gap-4 rounded-2xl px-10 py-8',
                glass.cardBase,
                glass.highlight
              )}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-commit)]/15">
                <GitMerge className="h-7 w-7 text-[var(--accent-commit)]" />
              </div>
              <p className="text-lg font-semibold text-[var(--text-primary)]">Merge Complete</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Bar */}
      <MergeActionBar
        sourceBranch={sourceBranch || 'source'}
        targetBranch={targetBranch || 'main'}
        unresolvedCount={unresolvedCount}
        saveStatus={saveStatus}
        message={message}
        onMessageChange={setMessage}
        onSave={saveDraft}
        onCommit={handleCommit}
        onCancel={handleCancel}
        canCommit={canCommit()}
        onClose={onClose}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Diff View */}
        <div className="flex-1 overflow-auto p-6">
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
    </div>
  );
}
