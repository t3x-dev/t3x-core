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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MergeIllustration } from '@/components/illustrations/MergeIllustration';
import { EmptyState } from '@/components/ui/empty-state';
import { useMergeNavigation } from '@/hooks/useMergeNavigation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import { computeMergeSummary } from '@/lib/mergeSummary';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { buildMergeNavItems } from './buildMergeNavItems';
import { MergeActionBar } from './MergeActionBar';
import { MergeNavSidebar } from './MergeNavSidebar';
import { MergePreview } from './MergePreview';
import { MergeReviewDialog } from './MergeReviewDialog';
import type { ViewMode } from './UnifiedDiffView';
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
    extendedResolutions,
    fetchServerChecks,
    serverChecksLoading,
  } = useMergeWorkspaceStore();

  const prefersReducedMotion = useReducedMotion();
  const { t } = useTerminology();
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Build nav items from merge data
  const navItems = useMemo(
    () => (prepared ? buildMergeNavItems(prepared, extendedResolutions) : []),
    [prepared, extendedResolutions]
  );

  // Scroll sync between sidebar and content
  const { activeItemId, scrollToItem } = useMergeNavigation({
    scrollContainerRef,
    items: navItems,
    prefersReducedMotion,
  });

  // Compute resolved/total for sidebar progress
  const totalConflicts = prepared?.similarPairs.length ?? 0;
  const resolvedCount = totalConflicts - (prepared ? getUnresolvedCount() : 0);

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

      // Cmd/Ctrl + B to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
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
    fetchServerChecks();
  }, [fetchServerChecks]);

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
          customIcon={<MergeIllustration />}
        />
      </div>
    );
  }

  const unresolvedCount = totalConflicts - resolvedCount;
  const summary = prepared ? computeMergeSummary(prepared, extendedResolutions) : null;
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
        summary={summary}
        serverChecksLoading={serverChecksLoading}
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

      {/* Main Content — horizontal layout with sidebar */}
      <div className="flex-1 overflow-hidden flex">
        {/* Navigation Sidebar (hidden on small screens) */}
        <div className="hidden md:flex">
          <MergeNavSidebar
            items={navItems}
            activeItemId={activeItemId}
            onItemClick={scrollToItem}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
            resolvedCount={resolvedCount}
            totalConflicts={totalConflicts}
          />
        </div>

        {/* Diff + Preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Diff View */}
          <div ref={scrollContainerRef} className="flex-1 overflow-auto p-[var(--space-page)]">
            <UnifiedDiffView
              prepared={prepared}
              onResolvePair={resolvePair}
              onToggleKeep={toggleKeep}
              sourceBranch={sourceBranch || 'A'}
              targetBranch={targetBranch || 'B'}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>

          {/* Preview Panel */}
          <MergePreview expanded={previewExpanded} onToggle={togglePreview} />
        </div>
      </div>
    </motion.div>
  );
}
