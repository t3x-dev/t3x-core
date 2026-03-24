'use client';

/**
 * MergeWorkspace - Full-screen merge workspace container
 *
 * Supports two modes:
 * - Sentence-based merge (legacy): uses prepared/Merge2WayResult from the store
 * - Frame-based merge (new): uses frameMergeResult from prepareFrameMerge()
 *
 * Mode is determined by whether frameMergeResult is set in the store.
 */

import type { Frame, FrameMergeResult, SemanticContent } from '@t3x-dev/core';
import { prepareFrameMerge } from '@t3x-dev/core';
import { motion } from 'framer-motion';
import { GitMerge, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiffMode } from '@/components/diff/DiffModeToggle';
import { MergeIllustration } from '@/components/illustrations/MergeIllustration';
import { EmptyState } from '@/components/ui/empty-state';
import { useMergeNavigation } from '@/hooks/useMergeNavigation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import { createCommit } from '@/lib/api/commits';
import { getCommitAsFrames } from '@/lib/api/commitUnified';
import { computeMergeSummary } from '@/lib/mergeSummary';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { useCanvasStore } from '@/store/canvasStore';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { buildMergeNavItems } from './buildMergeNavItems';
import type { FrameResolution } from './FrameConflictCard';
import { FrameMergeSection } from './FrameMergeSection';
import { MergeActionBar } from './MergeActionBar';
import { MergeNavigator } from './MergeNavigator';
import { MergeNavSidebar } from './MergeNavSidebar';
import { MergePreview } from './MergePreview';
import { MergeReviewDialog } from './MergeReviewDialog';
import { MergeYAMLTreeView } from './MergeYAMLTreeView';
import type { ViewMode } from './UnifiedDiffView';
import { UnifiedDiffView } from './UnifiedDiffView';

interface MergeWorkspaceProps {
  projectId: string;
  onClose: () => void;
  /** Called after a successful merge commit with the new commit hash */
  onMergeCommitted?: (commitHash: string) => void;
}

/**
 * Build merged SemanticContent from frame resolutions
 */
function buildMergedContent(
  mergeResult: FrameMergeResult,
  resolutions: Map<string, FrameResolution>,
  keepSource: Set<string>,
  keepTarget: Set<string>
): SemanticContent {
  const frames: Frame[] = [];

  // Auto-kept frames
  frames.push(...mergeResult.autoKept);

  // Resolved conflicts
  for (const conflict of mergeResult.conflicts) {
    const resolution = resolutions.get(conflict.frameId);
    if (!resolution) continue;

    switch (resolution.type) {
      case 'source':
        frames.push(conflict.sourceFrame);
        break;
      case 'target':
        frames.push(conflict.targetFrame);
        break;
      case 'both':
        frames.push(conflict.sourceFrame);
        frames.push(conflict.targetFrame);
        break;
      case 'per-slot': {
        // Build a merged frame from per-slot choices
        const mergedSlots: Record<string, unknown> = {};
        const allKeys = new Set([
          ...Object.keys(conflict.sourceFrame.slots),
          ...Object.keys(conflict.targetFrame.slots),
        ]);
        const conflictKeySet = new Set(conflict.slotConflicts.map((sc) => sc.key));
        for (const key of allKeys) {
          if (conflictKeySet.has(key)) {
            const choice = resolution.slotChoices[key];
            if (choice === 'source') {
              mergedSlots[key] = conflict.sourceFrame.slots[key];
            } else {
              mergedSlots[key] = conflict.targetFrame.slots[key];
            }
          } else {
            // Non-conflicting: take whichever exists (or source by preference)
            mergedSlots[key] = conflict.sourceFrame.slots[key] ?? conflict.targetFrame.slots[key];
          }
        }
        frames.push({
          ...conflict.sourceFrame,
          slots: mergedSlots as Frame['slots'],
        });
        break;
      }
    }
  }

  // Source-only frames (user toggleable)
  for (const frame of mergeResult.onlyInSource) {
    if (keepSource.has(frame.id)) {
      frames.push(frame);
    }
  }

  // Target-only frames (user toggleable)
  for (const frame of mergeResult.onlyInTarget) {
    if (keepTarget.has(frame.id)) {
      frames.push(frame);
    }
  }

  // Union all relations
  const relations = [
    ...mergeResult.relationsInBoth,
    ...mergeResult.relationsOnlyInSource,
    ...mergeResult.relationsOnlyInTarget,
  ];

  return { frames, relations };
}

export function MergeWorkspace({ projectId, onClose, onMergeCommitted }: MergeWorkspaceProps) {
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
    // Frame merge state
    frameMergeResult,
    frameResolutions,
    keepSourceFrames,
    keepTargetFrames,
    setFrameMergeResult,
    resolveFrameConflict,
    toggleKeepSourceFrame,
    toggleKeepTargetFrame,
    allFrameConflictsResolved,
    // Frame-aware getters
    getFrameMergeChecks,
    getPreviewFrames,
  } = useMergeWorkspaceStore();

  const prefersReducedMotion = useReducedMotion();
  const { t } = useTerminology();
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [diffMode, setDiffMode] = useState<DiffMode>('sentence');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Frame merge loading state
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [_commitMergeLoading, setCommitMergeLoading] = useState(false);

  // Semantic data for Frame mode (legacy FrameMergeSection fallback)
  const [semanticData, setSemanticData] = useState<{
    base?: SemanticContent;
    source?: SemanticContent;
    target?: SemanticContent;
  }>({});

  const hasSemanticData = !!(
    semanticData.source?.frames?.length && semanticData.target?.frames?.length
  );

  // Determine if we're in frame merge mode
  const isFrameMode = frameMergeResult !== null;

  // Fetch commits and prepare frame merge
  useEffect(() => {
    const sh = sourceHash;
    const th = targetHash;
    if (!sh || !th) return;
    let cancelled = false;

    setFrameLoading(true);
    setFrameError(null);

    Promise.all([getCommitAsFrames(sh), getCommitAsFrames(th)])
      .then(([srcCommit, tgtCommit]) => {
        if (cancelled) return;

        const sourceContent = srcCommit.content;
        const targetContent = tgtCommit.content;

        // Also store for legacy FrameMergeSection
        setSemanticData({
          source: sourceContent,
          target: targetContent,
        });

        // Determine base: use source's first parent if available
        if (sourceContent?.frames?.length && targetContent?.frames?.length) {
          // Try to find a common ancestor via parent hashes
          const sourceParents = srcCommit.parents ?? [];
          const targetParents = tgtCommit.parents ?? [];

          // Find common parent
          const commonParent = sourceParents.find((p) => targetParents.includes(p));
          const baseParent = commonParent ?? sourceParents[0];

          if (baseParent) {
            getCommitAsFrames(baseParent)
              .then((baseCommit) => {
                if (cancelled) return;
                const result = prepareFrameMerge(baseCommit.content, sourceContent, targetContent);
                setFrameMergeResult(result);
                setFrameLoading(false);
                setDiffMode('frame');
              })
              .catch(() => {
                if (cancelled) return;
                // No base available, use empty base (2-way comparison)
                const emptyBase: SemanticContent = { frames: [], relations: [] };
                const result = prepareFrameMerge(emptyBase, sourceContent, targetContent);
                setFrameMergeResult(result);
                setFrameLoading(false);
                setDiffMode('frame');
              });
          } else {
            // No parents at all, use empty base
            const emptyBase: SemanticContent = { frames: [], relations: [] };
            const result = prepareFrameMerge(emptyBase, sourceContent, targetContent);
            setFrameMergeResult(result);
            setFrameLoading(false);
            setDiffMode('frame');
          }
        } else {
          // No frame data, fall back to sentence mode
          setFrameLoading(false);
          setDiffMode('sentence');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setFrameError(
          err instanceof Error ? err.message : 'Failed to load commits for frame merge'
        );
        setFrameLoading(false);
        // Fall back to sentence mode
        setDiffMode('sentence');
      });

    return () => {
      cancelled = true;
    };
  }, [sourceHash, targetHash, setFrameMergeResult]);

  // Build nav items from merge data (sentence mode)
  const navItems = useMemo(
    () => (prepared ? buildMergeNavItems(prepared, extendedResolutions) : []),
    [prepared, extendedResolutions]
  );

  // Scroll sync between sidebar and content (sentence mode)
  const { activeItemId, scrollToItem } = useMergeNavigation({
    scrollContainerRef,
    items: navItems,
    prefersReducedMotion,
  });

  // Compute resolved/total for sidebar progress (sentence mode)
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

  // Jump to next unresolved conflict (frame mode)
  const handleJumpToNextUnresolved = useCallback(() => {
    if (!frameMergeResult) return;
    const unresolved = frameMergeResult.conflicts.find((c) => !frameResolutions.has(c.frameId));
    if (unresolved) {
      setActiveFrameId(unresolved.frameId);
      document
        .getElementById(`merge-frame-${unresolved.frameId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [frameMergeResult, frameResolutions]);

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
        if (isFrameMode ? allFrameConflictsResolved() && message.trim() : canCommit()) {
          setShowReviewDialog(true);
        }
      }

      // Cmd/Ctrl + B to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      }

      // J to jump to next unresolved conflict (frame mode)
      if (e.key === 'j' || e.key === 'J') {
        const active = document.activeElement;
        if (
          active &&
          (active.tagName === 'INPUT' ||
            active.tagName === 'TEXTAREA' ||
            active.getAttribute('contenteditable'))
        ) {
          return;
        }
        e.preventDefault();
        handleJumpToNextUnresolved();
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
  }, [
    saveDraft,
    canCommit,
    handleCancel,
    showReviewDialog,
    isFrameMode,
    allFrameConflictsResolved,
    message,
    handleJumpToNextUnresolved,
  ]);

  const handleOpenReview = useCallback(() => {
    setShowReviewDialog(true);
    fetchServerChecks();
  }, [fetchServerChecks]);

  // Store committed hash so the dialog's celebration timer can navigate to it
  const committedHashRef = useRef<string | null>(null);

  const handleConfirmMerge = useCallback(async () => {
    const result = await commitMerge();
    if (result?.hash) {
      committedHashRef.current = result.hash;
    }
  }, [commitMerge]);

  // Wrap onClose: after a successful merge, navigate to commit detail instead of canvas
  const handleCloseOrNavigate = useCallback(() => {
    const hash = committedHashRef.current;
    if (hash && onMergeCommitted) {
      committedHashRef.current = null;
      onMergeCommitted(hash);
    } else {
      onClose();
    }
  }, [onClose, onMergeCommitted]);

  // Frame merge commit handler
  const handleFrameCommitMerge = useCallback(async () => {
    if (!frameMergeResult || !sourceHash || !targetHash) return;

    setCommitMergeLoading(true);
    try {
      const mergedContent = buildMergedContent(
        frameMergeResult,
        frameResolutions,
        keepSourceFrames,
        keepTargetFrames
      );

      const result = await createCommit(
        projectId,
        {
          frames: mergedContent.frames,
          relations: mergedContent.relations,
        },
        {
          branch: targetBranch || 'main',
          message: message || 'Frame merge',
          parents: [sourceHash, targetHash],
          author: { type: 'human', name: 'User' },
          provenance: { method: 'merge' },
        }
      );

      // Reload canvas data to show the new merge commit
      useCanvasStore.getState().loadProjectData(projectId);

      // Navigate to the new merge commit detail page
      if (onMergeCommitted && result?.commit?.hash) {
        onMergeCommitted(result.commit.hash);
      } else {
        onClose();
      }
    } catch (err) {
      setFrameError(err instanceof Error ? err.message : 'Failed to commit frame merge');
    } finally {
      setCommitMergeLoading(false);
    }
  }, [
    frameMergeResult,
    frameResolutions,
    keepSourceFrames,
    keepTargetFrames,
    sourceHash,
    targetHash,
    projectId,
    targetBranch,
    message,
    onClose,
    onMergeCommitted,
  ]);

  // Frame merge can-commit check
  const frameCanCommit = isFrameMode && allFrameConflictsResolved() && message.trim().length > 0;

  // Frame merge review dialog handler
  const handleFrameOpenReview = useCallback(() => {
    setShowReviewDialog(true);
  }, []);

  const handleFrameConfirmMerge = useCallback(async () => {
    await handleFrameCommitMerge();
  }, [handleFrameCommitMerge]);

  // Loading state for frame data
  if (frameLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--accent-commit)]" />
          <p className="mt-4 text-[var(--text-secondary)]">Preparing frame merge...</p>
        </div>
      </div>
    );
  }

  // If we're in frame mode, render the frame merge workspace
  if (isFrameMode && frameMergeResult) {
    const frameUnresolvedCount = frameMergeResult.conflicts.filter(
      (c) => !frameResolutions.has(c.frameId)
    ).length;

    const containerVariants = prefersReducedMotion
      ? reducedMotion.fullScreenEnter
      : fullScreenEnter;

    const framePreviewFrames = getPreviewFrames();

    return (
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="relative flex h-screen flex-col bg-[var(--surface-app)]"
      >
        {/* Merge Review Dialog (frame mode) */}
        <MergeReviewDialog
          open={showReviewDialog}
          onClose={() => setShowReviewDialog(false)}
          onConfirm={handleFrameConfirmMerge}
          checks={getFrameMergeChecks()}
          message={message}
          sourceBranch={sourceBranch || 'source'}
          targetBranch={targetBranch || 'main'}
          sentenceCount={framePreviewFrames.length}
          summary={null}
          serverChecksLoading={false}
          onBackToCanvas={handleCloseOrNavigate}
        />

        {/* Action Bar */}
        <MergeActionBar
          projectId={projectId}
          sourceBranch={sourceBranch || 'source'}
          targetBranch={targetBranch || 'main'}
          unresolvedCount={frameUnresolvedCount}
          saveStatus={saveStatus}
          message={message}
          onMessageChange={setMessage}
          onSave={saveDraft}
          onCommit={handleFrameOpenReview}
          onCancel={handleCancel}
          canCommit={frameCanCommit}
          onClose={onClose}
        />

        {/* Main Content — 2-column layout: Navigator + YAML Tree View */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {frameError && (
            <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {frameError}
            </div>
          )}

          <div className="flex-1 overflow-hidden flex">
            {/* Left: MergeNavigator (enhanced) */}
            <MergeNavigator
              mergeResult={frameMergeResult}
              resolutions={frameResolutions}
              keepSource={keepSourceFrames}
              keepTarget={keepTargetFrames}
              activeFrameId={activeFrameId}
              onSelectFrame={setActiveFrameId}
              onToggleKeepSource={toggleKeepSourceFrame}
              onToggleKeepTarget={toggleKeepTargetFrame}
              relations={frameMergeResult.relationsInBoth.map((r) => ({
                source: r.from,
                target: r.to,
                type: r.type,
              }))}
              onJumpToNextUnresolved={handleJumpToNextUnresolved}
            />

            {/* Center+Right replaced by MergeYAMLTreeView */}
            <MergeYAMLTreeView
              mergeResult={frameMergeResult}
              resolutions={frameResolutions}
              keepSource={keepSourceFrames}
              keepTarget={keepTargetFrames}
              onResolveConflict={(id, res) => resolveFrameConflict(id, res)}
              onToggleKeepSource={toggleKeepSourceFrame}
              onToggleKeepTarget={toggleKeepTargetFrame}
              sourceBranch={sourceBranch || 'source'}
              targetBranch={targetBranch || 'main'}
              sourceHash={sourceHash || ''}
              targetHash={targetHash || ''}
            />
          </div>

          {/* Preview Panel */}
          <MergePreview expanded={previewExpanded} onToggle={togglePreview} />
        </div>
      </motion.div>
    );
  }

  // ============================================================================
  // Sentence-based merge (legacy fallback)
  // ============================================================================

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
        onBackToCanvas={handleCloseOrNavigate}
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
