'use client';

import type { TreeNode } from '@t3x-dev/core';
import { motion } from 'framer-motion';
import { GitCommit, LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';
import { AdvisoryPanel } from './AdvisoryPanel';
import { CommitBar } from './CommitBar';
import { IdleView } from './IdleView';
import { PhaseTabs } from './PhaseTabs';
import { TriageView } from './TriageView';
import { YAMLView } from './YAMLView';
import { YOpsFeed } from './YOpsFeed';

// ── Panel widths ──

const PANEL_WIDTHS = {
  collapsed: 40,
  expanded: 380,
};

// ── Collapsed rail ──

function CollapsedRail({
  nodeCount,
  isExtracting,
  onExpand,
}: {
  nodeCount: number;
  isExtracting: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center py-4 gap-3">
      <button
        type="button"
        onClick={onExpand}
        className="flex flex-col items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        aria-label="Expand extraction panel"
      >
        {isExtracting ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-commit)]" />
        ) : (
          <LayoutGrid className="h-4 w-4" />
        )}
        {nodeCount > 0 && (
          <span className="rounded-full bg-[var(--accent-commit)] px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
            {nodeCount}
          </span>
        )}
      </button>
      {/* Vertical label */}
      <span
        className="text-[9px] font-medium uppercase tracking-widest text-[var(--text-tertiary)]"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {isExtracting ? 'Processing...' : 'Knowledge'}
      </span>
    </div>
  );
}

// ── Main ExtractionPanel ──

export function ExtractionPanel({ customWidth }: { customWidth?: number }) {
  const router = useRouter();

  // Panel chrome
  const panelMode = useExtractionPanelStore((s) => s.panelMode);
  const draft = useExtractionPanelStore((s) => s.draft);
  const isExtracting = useExtractionPanelStore((s) => s.isExtracting);
  const togglePanel = useExtractionPanelStore((s) => s.togglePanel);
  const manualEditedNodeIds = useExtractionPanelStore((s) => s.manualEditedNodeIds);

  // V6 Phase state
  const extractionPhase = useExtractionPanelStore((s) => s.extractionPhase);
  const pendingYOps = useExtractionPanelStore((s) => s.pendingYOps);
  const turnsSinceLastExtract = useExtractionPanelStore((s) => s.turnsSinceLastExtract);
  const onExtractRequested = useExtractionPanelStore((s) => s.onExtractRequested);

  // V6 Phase transitions
  const completeYOps = useExtractionPanelStore((s) => s.completeYOps);
  const goToReview = useExtractionPanelStore((s) => s.goToReview);
  const goBackToTriage = useExtractionPanelStore((s) => s.goBackToTriage);
  const startCommitting = useExtractionPanelStore((s) => s.startCommitting);
  const completeCommit = useExtractionPanelStore((s) => s.completeCommit);

  // Commit state
  const committedNodeSnapshot = useExtractionPanelStore((s) => s.committedNodeSnapshot);
  const lastCommitHash = useExtractionPanelStore((s) => s.lastCommitHash);
  const commitBranch = useExtractionPanelStore((s) => s.commitBranch);
  const projectId = useExtractionPanelStore((s) => s.projectId);
  const isCommitting = useExtractionPanelStore((s) => s.isCommitting);
  const commitNodes = useExtractionPanelStore((s) => s.commitNodes);


  const nodeCount = draft.trees.length;
  const committedNodes = useMemo(() => Object.values(committedNodeSnapshot), [committedNodeSnapshot]);
  const manualCount = manualEditedNodeIds.size;

  // Count all draft trees + total slots for commit bar (use draft directly, not selectPendingNodes)
  const { pendingNodeCount, pendingSlotCount } = useMemo(() => {
    if (extractionPhase !== 'review' && extractionPhase !== 'committing') {
      return { pendingNodeCount: 0, pendingSlotCount: 0 };
    }
    // Count all trees and their total slots (including children)
    let totalSlots = 0;
    function countSlots(trees: import('@t3x-dev/core').TreeNode[]) {
      for (const t of trees) {
        totalSlots += Object.keys(t.slots).length;
        if (t.children.length > 0) countSlots(t.children);
      }
    }
    countSlots(draft.trees);
    return { pendingNodeCount: draft.trees.length, pendingSlotCount: totalSlots };
  }, [extractionPhase, draft.trees]);

  const targetWidth =
    panelMode === 'collapsed' ? PANEL_WIDTHS.collapsed : (customWidth ?? PANEL_WIDTHS.expanded);

  // Panel mode setter
  const setPanelMode = useExtractionPanelStore((s) => s.setPanelMode);

  // Handle commit flow
  const handleCommit = useCallback(async (message: string) => {
    startCommitting();
    try {
      const result = await commitNodes(message);
      completeCommit();
      const commitUrl = projectId
        ? `/project/${projectId}/commit/${encodeURIComponent(result.hash)}`
        : null;
      toast.success(`Committed to ${commitBranch}`, {
        description: result.hash.slice(0, 16),
        action: commitUrl
          ? {
              label: 'View commit',
              onClick: () => router.push(commitUrl),
            }
          : undefined,
      });
    } catch {
      completeCommit();
    }
  }, [commitNodes, startCommitting, completeCommit, commitBranch, projectId, router]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when focused on input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Cmd+E: Start extraction
      if (e.metaKey && e.key === 'e') {
        e.preventDefault();
        if (extractionPhase === 'idle') {
          window.dispatchEvent(new CustomEvent('t3x:extract-requested'));
        }
        return;
      }

      // Cmd+]: Toggle panel
      if (e.metaKey && e.key === ']') {
        e.preventDefault();
        if (panelMode === 'collapsed') {
          setPanelMode('default');
        } else {
          setPanelMode('collapsed');
        }
        return;
      }

      // 'a' key: Accept All (in triage)
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey && extractionPhase === 'triage') {
        e.preventDefault();
        useExtractionPanelStore.getState().acceptAll();
        return;
      }

      // Enter: Next phase (triage → review)
      if (e.key === 'Enter' && !e.metaKey && extractionPhase === 'triage') {
        e.preventDefault();
        goToReview();
        return;
      }

      // Cmd+Enter: Commit (in review)
      if (e.metaKey && e.key === 'Enter' && extractionPhase === 'review') {
        e.preventDefault();
        handleCommit('');
        return;
      }

      // Escape: Back / cancel
      if (e.key === 'Escape' && extractionPhase === 'review') {
        e.preventDefault();
        goBackToTriage();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    extractionPhase,
    panelMode,
    setPanelMode,
    goToReview,
    goBackToTriage,
    handleCommit,
    onExtractRequested,
  ]);

  // Handle extract button
  const handleExtract = () => {
    // Dispatch custom event — ChatWorkspace listens for it
    window.dispatchEvent(new CustomEvent('t3x:extract-requested'));
  };

  // Phase tab navigation (only between done phases)
  const handleTabClick = (phase: 'yops' | 'triage' | 'review') => {
    if (phase === 'triage' && (extractionPhase === 'review' || extractionPhase === 'committing')) {
      goBackToTriage();
    } else if (phase === 'review' && extractionPhase === 'triage') {
      goToReview();
    }
  };

  // Determine if we should show phase tabs (not in idle)
  const showPhaseTabs = extractionPhase !== 'idle';

  return (
    <motion.div
      animate={{ width: targetWidth }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex h-full flex-shrink-0 flex-col border-l border-[var(--stroke-default)] bg-[var(--surface-panel)] overflow-hidden"
    >
      {/* Collapsed rail */}
      {panelMode === 'collapsed' && (
        <CollapsedRail nodeCount={nodeCount} isExtracting={isExtracting} onExpand={togglePanel} />
      )}

      {/* Expanded panel */}
      {panelMode !== 'collapsed' && (
        <div className="flex h-full flex-col min-w-0">
          {/* Panel header — changes based on extractionPhase */}
          <div className="flex items-center justify-between border-b border-[var(--stroke-default)] px-3 py-2">
            <div className="flex items-center gap-1.5">
              {isExtracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent-commit)]" />
              ) : (
                <GitCommit className="h-3.5 w-3.5 text-[var(--accent-commit)]" />
              )}
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {isExtracting
                  ? 'Extracting...'
                  : extractionPhase === 'review' || extractionPhase === 'committing'
                    ? 'Review'
                    : extractionPhase === 'triage'
                      ? 'Triage'
                      : 'Knowledge'}
              </span>
              {/* Node/slot count — always show when we have nodes */}
              {nodeCount > 0 && !isExtracting && (
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {extractionPhase === 'review' || extractionPhase === 'committing'
                    ? `${pendingNodeCount} nodes · ${pendingSlotCount} slots`
                    : extractionPhase === 'triage'
                      ? `${nodeCount} topics`
                      : String(nodeCount)}
                </span>
              )}
              {/* Phase badge pill */}
              {(extractionPhase === 'review' || extractionPhase === 'committing') && (
                <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  Review
                </span>
              )}
              {extractionPhase === 'triage' && (
                <span className="rounded-full bg-[var(--status-success)]/15 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--status-success)]">
                  Triage
                </span>
              )}
              {/* Extract button in idle phase */}
              {extractionPhase === 'idle' && !isExtracting && (
                <button
                  type="button"
                  onClick={handleExtract}
                  className="ml-1 flex items-center gap-1 rounded-full bg-[var(--accent-commit)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-commit)] hover:bg-[var(--accent-commit)]/20 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Extract
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={togglePanel}
              className="rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              aria-label="Collapse panel"
            >
              ×
            </button>
          </div>

          {/* Phase tabs (shown when not idle) */}
          {showPhaseTabs && (
            <PhaseTabs currentPhase={extractionPhase} onTabClick={handleTabClick} />
          )}

          {/* Content area — routed by extractionPhase */}
          {extractionPhase === 'idle' && (
            <IdleView
              committedNodes={committedNodes}
              commitHash={lastCommitHash}
              turnsSinceLastExtract={turnsSinceLastExtract}
            />
          )}

          {extractionPhase === 'yops' && (
            <YOpsFeed
              ops={pendingYOps as import('@t3x-dev/core').YOp[]}
              onComplete={completeYOps}
            />
          )}

          {extractionPhase === 'triage' && <TriageView onGoToReview={goToReview} />}

          {(extractionPhase === 'review' || extractionPhase === 'committing') && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Section header */}
              <div className="flex items-center justify-between px-3.5 py-[7px] text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] bg-[var(--hover-bg)]/30 border-b border-[var(--stroke-default)]">
                <span>Changes to commit</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <YAMLView />
              </div>
              <AdvisoryPanel />
              <CommitBar
                onCommit={handleCommit}
                nodeCount={pendingNodeCount}
                slotCount={pendingSlotCount}
                manualCount={manualCount}
                isCommitting={isCommitting || extractionPhase === 'committing'}
              />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
