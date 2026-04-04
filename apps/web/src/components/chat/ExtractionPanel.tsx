'use client';

/**
 * ExtractionPanel — Gold Step top-level phase router.
 *
 * Collapsed rail (40px): icon + badge + vertical label
 * Expanded (380px): header + PhaseTabs + phase content
 *
 * Refactored from 356 LOC → ~200 LOC:
 *  - Keyboard shortcuts → useKeyboardNav
 *  - Store reads split across phaseStore / draftStore / hoverStore
 *  - Added ✏ pencil button (edit entry path)
 */

import { motion } from 'framer-motion';
import { GitCommit, LayoutGrid, Loader2, Pencil, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useKeyboardNav } from '@/hooks/useKeyboardNav';
import { useCommandStore } from '@/store/commandStore';
import { useCommitStore } from '@/store/commitStore';
import { useDraftStore } from '@/store/draftStore';
import { usePhaseStore } from '@/store/phaseStore';
import { IdleView } from './IdleView';
import { PhaseTabs } from './PhaseTabs';
import { ReviewView } from './ReviewView';
import { TriageView } from './TriageView';
import { YOpsFeed } from './YOpsFeed';

// ── Constants ──

const COLLAPSED_WIDTH = 40;
const DEFAULT_WIDTH = 380;

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
      <span
        className="text-[9px] font-medium uppercase tracking-widest text-[var(--text-tertiary)]"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {isExtracting ? 'Processing...' : 'Knowledge'}
      </span>
    </div>
  );
}

// ── Main ──

export function ExtractionPanel({ customWidth }: { customWidth?: number }) {
  const router = useRouter();

  // New stores
  const _phase = usePhaseStore((s) => s.phase);
  const _viewTab = usePhaseStore((s) => s.viewTab);
  const panelMode = usePhaseStore((s) => s.panelMode);
  const _entryPath = usePhaseStore((s) => s.entryPath);
  const _setPanelMode = usePhaseStore((s) => s.setPanelMode);
  const setPhase = usePhaseStore((s) => s.setPhase);
  const setEntryPath = usePhaseStore((s) => s.setEntryPath);
  const _setViewTab = usePhaseStore((s) => s.setViewTab);
  const togglePanel = usePhaseStore((s) => s.togglePanel);

  // Draft store (mock → Person A replaces)
  const draft = useDraftStore((s) => s.draft);
  const isExtracting = useDraftStore((s) => s.isExtracting);

  // Commit store
  const committedNodeSnapshot = useCommitStore((s) => s.committedNodeSnapshot);
  const lastCommitHash = useCommitStore((s) => s.lastCommitHash);
  const commitBranch = useCommitStore((s) => s.commitBranch);
  const projectId = useCommitStore((s) => s.projectId);
  const commitNodes = useCommitStore((s) => s.commitNodes);

  // Draft store
  const feedYops = useDraftStore((s) => s.feedYops);

  // Phase (use phaseStore directly)
  const extractionPhase = usePhaseStore((s) => s.phase);

  const nodeCount = draft.trees.length;
  const committedNodes = useMemo(
    () => Object.values(committedNodeSnapshot),
    [committedNodeSnapshot]
  );
  // Commit handler
  const handleCommit = useCallback(
    async (message: string) => {
      useCommitStore.setState({ isCommitting: true });
      try {
        const result = await commitNodes(message);
        setPhase('idle');
        const commitUrl = projectId
          ? `/project/${projectId}/commit/${encodeURIComponent(result.hash)}`
          : null;
        toast.success(`Committed to ${commitBranch}`, {
          description: result.hash.slice(0, 16),
          action: commitUrl
            ? { label: 'View commit', onClick: () => router.push(commitUrl) }
            : undefined,
        });
      } catch {
        // commitNodes already sets isCommitting: false on error
      }
    },
    [commitNodes, commitBranch, projectId, router, setPhase]
  );

  // Extract handler
  const handleExtract = () => {
    window.dispatchEvent(new CustomEvent('t3x:extract-requested'));
  };

  // Pencil — edit committed YAML directly
  const handlePencilEdit = useCallback(() => {
    const snapshot = useCommitStore.getState().committedNodeSnapshot;
    const trees = Object.values(snapshot);
    if (trees.length === 0) return;
    useDraftStore.getState().setDraft({ trees, relations: [] });
    setEntryPath('edit');
    setPhase('review');
  }, [setEntryPath, setPhase]);

  // Keyboard shortcuts — injected actions
  useKeyboardNav({
    undo: useCommandStore.getState().undo,
    redo: useCommandStore.getState().redo,
    commit: () => handleCommit(''),
    startExtraction: handleExtract,
  });

  // Phase tab clicks
  const handleTabClick = (tab: 'yops' | 'triage' | 'review') => {
    if (tab === 'triage' && (extractionPhase === 'review' || extractionPhase === 'committing')) {
      setPhase('triage');
    } else if (tab === 'review' && extractionPhase === 'triage') {
      setPhase('review');
    }
  };

  const showPhaseTabs = extractionPhase !== 'idle';
  const targetWidth = panelMode === 'collapsed' ? COLLAPSED_WIDTH : (customWidth ?? DEFAULT_WIDTH);
  const hasCommittedNodes = Object.keys(committedNodeSnapshot).length > 0;
  const turnsSinceLastExtract = useDraftStore((s) => s.turnsSinceLastExtract);

  return (
    <motion.div
      animate={{ width: targetWidth }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex h-full flex-shrink-0 flex-col border-l border-[var(--stroke-default)] bg-[var(--surface-panel)] overflow-hidden"
    >
      {panelMode === 'collapsed' && (
        <CollapsedRail nodeCount={nodeCount} isExtracting={isExtracting} onExpand={togglePanel} />
      )}

      {panelMode !== 'collapsed' && (
        <div className="flex h-full flex-col min-w-0">
          {/* Header */}
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
              {extractionPhase === 'idle' && !isExtracting && (
                <div className="flex items-center gap-1 ml-1">
                  {/* ✏ Pencil — edit committed YAML */}
                  {hasCommittedNodes && (
                    <button
                      type="button"
                      onClick={handlePencilEdit}
                      className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[var(--hover-bg)] transition-colors"
                      title="Edit committed YAML"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {/* Extract button */}
                  <button
                    type="button"
                    onClick={handleExtract}
                    className="flex items-center gap-1 rounded-full bg-[var(--accent-extract)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-extract)] hover:bg-[var(--accent-extract)]/20 transition-colors"
                  >
                    <Sparkles className="h-3 w-3" />
                    Extract
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={togglePanel}
              className="rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              aria-label="Collapse panel"
            >
              x
            </button>
          </div>

          {/* Phase tabs */}
          {showPhaseTabs && (
            <PhaseTabs currentPhase={extractionPhase} onTabClick={handleTabClick} />
          )}

          {/* Content — routed by extractionPhase (old store) during migration */}
          {extractionPhase === 'idle' && (
            <IdleView
              committedNodes={committedNodes}
              commitHash={lastCommitHash}
              turnsSinceLastExtract={turnsSinceLastExtract}
            />
          )}

          {extractionPhase === 'yops' && (
            <YOpsFeed
              ops={feedYops as import('@t3x-dev/core').YOp[]}
              onGoToTriage={() => setPhase('triage')}
            />
          )}

          {extractionPhase === 'triage' && <TriageView onGoToReview={() => setPhase('review')} />}

          {(extractionPhase === 'review' || extractionPhase === 'committing') && (
            <ReviewView />
          )}
        </div>
      )}
    </motion.div>
  );
}
