'use client';

/**
 * MergeWorkspace - Full-screen merge workspace container
 *
 * Uses tree-based merge via treeMergeResult from prepareMerge().
 */

import type { SemanticContent } from '@t3x-dev/core';
import { prepareMerge } from '@t3x-dev/core';
import { motion } from 'framer-motion';
import { GitMerge, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MergeIllustration } from '@/components/illustrations/MergeIllustration';
import { EmptyState } from '@/components/ui/empty-state';
import { useCanvasNodeActions } from '@/hooks/useCanvasNodeActions';
import { useCreateMergeCommit } from '@/hooks/useCreateMergeCommit';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTerminology } from '@/hooks/useTerminology';
import { fullScreenEnter, reducedMotion } from '@/lib/motion';
import { fetchCommitByHash } from '@/queries/commitByHash';
import { useMergeWorkspaceStore } from '@/store/mergeWorkspaceStore';
import { ConflictCard } from './ConflictCard';
import { MergeActionBar } from './MergeActionBar';
import { MergeContextPanel } from './MergeContextPanel';
import { MergeNavigator } from './MergeNavigator';
import { MergePreview } from './MergePreview';
import { MergeReviewDialog } from './MergeReviewDialog';
import { buildMergedContent, findNode, findNodeByPath } from './mergeWorkspaceHelpers';
import { useMergeKeyboard } from './useMergeKeyboard';

interface MergeWorkspaceProps {
  projectId: string;
  onClose: () => void;
  /** Called after a successful merge commit with the new commit hash */
  onMergeCommitted?: (commitHash: string) => void;
}

export function MergeWorkspace({ projectId, onClose, onMergeCommitted }: MergeWorkspaceProps) {
  const { create: createMergeCommit } = useCreateMergeCommit();
  const { load: loadCanvas } = useCanvasNodeActions();
  const {
    message,
    isDirty,
    saveStatus,
    sourceBranch,
    targetBranch,
    sourceHash,
    targetHash,
    saveDraft,
    cancelMerge,
    setMessage,
    previewExpanded,
    togglePreview,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Tree merge loading state
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [_commitMergeLoading, setCommitMergeLoading] = useState(false);

  // Semantic data for tree merge
  const [semanticData, setSemanticData] = useState<{
    base?: SemanticContent;
    source?: SemanticContent;
    target?: SemanticContent;
  }>({});

  // Fetch commits and prepare tree merge
  useEffect(() => {
    const sh = sourceHash;
    const th = targetHash;
    if (!sh || !th) return;
    let cancelled = false;

    setTreeLoading(true);
    setTreeError(null);

    Promise.all([fetchCommitByHash(sh), fetchCommitByHash(th)])
      .then(([srcCommit, tgtCommit]) => {
        if (cancelled) return;

        const sourceContent = srcCommit.content;
        const targetContent = tgtCommit.content;

        // Store semantic data for tree merge UI
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
            fetchCommitByHash(baseParent)
              .then((baseCommit) => {
                if (cancelled) return;
                const result = prepareMerge(baseCommit.content, sourceContent, targetContent);
                setTreeMergeResult(result);
                setTreeLoading(false);
                // tree merge prepared
              })
              .catch(() => {
                if (cancelled) return;
                // No base available, use empty base (2-way comparison)
                const emptyBase: SemanticContent = { trees: [], relations: [] };
                const result = prepareMerge(emptyBase, sourceContent, targetContent);
                setTreeMergeResult(result);
                setTreeLoading(false);
                // tree merge prepared
              });
          } else {
            // No parents at all, use empty base
            const emptyBase: SemanticContent = { trees: [], relations: [] };
            const result = prepareMerge(emptyBase, sourceContent, targetContent);
            setTreeMergeResult(result);
            setTreeLoading(false);
          }
        } else {
          // No tree data, fall back to node mode
          setTreeLoading(false);
          // no tree data or error — will show empty state
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setTreeError(err instanceof Error ? err.message : 'Failed to load commits for tree merge');
        setTreeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceHash, targetHash, setTreeMergeResult]);

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
  useMergeKeyboard({
    saveDraft,
    canCommit: () => allTreeConflictsResolved() && message.trim().length > 0,
    handleCancel,
    showReviewDialog,
    setShowReviewDialog,
    setSidebarCollapsed: () => {},
    isTreeMode: true,
    allTreeConflictsResolved,
    message,
  });

  // Store committed hash so the dialog's celebration timer can navigate to it
  const committedHashRef = useRef<string | null>(null);

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

      const result = await createMergeCommit({
        projectId,
        content: {
          trees: mergedContent.trees,
          relations: mergedContent.relations,
        },
        branch: targetBranch || 'main',
        message: message || 'Tree merge',
        parents: [sourceHash, targetHash],
        author: { type: 'human', name: 'User' },
        provenance: { method: 'merge' },
      });

      // Reload canvas data to show the new merge commit
      void loadCanvas(projectId);

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
    loadCanvas,
  ]);

  // Tree merge can-commit check
  const treeCanCommit =
    treeMergeResult !== null && allTreeConflictsResolved() && message.trim().length > 0;

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

  // Tree merge workspace
  if (treeMergeResult) {
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
                <div className="mb-4 rounded-lg border border-[var(--status-error)]/30 bg-[var(--status-error-muted)] p-3 text-sm text-[var(--status-error)]">
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
                                  <span className="text-[var(--yaml-key,#2563eb)]">{key}</span>
                                  <span className="text-[var(--yaml-punctuation,#6b7280)]">: </span>
                                  <span className="text-[var(--yaml-string,#16a34a)]">
                                    {typeof value === 'string'
                                      ? `"${value}"`
                                      : JSON.stringify(value)}
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
                                  <span className="text-[var(--yaml-key,#2563eb)]">{key}</span>
                                  <span className="text-[var(--yaml-punctuation,#6b7280)]">: </span>
                                  <span className="text-[var(--yaml-string,#16a34a)]">
                                    {typeof value === 'string'
                                      ? `"${value}"`
                                      : JSON.stringify(value)}
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
                                  <span className="text-[var(--yaml-key,#2563eb)]">{key}</span>
                                  <span className="text-[var(--yaml-punctuation,#6b7280)]">: </span>
                                  <span className="text-[var(--yaml-string,#16a34a)]">
                                    {typeof value === 'string'
                                      ? `"${value}"`
                                      : JSON.stringify(value)}
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
            <MergeContextPanel
              sourceBranch={sourceBranch}
              targetBranch={targetBranch}
              sourceHash={sourceHash}
              targetHash={targetHash}
              treeMergeResult={treeMergeResult}
              unresolvedCount={frameUnresolvedCount}
              message={message}
              previewTotalCount={framePreviewPaths.length}
            />
          </div>

          {/* Preview Panel */}
          <MergePreview expanded={previewExpanded} onToggle={togglePreview} />
        </div>
      </motion.div>
    );
  }

  // No tree merge result — show empty state
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
