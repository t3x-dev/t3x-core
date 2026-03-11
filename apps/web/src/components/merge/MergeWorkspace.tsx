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

import type { SemanticContent } from '@t3x/core';
import { motion } from 'framer-motion';
import { GitMerge } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiffMode } from '@/components/diff/DiffModeToggle';
import { MergeIllustration } from '@/components/illustrations/MergeIllustration';
import { EmptyState } from '@/components/ui/empty-state';
import { useMergeNavigation } from '@/hooks/useMergeNavigation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import { getCommitV4 } from '@/lib/api';
import { computeMergeSummary } from '@/lib/mergeSummary';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { buildMergeNavItems } from './buildMergeNavItems';
import { FrameMergeSection } from './FrameMergeSection';
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
    sourceHash,
    targetHash,
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
  const [diffMode, setDiffMode] = useState<DiffMode>('sentence');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Semantic data for Frame mode
  const [semanticData, setSemanticData] = useState<{
    base?: SemanticContent;
    source?: SemanticContent;
    target?: SemanticContent;
  }>({});

  const hasSemanticData = !!(
    semanticData.source?.frames?.length && semanticData.target?.frames?.length
  );

  // Fetch semantic data from commits for Frame mode
  useEffect(() => {
    const sh = sourceHash;
    const th = targetHash;
    if (!sh || !th) return;
    let cancelled = false;

    Promise.all([getCommitV4(sh), getCommitV4(th)])
      .then(([src, tgt]) => {
        if (cancelled) return;
        // TODO: fetch actual merge base commit for proper 3-way conflict detection.
        // With empty base, prepareFrameMerge degrades to 2-way comparison
        // (all frames appear as "added" from both sides, no true conflict detection).
        const emptyBase: SemanticContent = { frames: [], relations: [] };
        setSemanticData({
          base: emptyBase,
          source: src?.semantic ?? undefined,
          target: tgt?.semantic ?? undefined,
        });
        if (src?.semantic?.frames?.length && tgt?.semantic?.frames?.length) {
          setDiffMode('frame');
        } else {
          setDiffMode('sentence');
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sourceHash, targetHash]);

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

  const handleCancel = useCallback(async () => {
    await cancelMerge();
    onClose();
  }, [cancelMerge, onClose]);

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

      // Escape to cancel merge (only if dialog is not open)
      if (e.key === 'Escape' && !showReviewDialog) {
        // Don't cancel if user is typing in an input
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.getAttribute('contenteditable'))
        ) {
          return; // let the input handle Escape
        }
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveDraft, canCommit, handleCancel, showReviewDialog]);

  const handleOpenReview = useCallback(() => {
    setShowReviewDialog(true);
    fetchServerChecks();
  }, [fetchServerChecks]);

  const handleConfirmMerge = useCallback(async () => {
    await commitMerge();
  }, [commitMerge]);

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
        prepared={prepared}
        extendedResolutions={extendedResolutions}
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
              diffMode={diffMode}
              onDiffModeChange={setDiffMode}
              hasSemanticData={hasSemanticData}
            />
            {diffMode === 'frame' &&
              hasSemanticData &&
              semanticData.base &&
              semanticData.source &&
              semanticData.target && (
                <FrameMergeSection
                  base={semanticData.base}
                  source={semanticData.source}
                  target={semanticData.target}
                />
              )}
          </div>

          {/* Preview Panel */}
          <MergePreview expanded={previewExpanded} onToggle={togglePreview} />
        </div>
      </div>
    </motion.div>
  );
}
