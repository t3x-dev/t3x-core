'use client';

/**
 * MergeWorkspace - Full-screen merge workspace container
 *
 * Supports two modes:
 * - ContentNode-based merge (legacy): uses prepared/Merge2WayResult from the store
 * - Tree-based merge (new): uses treeMergeResult from prepareMerge()
 *
 * Mode is determined by whether treeMergeResult is set in the store.
 */

import type { MergeResult, SemanticContent, TreeNode } from '@t3x-dev/core';
import { prepareMerge } from '@t3x-dev/core';
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
import { getCommitAsNodes } from '@/lib/api/commitUnified';
import { computeMergeSummary } from '@/lib/mergeSummary';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { useCanvasStore } from '@/store/canvasStore';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { buildMergeNavItems } from './buildMergeNavItems';
import { ConflictCard, type TreeResolution } from './ConflictCard';
import { MergeSection } from './MergeSection';
import { MergeActionBar } from './MergeActionBar';
import { MergeNavigator } from './MergeNavigator';
import { MergeNavSidebar } from './MergeNavSidebar';
import { MergePreview } from './MergePreview';
import { MergeReviewDialog } from './MergeReviewDialog';
import type { ViewMode } from './UnifiedDiffView';
import { UnifiedDiffView } from './UnifiedDiffView';

interface MergeWorkspaceProps {
  projectId: string;
  onClose: () => void;
  /** Called after a successful merge commit with the new commit hash */
  onMergeCommitted?: (commitHash: string) => void;
}

/**
 * Find a TreeNode by slash-delimited path (e.g. "hangzhou_trip/dining")
 */
function findNodeByPath(trees: TreeNode[], path: string): TreeNode | null {
  const segments = path.split('/');
  const root = trees.find((t) => t.key === segments[0]);
  if (!root) return null;
  let current = root;
  for (let i = 1; i < segments.length; i++) {
    const child = current.children.find((c) => c.key === segments[i]);
    if (!child) return null;
    current = child;
  }
  return current;
}

/**
 * Look up a TreeNode from source or target content by path
 */
function findNode(
  sourceContent: SemanticContent | undefined,
  targetContent: SemanticContent | undefined,
  path: string
): TreeNode | null {
  if (sourceContent) {
    const node = findNodeByPath(sourceContent.trees, path);
    if (node) return node;
  }
  if (targetContent) {
    const node = findNodeByPath(targetContent.trees, path);
    if (node) return node;
  }
  return null;
}

/**
 * Build merged SemanticContent from tree resolutions (tree-primary)
 */
function buildMergedContent(
  mergeResult: MergeResult,
  resolutions: Map<string, TreeResolution>,
  keepSource: Set<string>,
  keepTarget: Set<string>,
  sourceContent?: SemanticContent,
  targetContent?: SemanticContent
): SemanticContent {
  const trees: TreeNode[] = [];

  // Auto-kept nodes (take from source since they're identical)
  for (const path of mergeResult.autoKept) {
    const node = findNode(sourceContent, targetContent, path);
    if (node) trees.push(node);
  }

  // Resolved conflicts
  for (const conflict of mergeResult.conflicts) {
    const resolution = resolutions.get(conflict.path);
    if (!resolution) continue;

    const sourceNode = sourceContent
      ? findNodeByPath(sourceContent.trees, conflict.path)
      : null;
    const targetNode = targetContent
      ? findNodeByPath(targetContent.trees, conflict.path)
      : null;

    switch (resolution.type) {
      case 'source':
        if (sourceNode) trees.push(sourceNode);
        break;
      case 'target':
        if (targetNode) trees.push(targetNode);
        break;
      case 'both':
        if (sourceNode) trees.push(sourceNode);
        if (targetNode) trees.push(targetNode);
        break;
      case 'per-slot': {
        // Build a merged node from per-slot choices
        const mergedSlots: Record<string, unknown> = {};
        const srcSlots = sourceNode?.slots ?? {};
        const tgtSlots = targetNode?.slots ?? {};
        const allKeys = new Set([...Object.keys(srcSlots), ...Object.keys(tgtSlots)]);
        const conflictKeySet = new Set(conflict.slotConflicts.map((sc) => sc.key));
        for (const key of allKeys) {
          if (conflictKeySet.has(key)) {
            const choice = resolution.slotChoices[key];
            if (choice === 'source') {
              mergedSlots[key] = srcSlots[key];
            } else {
              mergedSlots[key] = tgtSlots[key];
            }
          } else {
            mergedSlots[key] = srcSlots[key] ?? tgtSlots[key];
          }
        }
        trees.push({
          key: conflict.path.split('/').pop() ?? conflict.path,
          slots: mergedSlots as TreeNode['slots'],
          children: sourceNode?.children ?? targetNode?.children ?? [],
        });
        break;
      }
    }
  }

  // Source-only nodes (user toggleable)
  for (const path of mergeResult.onlyInSource) {
    if (keepSource.has(path)) {
      const node = sourceContent ? findNodeByPath(sourceContent.trees, path) : null;
      if (node) trees.push(node);
    }
  }

  // Target-only nodes (user toggleable)
  for (const path of mergeResult.onlyInTarget) {
    if (keepTarget.has(path)) {
      const node = targetContent ? findNodeByPath(targetContent.trees, path) : null;
      if (node) trees.push(node);
    }
  }

  // Union all relations
  const relations = [
    ...mergeResult.relationsInBoth,
    ...mergeResult.relationsOnlyInSource,
    ...mergeResult.relationsOnlyInTarget,
  ];

  return { trees, relations };
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
    getPreviewNodes,
    extendedResolutions,
    fetchServerChecks,
    serverChecksLoading,
    // Tree merge state
    treeMergeResult,
    treeResolutions,
    keepSourceNodes,
    keepTargetNodes,
    setTreeMergeResult,
    resolveTreeConflict,
    toggleKeepSourceNode,
    toggleKeepTargetNode,
    allTreeConflictsResolved,
    // Tree-aware getters
    getTreeMergeChecks,
    getPreviewPaths,
  } = useMergeWorkspaceStore();

  const prefersReducedMotion = useReducedMotion();
  const { t } = useTerminology();
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [diffMode, setDiffMode] = useState<DiffMode>('node');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Tree merge loading state
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [_commitMergeLoading, setCommitMergeLoading] = useState(false);

  // Semantic data for Tree mode (legacy MergeSection fallback)
  const [semanticData, setSemanticData] = useState<{
    base?: SemanticContent;
    source?: SemanticContent;
    target?: SemanticContent;
  }>({});

  const hasSemanticData = !!(
    semanticData.source?.trees?.length && semanticData.target?.trees?.length
  );

  // Determine if we're in tree merge mode
  const isTreeMode = treeMergeResult !== null;

  // Fetch commits and prepare tree merge
  useEffect(() => {
    const sh = sourceHash;
    const th = targetHash;
    if (!sh || !th) return;
    let cancelled = false;

    setTreeLoading(true);
    setTreeError(null);

    Promise.all([getCommitAsNodes(sh), getCommitAsNodes(th)])
      .then(([srcCommit, tgtCommit]) => {
        if (cancelled) return;

        const sourceContent = srcCommit.content;
        const targetContent = tgtCommit.content;

        // Also store for legacy MergeSection
        setSemanticData({
          source: sourceContent,
          target: targetContent,
        });

        // Determine base: use source's first parent if available
        if (sourceContent?.trees?.length && targetContent?.trees?.length) {
          // Try to find a common ancestor via parent hashes
          const sourceParents = srcCommit.parents ?? [];
          const targetParents = tgtCommit.parents ?? [];

          // Find common parent
          const commonParent = sourceParents.find((p: string) => targetParents.includes(p));
          const baseParent = commonParent ?? sourceParents[0];

          if (baseParent) {
            getCommitAsNodes(baseParent)
              .then((baseCommit) => {
                if (cancelled) return;
                const result = prepareMerge(baseCommit.content, sourceContent, targetContent);
                setTreeMergeResult(result);
                setTreeLoading(false);
                setDiffMode('tree');
              })
              .catch(() => {
                if (cancelled) return;
                // No base available, use empty base (2-way comparison)
                const emptyBase: SemanticContent = { trees: [], relations: [] };
                const result = prepareMerge(emptyBase, sourceContent, targetContent);
                setTreeMergeResult(result);
                setTreeLoading(false);
                setDiffMode('tree');
              });
          } else {
            // No parents at all, use empty base
            const emptyBase: SemanticContent = { trees: [], relations: [] };
            const result = prepareMerge(emptyBase, sourceContent, targetContent);
            setTreeMergeResult(result);
            setTreeLoading(false);
            setDiffMode('tree');
          }
        } else {
          // No tree data, fall back to node mode
          setTreeLoading(false);
          setDiffMode('node');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setTreeError(
          err instanceof Error ? err.message : 'Failed to load commits for tree merge'
        );
        setTreeLoading(false);
        // Fall back to node mode
        setDiffMode('node');
      });

    return () => {
      cancelled = true;
    };
  }, [sourceHash, targetHash, setTreeMergeResult]);

  // Build nav items from merge data (node mode)
  const navItems = useMemo(
    () => (prepared ? buildMergeNavItems(prepared as unknown as MergeResult, {}, extendedResolutions) : []),
    [prepared, extendedResolutions]
  );

  // Scroll sync between sidebar and content (node mode)
  const { activeItemId, scrollToItem } = useMergeNavigation({
    scrollContainerRef,
    items: navItems,
    prefersReducedMotion,
  });

  // Compute resolved/total for sidebar progress (node mode)
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
        if (isTreeMode ? allTreeConflictsResolved() && message.trim() : canCommit()) {
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
  }, [
    saveDraft,
    canCommit,
    handleCancel,
    showReviewDialog,
    isTreeMode,
    allTreeConflictsResolved,
    message,
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

  // Tree merge commit handler
  const handleNodeCommitMerge = useCallback(async () => {
    if (!treeMergeResult || !sourceHash || !targetHash) return;

    setCommitMergeLoading(true);
    try {
      const mergedContent = buildMergedContent(
        treeMergeResult,
        treeResolutions,
        keepSourceNodes,
        keepTargetNodes,
        semanticData.source,
        semanticData.target
      );

      const result = await createCommit(
        projectId,
        {
          trees: mergedContent.trees,
          relations: mergedContent.relations,
        },
        {
          branch: targetBranch || 'main',
          message: message || 'Tree merge',
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
      setTreeError(err instanceof Error ? err.message : 'Failed to commit tree merge');
    } finally {
      setCommitMergeLoading(false);
    }
  }, [
    treeMergeResult,
    treeResolutions,
    keepSourceNodes,
    keepTargetNodes,
    sourceHash,
    targetHash,
    projectId,
    targetBranch,
    message,
    onClose,
    onMergeCommitted,
    semanticData,
  ]);

  // Tree merge can-commit check
  const treeCanCommit = isTreeMode && allTreeConflictsResolved() && message.trim().length > 0;

  // Tree merge review dialog handler
  const handleNodeOpenReview = useCallback(() => {
    setShowReviewDialog(true);
  }, []);

  const handleNodeConfirmMerge = useCallback(async () => {
    await handleNodeCommitMerge();
  }, [handleNodeCommitMerge]);

  // Loading state for tree data
  if (treeLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--accent-commit)]" />
          <p className="mt-4 text-[var(--text-secondary)]">Preparing tree merge...</p>
        </div>
      </div>
    );
  }

  // If we're in  node mode, render the tree merge workspace
  if (isTreeMode && treeMergeResult) {
    const frameUnresolvedCount = treeMergeResult.conflicts.filter(
      (c) => !treeResolutions.has(c.path)
    ).length;

    const containerVariants = prefersReducedMotion
      ? reducedMotion.fullScreenEnter
      : fullScreenEnter;

    const framePreviewPaths = getPreviewPaths();

    return (
      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="relative flex h-screen flex-col bg-[var(--surface-app)]"
      >
        {/* Merge Review Dialog (tree mode) */}
        <MergeReviewDialog
          open={showReviewDialog}
          onClose={() => setShowReviewDialog(false)}
          onConfirm={handleNodeConfirmMerge}
          checks={getTreeMergeChecks()}
          message={message}
          sourceBranch={sourceBranch || 'source'}
          targetBranch={targetBranch || 'main'}
          nodeCount={framePreviewPaths.length}
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
          onCommit={handleNodeOpenReview}
          onCancel={handleCancel}
          canCommit={treeCanCommit}
          onClose={onClose}
        />

        {/* Main Content — 3-column layout */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden flex">
            {/* Left: MergeNavigator (200px) */}
            <MergeNavigator
              mergeResult={treeMergeResult}
              resolutions={treeResolutions}
              keepSource={keepSourceNodes}
              keepTarget={keepTargetNodes}
              activeNodeId={activeNodeId}
              onSelectNode={setActiveNodeId}
              onToggleKeepSource={toggleKeepSourceNode}
              onToggleKeepTarget={toggleKeepTargetNode}
            />

            {/* Center: Conflict cards + auto-kept */}
            <div ref={scrollContainerRef} className="flex-1 overflow-auto p-[var(--space-page)]">
              {treeError && (
                <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  {treeError}
                </div>
              )}

              {/* Conflicts */}
              {treeMergeResult.conflicts.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--diff-removed-accent)]">
                    Conflicts ({treeMergeResult.conflicts.length})
                  </h3>
                  <div className="space-y-3">
                    {treeMergeResult.conflicts.map((conflict) => {
                      // Look up source/target TreeNodes for the ConflictCard
                      const sourceNode = semanticData.source
                        ? findNodeByPath(semanticData.source.trees, conflict.path)
                        : null;
                      const targetNode = semanticData.target
                        ? findNodeByPath(semanticData.target.trees, conflict.path)
                        : null;
                      // Build a ConflictCard-compatible conflict object
                      const cardConflict = {
                        treeId: conflict.path,
                        sourceNode: sourceNode ?? { key: conflict.path, slots: {}, children: [] },
                        targetNode: targetNode ?? { key: conflict.path, slots: {}, children: [] },
                        slotConflicts: conflict.slotConflicts,
                      };
                      return (
                        <div key={conflict.path} id={`merge-tree-${conflict.path}`}>
                          <ConflictCard
                            conflict={cardConflict}
                            resolution={treeResolutions.get(conflict.path) ?? null}
                            onResolve={(res) => resolveTreeConflict(conflict.path, res)}
                            isActive={activeNodeId === conflict.path}
                            onSelect={() => setActiveNodeId(conflict.path)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Auto-kept nodes */}
              {treeMergeResult.autoKept.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--diff-added-accent)]">
                    Auto-kept ({treeMergeResult.autoKept.length})
                  </h3>
                  <div className="space-y-2">
                    {treeMergeResult.autoKept.map((path) => {
                      const node = findNode(semanticData.source, semanticData.target, path);
                      return (
                        <div
                          key={path}
                          className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 opacity-50"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="rounded bg-[var(--surface-app)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--stroke-divider)]">
                              {node?.key ?? path}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                              {path}
                            </span>
                          </div>
                          {node && (
                            <div className="px-2 font-mono text-[11px] text-[var(--text-tertiary)]">
                              {Object.entries(node.slots).map(([key, value]) => (
                                <div key={key} className="leading-relaxed">
                                  <span style={{ color: '#7aa2f7' }}>{key}</span>
                                  <span style={{ color: '#89ddff' }}>: </span>
                                  <span style={{ color: '#9ece6a' }}>
                                    {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Source-only nodes */}
              {treeMergeResult.onlyInSource.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--accent-commit)]">
                    Source only ({treeMergeResult.onlyInSource.length})
                  </h3>
                  <div className="space-y-2">
                    {treeMergeResult.onlyInSource.map((path) => {
                      const isKept = keepSourceNodes.has(path);
                      const node = semanticData.source
                        ? findNodeByPath(semanticData.source.trees, path)
                        : null;
                      return (
                        <div
                          key={path}
                          className={`rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 transition-opacity ${
                            isKept ? '' : 'opacity-40'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="checkbox"
                              checked={isKept}
                              onChange={() => toggleKeepSourceNode(path)}
                              className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-commit)]"
                            />
                            <span className="rounded bg-[var(--surface-app)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--stroke-divider)]">
                              {node?.key ?? path}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                              {path}
                            </span>
                          </div>
                          {node && (
                            <div className="px-2 font-mono text-[11px] text-[var(--text-tertiary)]">
                              {Object.entries(node.slots).map(([key, value]) => (
                                <div key={key} className="leading-relaxed">
                                  <span style={{ color: '#7aa2f7' }}>{key}</span>
                                  <span style={{ color: '#89ddff' }}>: </span>
                                  <span style={{ color: '#9ece6a' }}>
                                    {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target-only nodes */}
              {treeMergeResult.onlyInTarget.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--accent-commit)]">
                    Target only ({treeMergeResult.onlyInTarget.length})
                  </h3>
                  <div className="space-y-2">
                    {treeMergeResult.onlyInTarget.map((path) => {
                      const isKept = keepTargetNodes.has(path);
                      const node = semanticData.target
                        ? findNodeByPath(semanticData.target.trees, path)
                        : null;
                      return (
                        <div
                          key={path}
                          className={`rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3 transition-opacity ${
                            isKept ? '' : 'opacity-40'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="checkbox"
                              checked={isKept}
                              onChange={() => toggleKeepTargetNode(path)}
                              className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent-commit)]"
                            />
                            <span className="rounded bg-[var(--surface-app)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--stroke-divider)]">
                              {node?.key ?? path}
                            </span>
                            <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                              {path}
                            </span>
                          </div>
                          {node && (
                            <div className="px-2 font-mono text-[11px] text-[var(--text-tertiary)]">
                              {Object.entries(node.slots).map(([key, value]) => (
                                <div key={key} className="leading-relaxed">
                                  <span style={{ color: '#7aa2f7' }}>{key}</span>
                                  <span style={{ color: '#89ddff' }}>: </span>
                                  <span style={{ color: '#9ece6a' }}>
                                    {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No conflicts state */}
              {treeMergeResult.conflicts.length === 0 &&
                treeMergeResult.autoKept.length === 0 &&
                treeMergeResult.onlyInSource.length === 0 &&
                treeMergeResult.onlyInTarget.length === 0 && (
                  <EmptyState
                    icon={GitMerge}
                    title="Nothing to merge"
                    description="Both branches have identical tree content."
                    customIcon={<MergeIllustration />}
                  />
                )}
            </div>

            {/* Right: Merge context panel (280px) */}
            <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-[var(--stroke-divider)] bg-[var(--surface-panel)] p-4 overflow-y-auto">
              {/* Source / Target info */}
              <div className="mb-4">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  Merge Info
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-tertiary)]">Source</span>
                    <span className="font-mono text-[var(--text-secondary)] truncate ml-2 max-w-[160px]">
                      {sourceBranch || sourceHash?.slice(0, 12) || '?'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-tertiary)]">Target</span>
                    <span className="font-mono text-[var(--text-secondary)] truncate ml-2 max-w-[160px]">
                      {targetBranch || targetHash?.slice(0, 12) || '?'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Validation summary */}
              <div className="mb-4">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  Validation
                </h4>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        frameUnresolvedCount === 0
                          ? 'bg-[var(--diff-added-accent)]'
                          : 'bg-[var(--diff-removed-accent)]'
                      }`}
                    />
                    <span className="text-[var(--text-secondary)]">
                      {frameUnresolvedCount === 0
                        ? 'All conflicts resolved'
                        : `${frameUnresolvedCount} unresolved`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        message.trim()
                          ? 'bg-[var(--diff-added-accent)]'
                          : 'bg-[var(--diff-removed-accent)]'
                      }`}
                    />
                    <span className="text-[var(--text-secondary)]">
                      {message.trim() ? 'Message provided' : 'Message required'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tree count summary */}
              <div className="mb-4">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                  Summary
                </h4>
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span>Auto-kept</span>
                    <span className="font-mono">{treeMergeResult.autoKept.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Conflicts</span>
                    <span className="font-mono">{treeMergeResult.conflicts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Source only</span>
                    <span className="font-mono">{treeMergeResult.onlyInSource.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target only</span>
                    <span className="font-mono">{treeMergeResult.onlyInTarget.length}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[var(--stroke-divider)]">
                    <span className="font-medium">Preview total</span>
                    <span className="font-mono font-medium">{framePreviewPaths.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <MergePreview expanded={previewExpanded} onToggle={togglePreview} />
        </div>
      </motion.div>
    );
  }

  // ============================================================================
  // ContentNode-based merge (legacy fallback)
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
  const summary = prepared ? computeMergeSummary(prepared as unknown as MergeResult) : null;
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
        nodeCount={getPreviewNodes().length}
        summary={summary}
        serverChecksLoading={serverChecksLoading}
        onBackToCanvas={handleCloseOrNavigate}
        prepared={prepared as unknown as MergeResult}
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
            {diffMode === 'tree' &&
              hasSemanticData &&
              semanticData.base &&
              semanticData.source &&
              semanticData.target && (
                <MergeSection
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
