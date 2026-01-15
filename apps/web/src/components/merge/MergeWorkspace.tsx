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

import { useEffect, useCallback } from 'react';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { MergeActionBar } from './MergeActionBar';
import { UnifiedDiffView } from './UnifiedDiffView';
import { MergePreview } from './MergePreview';
import { SourceContextModal } from './SourceContextModal';

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
    openContext,
    getUnresolvedCount,
    canCommit,
    previewExpanded,
    togglePreview,
  } = useMergeWorkspaceStore();

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
      // Redirect is handled by page component
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
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">No merge data available</p>
      </div>
    );
  }

  const unresolvedCount = getUnresolvedCount();

  return (
    <div className="flex h-screen flex-col bg-background">
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
            onSourceClick={openContext}
          />
        </div>

        {/* Preview Panel */}
        <MergePreview
          expanded={previewExpanded}
          onToggle={togglePreview}
        />
      </div>

      {/* Source Context Modal */}
      <SourceContextModal />
    </div>
  );
}
